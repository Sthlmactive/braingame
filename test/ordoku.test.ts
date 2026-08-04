import { describe, expect, it } from "vitest";
import {
  BOX,
  boxIndex,
  completeGridWithDiagonal,
  conflicts,
  countSolutions,
  dig,
  generateOrdoku,
  hasUniqueSolution,
  isComplete,
  solve,
  type Board,
  type Size,
} from "@/games/ordoku/engine";
import { mulberry32 } from "@/lib/rng";

const SIZES: Size[] = [4, 6, 9];

function isValidComplete(board: Board, size: Size): boolean {
  for (let i = 0; i < size * size; i++) {
    if (board[i]! < 0 || board[i]! >= size) return false;
  }
  return conflicts(board, size).size === 0;
}

describe("boxIndex", () => {
  it("groups cells into the right boxes", () => {
    // 6x6 uses 2 rows by 3 columns, so there are three box rows of two.
    expect(boxIndex(6, 0, 0)).toBe(boxIndex(6, 1, 2));
    expect(boxIndex(6, 0, 0)).not.toBe(boxIndex(6, 0, 3));
    expect(boxIndex(6, 0, 0)).not.toBe(boxIndex(6, 2, 0));
    expect(boxIndex(9, 0, 0)).toBe(boxIndex(9, 2, 2));
    expect(boxIndex(9, 0, 0)).not.toBe(boxIndex(9, 3, 0));
  });

  it("covers every box exactly once", () => {
    for (const size of SIZES) {
      const seen = new Set<number>();
      const counts = new Map<number, number>();
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const b = boxIndex(size, r, c);
          seen.add(b);
          counts.set(b, (counts.get(b) ?? 0) + 1);
        }
      }
      expect(seen.size).toBe(size);
      for (const n of counts.values()) {
        expect(n).toBe(BOX[size].rows * BOX[size].cols);
      }
    }
  });
});

