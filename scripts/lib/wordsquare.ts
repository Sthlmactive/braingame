import type { Dawg } from "../../lib/dawg";
import { shuffle, type Rng } from "../../lib/rng";

/**
 * Five by five squares where every row *and* every column is a word.
 *
 * These are rare enough that searching for one at runtime would stall a phone,
 * which is why Grid's levels 9 and 10 read them from static JSON instead.
 */
export function findWordSquare(
  rowPool: string[],
  dawg: Dawg,
  rng: Rng,
  size = 5,
  budgetMs = 4000,
): string[] | null {
  const pool = shuffle([...rowPool], rng).filter((w) => w.length === size);
  if (pool.length === 0) return null;

  // Bucket by first letter so each row only tries words that can still work.
  const byPrefix = new Map<string, string[]>();
  for (const w of pool) {
    const key = w[0]!;
    const list = byPrefix.get(key);
    if (list) list.push(w);
    else byPrefix.set(key, [w]);
  }

  const deadline = Date.now() + budgetMs;
  const rows: string[] = [];

  const columnsOk = (depth: number): boolean => {
    for (let c = 0; c < size; c++) {
      let col = "";
      for (let r = 0; r < depth; r++) col += rows[r]![c];
      // The last row must complete every column into a real word.
      if (depth === size) {
        if (!dawg.has(col)) return false;
      } else if (!dawg.hasPrefix(col)) {
        return false;
      }
    }
    return true;
  };

  const solve = (depth: number): boolean => {
    if (Date.now() > deadline) return false;
    if (depth === size) return columnsOk(size);

    // Candidates for this row are constrained by the column prefixes above.
    let candidates = pool;
    if (depth > 0) {
      let need = "";
      for (let r = 0; r < depth; r++) need += rows[r]![0];
      candidates = byPrefix.get(need[0]!) ?? pool;
      // Cheap filter first: the first column must stay a live prefix.
      candidates = pool.filter((w) => dawg.hasPrefix(need + w[0]!));
    }

    for (const w of candidates) {
      if (rows.includes(w)) continue;
      rows[depth] = w;
      if (columnsOk(depth + 1) && solve(depth + 1)) return true;
      rows.length = depth;
      if (Date.now() > deadline) return false;
    }
    return false;
  };

  return solve(0) ? [...rows] : null;
}
