import { shuffle, type Rng } from "@/lib/rng";

/**
 * Ordoku: sudoku with letters. The generator guarantees a unique solution and
 * the main diagonal always spells a real word.
 *
 * Internally the puzzle is plain symbols 0..n-1. Letters are only attached at
 * the end by relabelling, which is what lets the diagonal spell anything.
 */

export type Size = 4 | 6 | 9;

export interface BoxShape {
  rows: number;
  cols: number;
}

export const BOX: Record<Size, BoxShape> = {
  4: { rows: 2, cols: 2 },
  6: { rows: 2, cols: 3 },
  9: { rows: 3, cols: 3 },
};

/** -1 for an empty cell. */
export type Board = Int8Array;

export function boxIndex(size: Size, r: number, c: number): number {
  const b = BOX[size];
  return Math.floor(r / b.rows) * (size / b.cols) + Math.floor(c / b.cols);
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

interface Masks {
  row: Int32Array;
  col: Int32Array;
  box: Int32Array;
}

function buildMasks(board: Board, size: Size): Masks | null {
  const row = new Int32Array(size);
  const col = new Int32Array(size);
  const box = new Int32Array(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = board[r * size + c]!;
      if (v < 0) continue;
      const bit = 1 << v;
      const b = boxIndex(size, r, c);
      // A contradictory board has no solutions at all.
      if (row[r]! & bit || col[c]! & bit || box[b]! & bit) return null;
      row[r]! |= bit;
      col[c]! |= bit;
      box[b]! |= bit;
    }
  }
  return { row, col, box };
}

/**
 * Count solutions, stopping as soon as `cap` is reached. Uniqueness only ever
 * needs to know whether the answer is 1 or "more than 1".
 */
export function countSolutions(board: Board, size: Size, cap = 2): number {
  const masks = buildMasks(board, size);
  if (!masks) return 0;
  const work = Int8Array.from(board);
  const full = (1 << size) - 1;
  let found = 0;

  const step = (): void => {
    if (found >= cap) return;

    // Pick the most constrained empty cell; this is what keeps 9x9 fast.
    let bestIdx = -1;
    let bestOptions = 0;
    let bestCount = size + 1;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        if (work[i]! >= 0) continue;
        const used =
          masks.row[r]! | masks.col[c]! | masks.box[boxIndex(size, r, c)]!;
        const options = full & ~used;
        if (options === 0) return; // dead end
        const n = popcount(options);
        if (n < bestCount) {
          bestCount = n;
          bestIdx = i;
          bestOptions = options;
          if (n === 1) break;
        }
      }
      if (bestCount === 1) break;
    }

    if (bestIdx < 0) {
      found++;
      return;
    }

    const r = Math.floor(bestIdx / size);
    const c = bestIdx % size;
    const b = boxIndex(size, r, c);
    let options = bestOptions;
    while (options !== 0 && found < cap) {
      const bit = options & -options;
      options ^= bit;
      const v = Math.log2(bit) | 0;
      work[bestIdx] = v;
      masks.row[r]! |= bit;
      masks.col[c]! |= bit;
      masks.box[b]! |= bit;
      step();
      masks.row[r]! ^= bit;
      masks.col[c]! ^= bit;
      masks.box[b]! ^= bit;
      work[bestIdx] = -1;
    }
  };

  step();
  return found;
}

export function hasUniqueSolution(board: Board, size: Size): boolean {
  return countSolutions(board, size, 2) === 1;
}

/** Fill in the answer, or null when there is none. */
export function solve(board: Board, size: Size): Board | null {
  const masks = buildMasks(board, size);
  if (!masks) return null;
  const work = Int8Array.from(board);
  const full = (1 << size) - 1;

  const step = (): boolean => {
    let bestIdx = -1;
    let bestOptions = 0;
    let bestCount = size + 1;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        if (work[i]! >= 0) continue;
        const used =
          masks.row[r]! | masks.col[c]! | masks.box[boxIndex(size, r, c)]!;
        const options = full & ~used;
        if (options === 0) return false;
        const n = popcount(options);
        if (n < bestCount) {
          bestCount = n;
          bestIdx = i;
          bestOptions = options;
          if (n === 1) break;
        }
      }
      if (bestCount === 1) break;
    }
    if (bestIdx < 0) return true;

    const r = Math.floor(bestIdx / size);
    const c = bestIdx % size;
    const b = boxIndex(size, r, c);
    let options = bestOptions;
    while (options !== 0) {
      const bit = options & -options;
      options ^= bit;
      const v = Math.log2(bit) | 0;
      work[bestIdx] = v;
      masks.row[r]! |= bit;
      masks.col[c]! |= bit;
      masks.box[b]! |= bit;
      if (step()) return true;
      masks.row[r]! ^= bit;
      masks.col[c]! ^= bit;
      masks.box[b]! ^= bit;
      work[bestIdx] = -1;
    }
    return false;
  };

  return step() ? work : null;
}

