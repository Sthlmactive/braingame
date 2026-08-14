import type { Difficulty } from "./difficulty";

/**
 * Mini's grid model, shared by the build-time generator and the runtime board.
 *
 * A puzzle ships as a single string: one character per cell in reading order,
 * `#` for a black square. Everything else — the mask, the entries, the
 * numbering — is derived from it by the functions here, so the generator and
 * the phone can never disagree about what the entries are.
 */

/** Board size per difficulty. Lätt is 4x4, everything above it is 5x5. */
export const MINI_SIZE: Record<Difficulty, number> = {
  easy: 4,
  medium: 5,
  hard: 5,
  extreme: 5,
};

/** How many black squares each difficulty's patterns carry. */
export const MINI_BLACKS: Record<Difficulty, readonly number[]> = {
  easy: [0],
  medium: [4, 5],
  hard: [2, 3],
  extreme: [0],
};

export const BLACK = "#";

/** The shortest run a crossword may contain. Two-letter entries are not words. */
export const MIN_RUN = 3;

export type Direction = "across" | "down";

export interface Entry {
  /** The clue number printed in the first cell. */
  number: number;
  direction: Direction;
  /** Cell indexes in reading order, first to last. */
  cells: number[];
}

/** True when the cell at `i` is a black square. */
export function isBlack(grid: string, i: number): boolean {
  return grid[i] === BLACK;
}

export function sizeOf(grid: string): number {
  const n = Math.round(Math.sqrt(grid.length));
  if (n * n !== grid.length) {
    throw new Error(`mini: grid of ${grid.length} cells is not square`);
  }
  return n;
}

/**
 * A mask is 180 degree rotationally symmetric when cell i is black exactly
 * when its opposite cell is. On an odd board the centre maps to itself, which
 * is why an odd number of black squares always puts one in the middle.
 */
export function isSymmetric(grid: string): boolean {
  const n = grid.length;
  for (let i = 0; i < n; i++) {
    if (isBlack(grid, i) !== isBlack(grid, n - 1 - i)) return false;
  }
  return true;
}

/** Every maximal run of white cells, across and down, as cell index lists. */
export function runs(grid: string): number[][] {
  const size = sizeOf(grid);
  const out: number[][] = [];

  const collect = (get: (a: number, b: number) => number): void => {
    for (let a = 0; a < size; a++) {
      let run: number[] = [];
      for (let b = 0; b < size; b++) {
        const i = get(a, b);
        if (isBlack(grid, i)) {
          if (run.length > 0) out.push(run);
          run = [];
        } else {
          run.push(i);
        }
      }
      if (run.length > 0) out.push(run);
    }
  };

  collect((r, c) => r * size + c);
  collect((c, r) => r * size + c);
  return out;
}

/** True when no run is shorter than MIN_RUN. A run of 1 or 2 is not a word. */
export function runsValid(grid: string): boolean {
  return runs(grid).every((r) => r.length >= MIN_RUN);
}

/** True when the white cells form one orthogonally connected region. */
export function isConnected(grid: string): boolean {
  const size = sizeOf(grid);
  const start = [...grid].findIndex((c) => c !== BLACK);
  if (start < 0) return false;

  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const i = queue.pop()!;
    const r = Math.floor(i / size);
    const c = i % size;
    const neighbours = [
      r > 0 ? i - size : -1,
      r < size - 1 ? i + size : -1,
      c > 0 ? i - 1 : -1,
      c < size - 1 ? i + 1 : -1,
    ];
    for (const j of neighbours) {
      if (j < 0 || seen.has(j) || isBlack(grid, j)) continue;
      seen.add(j);
      queue.push(j);
    }
  }

  const white = [...grid].filter((c) => c !== BLACK).length;
  return seen.size === white;
}

/**
 * The entries, numbered the way a crossword is: a cell takes the next number
 * when it starts an across run, a down run, or both, walking in reading order.
 */
export function entriesOf(grid: string): Entry[] {
  const size = sizeOf(grid);
  const at = (r: number, c: number): number => r * size + c;
  const white = (r: number, c: number): boolean =>
    r >= 0 && c >= 0 && r < size && c < size && !isBlack(grid, at(r, c));

  const out: Entry[] = [];
  let number = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!white(r, c)) continue;
      const startsAcross = !white(r, c - 1) && white(r, c + 1);
      const startsDown = !white(r - 1, c) && white(r + 1, c);
      if (!startsAcross && !startsDown) continue;
      number++;

      if (startsAcross) {
        const cells: number[] = [];
        for (let x = c; white(r, x); x++) cells.push(at(r, x));
        out.push({ number, direction: "across", cells });
      }
      if (startsDown) {
        const cells: number[] = [];
        for (let y = r; white(y, c); y++) cells.push(at(y, c));
        out.push({ number, direction: "down", cells });
      }
    }
  }
  return out;
}

/** The word an entry spells in a filled grid. */
export function wordOf(grid: string, entry: Entry): string {
  return entry.cells.map((i) => grid[i]!).join("");
}

/** Every word in a filled grid, across then down, in numbering order. */
export function wordsOf(grid: string): string[] {
  return entriesOf(grid).map((e) => wordOf(grid, e));
}

/**
 * A pattern is usable when it is symmetric, has no run under three, and leaves
 * the white cells connected. Checked at build time for every pattern and
 * re-checked by the test suite for every shipped puzzle.
 */
export function isUsablePattern(grid: string): boolean {
  return isSymmetric(grid) && runsValid(grid) && isConnected(grid);
}

/**
 * Every usable black-square mask of a given size and count, in a fixed order.
 *
 * Enumerated rather than hand written. Symmetry pairs the cells up, so the
 * search is over half the board and the space is small: a 5x5 has 12 pairs
 * plus a centre. Enumeration cannot typo a pattern into an invalid grid, and
 * the result is deterministic, which hand written constants only are if
 * nobody edits them.
 */
export function patternsFor(size: number, blacks: number): string[] {
  const cells = size * size;
  const centre = cells % 2 === 1 ? (cells - 1) / 2 : -1;
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < Math.floor(cells / 2); i++) pairs.push([i, cells - 1 - i]);

  const wantsCentre = blacks % 2 === 1;
  if (wantsCentre && centre < 0) return [];
  const pairCount = (blacks - (wantsCentre ? 1 : 0)) / 2;
  if (!Number.isInteger(pairCount) || pairCount < 0) return [];

  const out: string[] = [];
  const chosen: number[] = [];

  const build = (): string => {
    const g = new Array<string>(cells).fill(".");
    if (wantsCentre) g[centre] = BLACK;
    for (const p of chosen) {
      g[pairs[p]![0]] = BLACK;
      g[pairs[p]![1]] = BLACK;
    }
    return g.join("");
  };

  const walk = (from: number): void => {
    if (chosen.length === pairCount) {
      const g = build();
      if (isUsablePattern(g)) out.push(g);
      return;
    }
    for (let p = from; p < pairs.length; p++) {
      chosen.push(p);
      walk(p + 1);
      chosen.pop();
    }
  };
  walk(0);

  return out;
}
