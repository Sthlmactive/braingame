import { BLACK, entriesOf, type Entry } from "../../lib/mini";
import type { Rng } from "../../lib/rng";

/**
 * Fill a crossword pattern from a word list.
 *
 * Backtracking with constraint propagation. The pool is indexed by (position,
 * letter) as bitsets, so "which words match A??E?" is a few ANDs over
 * Uint32Arrays rather than a scan of several thousand strings. Slots are
 * chosen by minimum remaining values, and the search abandons a branch the
 * moment any crossing slot drops to zero candidates.
 *
 * Every letter in a mini is checked twice, so a fill either works completely
 * or not at all; there is no partially acceptable grid.
 */

/** One length's worth of pool, indexed for fast matching. */
export class LetterIndex {
  readonly words: string[];
  readonly length: number;
  readonly wordCount: number;
  private readonly blocks: number;
  /** bits[position][letterCode] -> bitset of word indexes. */
  private readonly bits: Map<string, Uint32Array>[];
  readonly all: Uint32Array;
  /** Membership, for the leaf check. `includes` would be O(n) in a hot loop. */
  readonly lookup: Set<string>;

  constructor(words: string[], length: number) {
    this.words = words;
    this.lookup = new Set(words);
    this.length = length;
    this.wordCount = words.length;
    this.blocks = Math.ceil(words.length / 32);
    this.bits = Array.from({ length }, () => new Map<string, Uint32Array>());

    for (let w = 0; w < words.length; w++) {
      const word = words[w]!;
      for (let p = 0; p < length; p++) {
        const ch = word[p]!;
        let set = this.bits[p]!.get(ch);
        if (!set) {
          set = new Uint32Array(this.blocks);
          this.bits[p]!.set(ch, set);
        }
        set[w >>> 5]! |= 1 << (w & 31);
      }
    }

    this.all = new Uint32Array(this.blocks);
    for (let w = 0; w < words.length; w++) this.all[w >>> 5]! |= 1 << (w & 31);
  }

  /** Words matching a pattern, where "." is any letter. Returns a new bitset. */
  match(pattern: string): Uint32Array {
    const out = new Uint32Array(this.all);
    for (let p = 0; p < this.length; p++) {
      const ch = pattern[p]!;
      if (ch === ".") continue;
      const set = this.bits[p]!.get(ch);
      if (!set) return new Uint32Array(this.blocks);
      for (let b = 0; b < this.blocks; b++) out[b]! &= set[b]!;
    }
    return out;
  }
}

export function popcount(set: Uint32Array): number {
  let n = 0;
  for (let i = 0; i < set.length; i++) {
    let v = set[i]!;
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    n += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  return n;
}

function members(set: Uint32Array, limit = Infinity): number[] {
  const out: number[] = [];
  for (let i = 0; i < set.length && out.length < limit; i++) {
    let v = set[i]!;
    while (v !== 0) {
      const bit = v & -v;
      out.push(i * 32 + Math.log2(bit >>> 0));
      v ^= bit;
      if (out.length >= limit) break;
    }
  }
  return out;
}

export interface SolveResult {
  grid: string | null;
  /** Backtracking steps spent, so a caller can see how hard it was. */
  steps: number;
}

/**
 * Fill `pattern` from `pools`, keyed by entry length.
 *
 * `rng` randomises candidate order, so a seeded run produces a varied bank and
 * the build stays deterministic. `maxSteps` caps the search: a pattern that
 * will not fill is abandoned rather than allowed to hang the build.
 */
export function solveGrid(
  pattern: string,
  pools: Map<number, LetterIndex>,
  rng: Rng,
  maxSteps = 40_000,
): SolveResult {
  const entries = entriesOf(pattern);
  const cells = [...pattern];
  const used = new Set<string>();
  let steps = 0;

  const patternFor = (entry: Entry): string =>
    entry.cells.map((i) => (cells[i] === BLACK ? "." : cells[i]!)).join("");

  const filled = (entry: Entry): boolean =>
    entry.cells.every((i) => cells[i] !== BLACK && cells[i] !== ".");

  /**
   * Every slot that is now full holds a real word, and no two hold the same
   * one.
   *
   * A slot can be completed implicitly, by the letters of its crossings rather
   * than by being chosen, and such a slot never passes through the candidate
   * loop. Without this it can end up holding a non-word, or a second copy of a
   * word already in the grid. Checked on every placement rather than at the
   * leaf, so a dead branch is abandoned immediately instead of after a full
   * fill has been built and thrown away.
   */
  const complete = (): boolean => {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!filled(entry)) continue;
      const word = entry.cells.map((i) => cells[i]!).join("");
      const index = pools.get(entry.cells.length);
      if (!index || !index.lookup.has(word)) return false;
      if (seen.has(word)) return false;
      seen.add(word);
    }
    return true;
  };

  const search = (): boolean => {
    if (steps++ > maxSteps) return false;

    // Minimum remaining values: the most constrained slot first, and a bail
    // out the moment anything is unsatisfiable.
    let best: { entry: Entry; set: Uint32Array; count: number } | null = null;
    for (const entry of entries) {
      if (filled(entry)) continue;
      const index = pools.get(entry.cells.length);
      if (!index) return false;
      const set = index.match(patternFor(entry));
      const count = popcount(set);
      if (count === 0) return false;
      if (!best || count < best.count) best = { entry, set, count };
    }
    if (!best) return true; // every slot filled, and the invariant held

    const index = pools.get(best.entry.cells.length)!;
    const candidates = members(best.set);
    // Fisher-Yates from the seed, so order varies per puzzle and repeats
    // exactly on a rebuild.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
    }

    const before = best.entry.cells.map((i) => cells[i]!);
    for (const c of candidates) {
      const word = index.words[c]!;
      // A grid may never repeat a word, across or down.
      if (used.has(word)) continue;
      used.add(word);
      best.entry.cells.forEach((cell, k) => {
        cells[cell] = word[k]!;
      });
      if (complete() && search()) return true;
      used.delete(word);
      best.entry.cells.forEach((cell, k) => {
        cells[cell] = before[k]!;
      });
      if (steps > maxSteps) return false;
    }
    return false;
  };

  // Unfilled white cells start as ".", black squares stay black.
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== BLACK) cells[i] = ".";
  }

  const ok = search();
  return { grid: ok ? cells.join("") : null, steps };
}