function popcount(n: number): number {
  let x = n;
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * A complete grid whose main diagonal reads 0, 1, 2 ... n-1. Relabelling those
 * symbols to a word's letters then makes the diagonal spell that word, which
 * is why the constraint is baked in here rather than searched for afterwards.
 */
export function completeGridWithDiagonal(size: Size, rng: Rng): Board | null {
  const board = new Int8Array(size * size).fill(-1);
  for (let i = 0; i < size; i++) board[i * size + i] = i;

  const masks = buildMasks(board, size);
  if (!masks) return null;
  const full = (1 << size) - 1;

  const order: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) if (r !== c) order.push(r * size + c);
  }

  const step = (k: number): boolean => {
    if (k >= order.length) return true;
    const i = order[k]!;
    const r = Math.floor(i / size);
    const c = i % size;
    const b = boxIndex(size, r, c);
    const options = full & ~(masks.row[r]! | masks.col[c]! | masks.box[b]!);
    if (options === 0) return false;
    const values = shuffle(
      Array.from({ length: size }, (_, v) => v).filter((v) => options & (1 << v)),
      rng,
    );
    for (const v of values) {
      const bit = 1 << v;
      board[i] = v;
      masks.row[r]! |= bit;
      masks.col[c]! |= bit;
      masks.box[b]! |= bit;
      if (step(k + 1)) return true;
      masks.row[r]! ^= bit;
      masks.col[c]! ^= bit;
      masks.box[b]! ^= bit;
      board[i] = -1;
    }
    return false;
  };

  return step(0) ? board : null;
}

/**
 * Remove as many cells as possible while keeping the solution unique, stopping
 * once the target number of givens is reached. Uniqueness is the hard floor:
 * if the target cannot be met the puzzle keeps the extra givens rather than
 * becoming ambiguous.
 */
export function dig(
  full: Board,
  size: Size,
  targetGivens: number,
  rng: Rng,
  maxPasses = 6,
): Board {
  const board = Int8Array.from(full);
  let givens = size * size;

  // Removal order decides how far a single pass gets, so keep sweeping in a
  // fresh order until a whole pass removes nothing. This is what closes the
  // gap to the hardest levels' target density.
  for (let pass = 0; pass < maxPasses && givens > targetGivens; pass++) {
    const cells = shuffle(
      Array.from({ length: size * size }, (_, i) => i).filter(
        (i) => board[i]! >= 0,
      ),
      rng,
    );
    let removed = 0;
    for (const i of cells) {
      if (givens <= targetGivens) break;
      const saved = board[i]!;
      board[i] = -1;
      if (hasUniqueSolution(board, size)) {
        givens--;
        removed++;
      } else {
        board[i] = saved;
      }
    }
    if (removed === 0) break;
  }
  return board;
}

export interface OrdokuPuzzle {
  size: Size;
  /** -1 for a cell the player must fill. */
  puzzle: Board;
  solution: Board;
  /** Symbol index to letter. */
  letters: string[];
  /** The word spelled by the main diagonal. */
  word: string;
  givens: number;
}

/**
 * Build a puzzle from a word whose letters are all distinct and whose length
 * matches the board size.
 */
export function generateOrdoku(
  word: string,
  size: Size,
  givensFraction: number,
  rng: Rng,
): OrdokuPuzzle | null {
  if (word.length !== size) return null;
  if (new Set(word).size !== size) return null;

  const target = Math.max(size, Math.round(size * size * givensFraction));

  // How sparse a grid can get and stay unique varies by grid, and digging is
  // cheap, so try a few and keep the emptiest. Uniqueness is never traded
  // away for density: a puzzle with more givens than asked for is fine, an
  // ambiguous one is not.
  let best: { puzzle: Board; solution: Board; givens: number } | null = null;
  const attempts = size === 9 ? 6 : 2;

  for (let i = 0; i < attempts; i++) {
    const full = completeGridWithDiagonal(size, rng);
    if (!full) continue;
    const puzzle = dig(full, size, target, rng);
    const givens = puzzle.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
    if (!best || givens < best.givens) best = { puzzle, solution: full, givens };
    if (best.givens <= target) break;
  }

  if (!best) return null;

  return {
    size,
    puzzle: best.puzzle,
    solution: best.solution,
    letters: [...word],
    word,
    givens: best.givens,
  };
}

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------

/** Cells that clash with another cell in the same row, column or box. */
export function conflicts(board: Board, size: Size): Set<number> {
  const bad = new Set<number>();
  const check = (cells: number[]): void => {
    const seen = new Map<number, number[]>();
    for (const i of cells) {
      const v = board[i]!;
      if (v < 0) continue;
      const list = seen.get(v);
      if (list) list.push(i);
      else seen.set(v, [i]);
    }
    for (const list of seen.values()) {
      if (list.length > 1) for (const i of list) bad.add(i);
    }
  };

  for (let r = 0; r < size; r++) {
    check(Array.from({ length: size }, (_, c) => r * size + c));
  }
  for (let c = 0; c < size; c++) {
    check(Array.from({ length: size }, (_, r) => r * size + c));
  }
  const b = BOX[size];
  for (let br = 0; br < size / b.rows; br++) {
    for (let bc = 0; bc < size / b.cols; bc++) {
      const cells: number[] = [];
      for (let r = 0; r < b.rows; r++) {
        for (let c = 0; c < b.cols; c++) {
          cells.push((br * b.rows + r) * size + (bc * b.cols + c));
        }
      }
      check(cells);
    }
  }
  return bad;
}

export function isComplete(board: Board, size: Size): boolean {
  for (let i = 0; i < size * size; i++) if (board[i]! < 0) return false;
  return conflicts(board, size).size === 0;
}

export function scoreOrdoku({
  solved,
  size,
  timeMs,
  mistakes,
  hintsUsed,
}: {
  solved: boolean;
  size: Size;
  timeMs: number;
  mistakes: number;
  hintsUsed: number;
}): number {
  if (!solved) return 0;
  const base = size * size * 8;
  const speed = Math.max(0, 900 - Math.floor(timeMs / 1000));
  return Math.max(0, base + speed - mistakes * 25 - hintsUsed * 60);
}
