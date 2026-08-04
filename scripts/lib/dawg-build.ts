import {
  DAWG_MAGIC,
  DAWG_VERSION,
  LAST_BIT,
  MAX_EDGES,
  TARGET_SHIFT,
  TERMINAL_BIT,
} from "../../lib/dawg";

/**
 * Daciuk's incremental construction of a minimal DAWG. Words must arrive in
 * the alphabet's own sort order, which for Swedish means Å Ä Ö last.
 */

interface Node {
  id: number;
  final: boolean;
  /** Insertion ordered, and insertion order is alphabet order. */
  edges: Map<number, Node>;
  /** Set once the node has been minimised and can no longer change. */
  frozen: boolean;
}

export class DawgBuilder {
  private readonly index: Map<string, number>;
  private readonly alphabet: readonly string[];
  private readonly root: Node;
  private readonly register = new Map<string, Node>();
  private previous = "";
  private nextId = 1;
  private wordCount = 0;

  constructor(alphabet: readonly string[]) {
    if (alphabet.length > 32) {
      throw new Error("dawg: alphabet must fit in 5 bits");
    }
    this.alphabet = alphabet;
    this.index = new Map(alphabet.map((c, i) => [c, i]));
    this.root = this.node();
  }

  private node(): Node {
    return { id: this.nextId++, final: false, edges: new Map(), frozen: false };
  }

  private signature(n: Node): string {
    let s = n.final ? "1" : "0";
    for (const [letter, child] of n.edges) s += `|${letter}:${child.id}`;
    return s;
  }

  /** Minimise the last-added branch below `state`, bottom up. */
  private replaceOrRegister(state: Node): void {
    const keys = Array.from(state.edges.keys());
    const lastKey = keys[keys.length - 1];
    if (lastKey === undefined) return;
    const child = state.edges.get(lastKey)!;
    if (child.edges.size > 0) this.replaceOrRegister(child);
    const sig = this.signature(child);
    const existing = this.register.get(sig);
    if (existing) {
      state.edges.set(lastKey, existing);
    } else {
      child.frozen = true;
      this.register.set(sig, child);
    }
  }

  add(word: string): void {
    if (word.length === 0) return;
    if (word === this.previous) return;
    if (this.compare(word, this.previous) < 0) {
      throw new Error(`dawg: words out of order (${this.previous} then ${word})`);
    }

    let common = 0;
    const maxCommon = Math.min(word.length, this.previous.length);
    while (common < maxCommon && word[common] === this.previous[common]) common++;

    // Walk to the end of the shared prefix.
    let state = this.root;
    for (let i = 0; i < common; i++) {
      state = state.edges.get(this.index.get(word[i]!)!)!;
    }
    if (state.edges.size > 0) this.replaceOrRegister(state);

    // Add the divergent suffix as fresh nodes.
    for (let i = common; i < word.length; i++) {
      const li = this.index.get(word[i]!);
      if (li === undefined) {
        throw new Error(`dawg: letter "${word[i]}" not in alphabet`);
      }
      const next = this.node();
      state.edges.set(li, next);
      state = next;
    }
    state.final = true;
    this.previous = word;
    this.wordCount++;
  }

  private compare(a: string, b: string): number {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const ra = this.index.get(a[i]!) ?? 999;
      const rb = this.index.get(b[i]!) ?? 999;
      if (ra !== rb) return ra - rb;
    }
    return a.length - b.length;
  }

  finish(): { edges: Uint32Array; nodeCount: number; wordCount: number } {
    this.replaceOrRegister(this.root);

    // Lay every node's edge run out contiguously. The root goes first so that
    // offset 0 is the root and can double as the "no edges" sentinel.
    const offsets = new Map<Node, number>();
    const order: Node[] = [];
    let cursor = 0;

    const assign = (n: Node): void => {
      if (n.edges.size === 0 || offsets.has(n)) return;
      offsets.set(n, cursor);
      cursor += n.edges.size;
      order.push(n);
      for (const child of n.edges.values()) assign(child);
    };
    assign(this.root);

    if (cursor > MAX_EDGES) {
      throw new Error(`dawg: ${cursor} edges exceeds the 25 bit target field`);
    }

    const edges = new Uint32Array(cursor);
    for (const n of order) {
      const base = offsets.get(n)!;
      // Sort by letter index so the reader can bail out early.
      const sorted = Array.from(n.edges.entries()).sort((a, b) => a[0] - b[0]);
      sorted.forEach(([letter, child], i) => {
        const target = child.edges.size === 0 ? 0 : offsets.get(child)!;
        edges[base + i] =
          letter |
          (child.final ? TERMINAL_BIT : 0) |
          (i === sorted.length - 1 ? LAST_BIT : 0) |
          (target << TARGET_SHIFT);
      });
    }

    return { edges, nodeCount: order.length, wordCount: this.wordCount };
  }

}

/** Wrap a finished edge array in the header the runtime reader expects. */
export function packDawg(
  edges: Uint32Array,
  alphabet: readonly string[],
): Buffer {
  const header = new Uint32Array(4 + alphabet.length);
  header[0] = DAWG_MAGIC;
  header[1] = DAWG_VERSION;
  header[2] = edges.length;
  header[3] = alphabet.length;
  alphabet.forEach((c, i) => {
    header[4 + i] = c.codePointAt(0)!;
  });
  return Buffer.concat([
    Buffer.from(header.buffer, header.byteOffset, header.byteLength),
    Buffer.from(edges.buffer, edges.byteOffset, edges.byteLength),
  ]);
}

/** Build a serialised DAWG from an unsorted word list. */
export function buildDawg(
  words: Iterable<string>,
  alphabet: readonly string[],
): { buffer: Buffer; nodeCount: number; wordCount: number; edgeCount: number } {
  const rank = new Map(alphabet.map((c, i) => [c, i]));
  const cmp = (a: string, b: string): number => {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const ra = rank.get(a[i]!) ?? 999;
      const rb = rank.get(b[i]!) ?? 999;
      if (ra !== rb) return ra - rb;
    }
    return a.length - b.length;
  };

  const sorted = Array.from(new Set(words)).sort(cmp);
  const b = new DawgBuilder(alphabet);
  for (const w of sorted) b.add(w);
  const { edges, nodeCount, wordCount } = b.finish();

  return {
    buffer: packDawg(edges, alphabet),
    nodeCount,
    wordCount,
    edgeCount: edges.length,
  };
}
