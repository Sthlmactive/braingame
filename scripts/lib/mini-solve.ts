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

  /** Which letters appear at `position` among the words in `set`. */
  lettersAt(set: Uint32Array, position: number): Set<string> {
    const out = new Set<string>();
    for (const [ch, bitsFor] of this.bits[position]!) {
      for (let b = 0; b < this.blocks; b++) {
        if ((set[b]! & bitsFor[b]!) !== 0) {
          out.add(ch);
          break;
        }
      }
    }
    return out;
  }

  /**
   * Words whose letter at each position is one of the letters allowed there.
   * The per-position form of `match`: a pattern fixes one letter, this fixes a
   * set of them, which is what a crossing actually constrains a slot to.
   */
  matchAllowed(allowed: readonly ReadonlySet<string>[]): Uint32Array {
    const out = new Uint32Array(this.all);
    for (let p = 0; p < this.length; p++) {
      const union = new Uint32Array(this.blocks);
      for (const ch of allowed[p]!) {
        const set = this.bits[p]!.get(ch);
        if (!set) continue;
        for (let b = 0; b < this.blocks; b++) union[b]! |= set[b]!;
      }
      for (let b = 0; b < this.blocks; b++) out[b]! &= union[b]!;
    }
    return out;
  }
}

/**
 * Two entries share a stem when one runs into the other: at least three letters
 * of common prefix, leaving at most one letter differing on the shorter word.
 *
 * ANTAG/ANTAR share one, ARM/ARMAR share one, TRÄNG/TRÄTT do not (three shared
 * letters but two differing). The three letter floor is what stops it firing on
 * every short pair — BIL/BIO share two letters and nothing else.
 *
 * Deliberately shape based rather than a part of speech list. A blocklist of
 * verb forms would need a POS tagger for English, would be wrong at the edges
 * in both languages, and would still miss noun pairs like ARM/ARMAR.
 */
export function sharesStem(a: string, b: string): boolean {
  const max = Math.min(a.length, b.length);
  let p = 0;
  while (p < max && a[p] === b[p]) p++;
  if (p < 3) return false;
  return p >= max - 1;
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
 * Is every entry pinned to exactly one word by its crossings?
 *
 * This is the test that matters in a fully checked grid. ANTAG is only a
 * problem when the grid cannot tell it from ANTAR and ANTAS — if the crossings
 * rule the others out, the entry is fair however inflected it looks, and if
 * they do not, no clue under eight words will save it.
 *
 * Swapping an entry's word changes exactly one letter in each of its crossings,
 * and each crossing is then valid or not independently of the others. So the
 * alternatives are exactly the pool words whose letter at each position is one
 * a crossing would still accept — a count of one means the grid pins it, and
 * the count is never zero, because the word actually in the slot always
 * satisfies its own crossings.
 */
export function pinnedEntries(
  grid: string,
  pools: Map<number, LetterIndex>,
): { pinned: boolean; loose: string[] } {
  const entries = entriesOf(grid);
  const wordFor = (e: Entry): string => e.cells.map((i) => grid[i]!).join("");

  /** The perpendicular entry through a cell, and the position within it. */
  const crossing = (e: Entry, cell: number): { entry: Entry; at: number } | null => {
    for (const other of entries) {
      if (other.direction === e.direction) continue;
      const at = other.cells.indexOf(cell);
      if (at >= 0) return { entry: other, at };
    }
    return null;
  };

  const loose: string[] = [];
  for (const entry of entries) {
    const index = pools.get(entry.cells.length);
    if (!index) return { pinned: false, loose: [wordFor(entry)] };

    const allowed: Set<string>[] = [];
    for (let k = 0; k < entry.cells.length; k++) {
      const cross = crossing(entry, entry.cells[k]!);
      if (!cross) {
        // No crossing: an uncrossed cell constrains nothing, so the entry
        // cannot be pinned by the grid alone. Only reachable on a pattern with
        // black squares, which is not where this check is used.
        allowed.push(new Set(index.words.map((w) => w[k]!)));
        continue;
      }
      const crossIndex = pools.get(cross.entry.cells.length);
      if (!crossIndex) return { pinned: false, loose: [wordFor(entry)] };
      const crossWord = wordFor(cross.entry);
      const pattern = [...crossWord];
      pattern[cross.at] = ".";
      allowed.push(crossIndex.lettersAt(crossIndex.match(pattern.join("")), cross.at));
    }

    if (popcount(index.matchAllowed(allowed)) > 1) loose.push(wordFor(entry));
  }
  return { pinned: loose.length === 0, loose };
}

/** No entry may share a stem with another, in either direction. */
export function stemClash(grid: string): [string, string] | null {
  const words = entriesOf(grid).map((e) => e.cells.map((i) => grid[i]!).join(""));
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      if (sharesStem(words[i]!, words[j]!)) return [words[i]!, words[j]!];
    }
  }
  return null;
}

export interface SolveOptions {
  /** Caps the search so a pattern that will not fill is abandoned, not hung on. */
  maxSteps?: number;
  /**
   * Require every entry to be pinned by its crossings, and no two entries to
   * share a stem. For fully checked grids, where there is nothing else to
   * disambiguate an inflection.
   */
  requireUnique?: boolean;
  /** Words already at their repetition cap. Refused as candidates. */
  banned?: ReadonlySet<string>;
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
  options: SolveOptions = {},
): SolveResult {
  const { maxSteps = 40_000, requireUnique = false, banned } = options;
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
   * loop. Without this it can end up holding a non-word, a second copy of a
   * word already in the grid, or a word that is over its repetition cap — the
   * candidate loop refuses all three and an implicit completion never reaches
   * it. Checked on every placement rather than at the leaf, so a dead branch is
   * abandoned immediately instead of after a full fill has been built and
   * thrown away.
   */
  const complete = (): boolean => {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!filled(entry)) continue;
      const word = entry.cells.map((i) => cells[i]!).join("");
      const index = pools.get(entry.cells.length);
      if (!index || !index.lookup.has(word)) return false;
      if (seen.has(word)) return false;
      if (banned?.has(word)) return false;
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
    // Every slot is filled and the invariant held. A fully checked grid also
    // has to be unambiguous; rejecting here backtracks into a different fill
    // rather than abandoning the pattern.
    if (!best) {
      if (!requireUnique) return true;
      const grid = cells.join("");
      if (stemClash(grid)) return false;
      return pinnedEntries(grid, pools).pinned;
    }

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
      // At its share of the bank already: the grid is fine, the repetition is
      // not, and refusing it here costs a candidate rather than a whole fill.
      if (banned?.has(word)) continue;
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