describe("completeGridWithDiagonal", () => {
  it("produces a legal full grid at every size", () => {
    for (const size of SIZES) {
      for (let seed = 1; seed <= 8; seed++) {
        const g = completeGridWithDiagonal(size, mulberry32(seed));
        expect(g, `size ${size} seed ${seed}`).not.toBeNull();
        expect(isValidComplete(g!, size)).toBe(true);
      }
    }
  });

  it("puts 0..n-1 down the main diagonal", () => {
    for (const size of SIZES) {
      const g = completeGridWithDiagonal(size, mulberry32(3))!;
      for (let i = 0; i < size; i++) expect(g[i * size + i]).toBe(i);
    }
  });

  it("varies with the seed", () => {
    const a = completeGridWithDiagonal(9, mulberry32(1))!;
    const b = completeGridWithDiagonal(9, mulberry32(2))!;
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe("countSolutions", () => {
  it("finds exactly one for a complete grid", () => {
    const g = completeGridWithDiagonal(4, mulberry32(5))!;
    expect(countSolutions(g, 4)).toBe(1);
  });

  it("finds none for a contradictory grid", () => {
    const g = new Int8Array(16).fill(-1);
    g[0] = 0;
    g[1] = 0; // same row, same symbol
    expect(countSolutions(g, 4)).toBe(0);
  });

  it("finds more than one for an empty grid", () => {
    const g = new Int8Array(16).fill(-1);
    expect(countSolutions(g, 4, 2)).toBe(2);
  });

  it("stops at the cap", () => {
    const g = new Int8Array(36).fill(-1);
    expect(countSolutions(g, 6, 2)).toBe(2);
    expect(countSolutions(g, 6, 5)).toBe(5);
  });
});

describe("solve", () => {
  it("recovers the grid a dig came from", () => {
    for (const size of SIZES) {
      const full = completeGridWithDiagonal(size, mulberry32(11))!;
      const puzzle = dig(full, size, Math.round(size * size * 0.5), mulberry32(12));
      const solved = solve(puzzle, size);
      expect(solved).not.toBeNull();
      expect(Array.from(solved!)).toEqual(Array.from(full));
    }
  });

  it("returns null when there is no solution", () => {
    const g = new Int8Array(16).fill(-1);
    g[0] = 0;
    g[4] = 0; // same column
    expect(solve(g, 4)).toBeNull();
  });
});

describe("dig", () => {
  it("always leaves a uniquely solvable puzzle", () => {
    for (const size of SIZES) {
      for (let seed = 1; seed <= 4; seed++) {
        const full = completeGridWithDiagonal(size, mulberry32(seed))!;
        const puzzle = dig(full, size, Math.round(size * size * 0.3), mulberry32(seed * 7));
        expect(hasUniqueSolution(puzzle, size), `size ${size} seed ${seed}`).toBe(
          true,
        );
      }
    }
  });

  it("keeps every remaining given faithful to the solution", () => {
    const full = completeGridWithDiagonal(9, mulberry32(21))!;
    const puzzle = dig(full, 9, 30, mulberry32(22));
    for (let i = 0; i < 81; i++) {
      if (puzzle[i]! >= 0) expect(puzzle[i]).toBe(full[i]);
    }
  });

  it("actually removes cells", () => {
    const full = completeGridWithDiagonal(9, mulberry32(31))!;
    const puzzle = dig(full, 9, 30, mulberry32(32));
    const givens = Array.from(puzzle).filter((v) => v >= 0).length;
    expect(givens).toBeLessThan(81);
    expect(givens).toBeGreaterThanOrEqual(17);
  });
});

describe("generateOrdoku", () => {
  it("builds a unique puzzle whose diagonal spells the word", () => {
    for (const size of SIZES) {
      const word = size === 4 ? "hund" : size === 6 ? "kastru" : "bortglms";
      const distinct = uniqueLetters(word, size);
      const p = generateOrdoku(distinct, size, 0.45, mulberry32(size * 13));
      expect(p, `size ${size}`).not.toBeNull();
      expect(hasUniqueSolution(p!.puzzle, size)).toBe(true);
      // The diagonal of the solution, mapped through the letters, is the word.
      const diagonal = Array.from({ length: size }, (_, i) =>
        p!.letters[p!.solution[i * size + i]!],
      ).join("");
      expect(diagonal).toBe(distinct);
    }
  });

  it("refuses a word of the wrong length or with repeats", () => {
    expect(generateOrdoku("cat", 4, 0.5, mulberry32(1))).toBeNull();
    expect(generateOrdoku("keep", 4, 0.5, mulberry32(1))).toBeNull();
  });

  it("reports the givens it actually managed", () => {
    const p = generateOrdoku("hund", 4, 0.6, mulberry32(9))!;
    expect(p.givens).toBe(Array.from(p.puzzle).filter((v) => v >= 0).length);
    expect(p.givens).toBeGreaterThan(0);
    expect(p.givens).toBeLessThan(16);
  });

  it("hits roughly the requested density on a 9x9", () => {
    const p = generateOrdoku("bortglms", 9, 0.4, mulberry32(77));
    expect(p).toBeNull(); // 8 letters cannot fill a 9x9
    const ok = generateOrdoku("utbildarn".slice(0, 9), 9, 0.4, mulberry32(77));
    if (ok) expect(ok.givens).toBeLessThanOrEqual(Math.round(81 * 0.55));
  });
});

describe("conflicts and completion", () => {
  it("finds no conflict in a legal grid", () => {
    const g = completeGridWithDiagonal(6, mulberry32(4))!;
    expect(conflicts(g, 6).size).toBe(0);
    expect(isComplete(g, 6)).toBe(true);
  });

  it("flags both cells of a clash", () => {
    const g = new Int8Array(16).fill(-1);
    g[0] = 2;
    g[3] = 2; // same row
    const bad = conflicts(g, 4);
    expect(bad.has(0)).toBe(true);
    expect(bad.has(3)).toBe(true);
    expect(bad.size).toBe(2);
  });

  it("is incomplete while a cell is empty", () => {
    const g = completeGridWithDiagonal(4, mulberry32(4))!;
    g[5] = -1;
    expect(isComplete(g, 4)).toBe(false);
  });
});

/** Force a word to have `size` distinct letters, for tests only. */
function uniqueLetters(word: string, size: Size): string {
  const out: string[] = [];
  const pool = "abcdefghijklmnopqrstuvwxyz";
  for (const ch of word) if (!out.includes(ch)) out.push(ch);
  for (const ch of pool) {
    if (out.length >= size) break;
    if (!out.includes(ch)) out.push(ch);
  }
  return out.slice(0, size).join("");
}
