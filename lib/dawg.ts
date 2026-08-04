/**
 * A packed DAWG (minimal acyclic finite state automaton) over the dictionary.
 *
 * The whole automaton is one Uint32Array, so a language costs a few hundred
 * kilobytes of memory instead of the tens of megabytes a Set of strings would,
 * and letter-constrained searches walk the graph instead of scanning a list.
 *
 * Edge layout, 32 bits each:
 *   bits  0-4   letter index into the language's alphabet (0-28)
 *   bit   5     terminal: a word ends by taking this edge
 *   bit   6     last edge of this node's run
 *   bits  7-31  offset of the target node's first edge, 0 meaning no edges
 *
 * A node is the contiguous run of edges starting at its offset and ending at
 * the edge whose "last" bit is set. The root's run starts at offset 0, and the
 * root is never a target, so 0 doubles as the "no outgoing edges" sentinel.
 */

export const LETTER_MASK = 0x1f;
export const TERMINAL_BIT = 1 << 5;
export const LAST_BIT = 1 << 6;
export const TARGET_SHIFT = 7;
export const MAX_EDGES = 1 << 25;

export const DAWG_MAGIC = 0x4f52444b; // "ORDK"
export const DAWG_VERSION = 1;

export interface SearchOptions {
  minLength?: number;
  maxLength?: number;
  /** A letter that must appear in every result, as Hive's centre does. */
  required?: string;
  /** Hive reuses its seven letters freely; a wheel or a rack does not. */
  allowRepeats?: boolean;
  /** Stop once this many words have been collected. */
  limit?: number;
}

export class Dawg {
  readonly edges: Uint32Array;
  readonly alphabet: readonly string[];
  private readonly index: Map<string, number>;

  constructor(edges: Uint32Array, alphabet: readonly string[]) {
    this.edges = edges;
    this.alphabet = alphabet;
    this.index = new Map(alphabet.map((c, i) => [c, i]));
  }

  /**
   * Parse the binary produced by the build script.
   * Header: magic, version, edgeCount, alphabet length, then alphabet code
   * points, then the edge array.
   */
  static fromBuffer(buf: ArrayBuffer): Dawg {
    const head = new Uint32Array(buf, 0, 4);
    if (head[0] !== DAWG_MAGIC) throw new Error("dawg: bad magic");
    if (head[1] !== DAWG_VERSION) throw new Error("dawg: unsupported version");
    const edgeCount = head[2]!;
    const alphaLen = head[3]!;
    const alphaCodes = new Uint32Array(buf, 16, alphaLen);
    const alphabet = Array.from(alphaCodes, (c) => String.fromCodePoint(c));
    const edges = new Uint32Array(buf, 16 + alphaLen * 4, edgeCount);
    return new Dawg(edges, alphabet);
  }

  /** Walk one node's run looking for `letter`. Returns the edge index or -1. */
  private edgeAt(nodeOffset: number, letterIndex: number): number {
    const e = this.edges;
    let i = nodeOffset;
    // Edges within a node are sorted by letter, so we can stop early.
    for (;;) {
      const edge = e[i]!;
      const l = edge & LETTER_MASK;
      if (l === letterIndex) return i;
      if (l > letterIndex) return -1;
      if (edge & LAST_BIT) return -1;
      i++;
    }
  }

  has(word: string): boolean {
    if (word.length === 0) return false;
    let node = 0;
    for (let i = 0; i < word.length; i++) {
      const li = this.index.get(word[i]!);
      if (li === undefined) return false;
      const ei = this.edgeAt(node, li);
      if (ei < 0) return false;
      const edge = this.edges[ei]!;
      if (i === word.length - 1) return (edge & TERMINAL_BIT) !== 0;
      node = edge >>> TARGET_SHIFT;
      if (node === 0) return false;
    }
    return false;
  }

  /** True when any word in the dictionary starts with this prefix. */
  hasPrefix(prefix: string): boolean {
    let node = 0;
    for (let i = 0; i < prefix.length; i++) {
      const li = this.index.get(prefix[i]!);
      if (li === undefined) return false;
      const ei = this.edgeAt(node, li);
      if (ei < 0) return false;
      node = this.edges[ei]! >>> TARGET_SHIFT;
      if (node === 0) return i === prefix.length - 1;
    }
    return true;
  }

  /** Node offset reached by following `prefix`, or -1. Used by the Tiles AI. */
  nodeAfter(prefix: string): number {
    let node = 0;
    for (let i = 0; i < prefix.length; i++) {
      const li = this.index.get(prefix[i]!);
      if (li === undefined) return -1;
      const ei = this.edgeAt(node, li);
      if (ei < 0) return -1;
      node = this.edges[ei]! >>> TARGET_SHIFT;
      if (node === 0) return i === prefix.length - 1 ? 0 : -1;
    }
    return node;
  }

  /** Iterate the edges of a node. Used by search and by the Tiles AI. */
  forEachEdge(
    nodeOffset: number,
    fn: (letter: string, terminal: boolean, target: number) => void,
  ): void {
    if (nodeOffset === 0 && this.edges.length === 0) return;
    let i = nodeOffset;
    for (;;) {
      const edge = this.edges[i]!;
      fn(
        this.alphabet[edge & LETTER_MASK]!,
        (edge & TERMINAL_BIT) !== 0,
        edge >>> TARGET_SHIFT,
      );
      if (edge & LAST_BIT) return;
      i++;
    }
  }

  /**
   * Every word that can be built from `letters`. This is the engine behind
   * Hive, Rush's validator, Loop's boards and the Tiles opponent.
   */
  wordsFromLetters(letters: string, opts: SearchOptions = {}): string[] {
    const {
      minLength = 1,
      maxLength = 15,
      required,
      allowRepeats = false,
      limit = Infinity,
    } = opts;

    // Budget per letter index. Repeats get an effectively unlimited budget.
    const budget = new Int32Array(this.alphabet.length);
    for (const ch of letters) {
      const li = this.index.get(ch);
      if (li === undefined) continue;
      budget[li] = allowRepeats ? maxLength : budget[li]! + 1;
    }
    const requiredIndex =
      required === undefined ? -1 : (this.index.get(required) ?? -1);
    if (required !== undefined && requiredIndex < 0) return [];

    const out: string[] = [];
    const buf: string[] = [];
    const edges = this.edges;
    const alphabet = this.alphabet;

    const walk = (node: number, hasRequired: boolean): void => {
      if (out.length >= limit) return;
      let i = node;
      for (;;) {
        const edge = edges[i]!;
        const li = edge & LETTER_MASK;
        if (budget[li]! > 0) {
          budget[li]!--;
          buf.push(alphabet[li]!);
          const gotRequired = hasRequired || li === requiredIndex;
          const len = buf.length;
          if (
            edge & TERMINAL_BIT &&
            len >= minLength &&
            len <= maxLength &&
            (requiredIndex < 0 || gotRequired)
          ) {
            out.push(buf.join(""));
          }
          const target = edge >>> TARGET_SHIFT;
          if (target !== 0 && len < maxLength && out.length < limit) {
            walk(target, gotRequired);
          }
          buf.pop();
          budget[li]!++;
        }
        if (edge & LAST_BIT) return;
        i++;
        if (out.length >= limit) return;
      }
    };

    if (edges.length > 0) walk(0, requiredIndex < 0);
    return out;
  }

  /** Every word matching a pattern where `.` is any letter. */
  matchPattern(pattern: string, limit = Infinity): string[] {
    const out: string[] = [];
    const buf: string[] = [];
    const edges = this.edges;
    const alphabet = this.alphabet;
    const n = pattern.length;

    const walk = (node: number, depth: number): void => {
      if (out.length >= limit) return;
      const want = pattern[depth]!;
      const wantIndex = want === "." ? -1 : (this.index.get(want) ?? -2);
      if (wantIndex === -2) return;
      let i = node;
      for (;;) {
        const edge = edges[i]!;
        const li = edge & LETTER_MASK;
        if (wantIndex < 0 || li === wantIndex) {
          buf.push(alphabet[li]!);
          if (depth === n - 1) {
            if (edge & TERMINAL_BIT) out.push(buf.join(""));
          } else {
            const target = edge >>> TARGET_SHIFT;
            if (target !== 0) walk(target, depth + 1);
          }
          buf.pop();
        }
        if (edge & LAST_BIT) return;
        i++;
        if (out.length >= limit) return;
      }
    };

    if (n > 0 && edges.length > 0) walk(0, 0);
    return out;
  }
}
