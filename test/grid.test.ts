import { describe, expect, it } from "vitest";
import {
  GRID_SIZE,
  applyGuess,
  cellsRevealed,
  isSolved,
  newGrid,
  rowsRemaining,
  scoreGrid,
} from "@/games/grid/engine";

/** Five rows chosen so the column and hint rules are easy to reason about. */
const SOLUTION = ["crane", "stone", "plate", "shore", "vague"];

describe("the column rule", () => {
  it("reveals every cell in a column that matches the guessed letter", () => {
    const state = newGrid(SOLUTION);
    // "s" in column 0 matches "stone" (row 1) and "shore" (row 3).
    const { state: next, placed } = applyGuess(state, "sssss");
    const rows = placed.filter(([, c]) => c === 0).map(([r]) => r);
    expect(rows.sort()).toEqual([1, 3]);
    expect(next.revealed[1]![0]).toBe(true);
    expect(next.revealed[3]![0]).toBe(true);
    // "crane", "plate" and "vague" do not start with s.
    expect(next.revealed[0]![0]).toBe(false);
  });

  it("is not tied to any one row", () => {
    const state = newGrid(SOLUTION);
    // "e" in the last column ends every one of the five words.
    const { state: next } = applyGuess(state, "aaaae");
    for (let r = 0; r < GRID_SIZE; r++) {
      expect(next.revealed[r]![GRID_SIZE - 1], `row ${r}`).toBe(true);
    }
  });

  it("only reveals in the column the letter was guessed in", () => {
    const state = newGrid(SOLUTION);
    // "c" guessed in column 1 must not reveal the "c" of crane at column 0.
    const { state: next } = applyGuess(state, "zczzz");
    expect(next.revealed[0]![0]).toBe(false);
  });

  it("keeps revealed cells revealed", () => {
    let state = newGrid(SOLUTION);
    state = applyGuess(state, "aaaae").state;
    state = applyGuess(state, "zzzzz").state;
    for (let r = 0; r < GRID_SIZE; r++) {
      expect(state.revealed[r]![GRID_SIZE - 1]).toBe(true);
    }
  });
});

describe("the hint rule", () => {
  it("chips a letter that is in the row but landed in the wrong column", () => {
    const state = newGrid(SOLUTION);
    // "c" in column 1: crane has a c, but at column 0, so it is a hint.
    const { state: next } = applyGuess(state, "zczzz");
    expect([...next.rowHints[0]!]).toContain("c");
  });

  it("does not chip a letter that is not in that row at all", () => {
    const state = newGrid(SOLUTION);
    const { state: next } = applyGuess(state, "zczzz");
    // "vague" holds no c.
    expect([...next.rowHints[4]!]).not.toContain("c");
  });

  it("does not chip a letter the column check just revealed", () => {
    const state = newGrid(SOLUTION);
    // "c" in column 0 reveals crane's c outright, so it is not also a hint.
    const { state: next } = applyGuess(state, "czzzz");
    expect(next.revealed[0]![0]).toBe(true);
    expect([...next.rowHints[0]!]).not.toContain("c");
  });

  it("accumulates across guesses and deduplicates", () => {
    let state = newGrid(SOLUTION);
    state = applyGuess(state, "zczzz").state;
    const first = [...state.rowHints[0]!];
    state = applyGuess(state, "zzczz").state;
    expect([...state.rowHints[0]!]).toEqual(first);
    expect([...state.rowHints[0]!].filter((c) => c === "c")).toHaveLength(1);
  });

  it("clears a chip once that letter is placed", () => {
    let state = newGrid(SOLUTION);
    state = applyGuess(state, "zczzz").state;
    expect([...state.rowHints[0]!]).toContain("c");
    // Now guess c in its real column.
    state = applyGuess(state, "czzzz").state;
    expect([...state.rowHints[0]!]).not.toContain("c");
  });

  it("keeps a chip while another copy of the letter is still hidden", () => {
    // "eerie" has three e's; revealing one must not clear the chip.
    let state = newGrid(["eerie", "crane", "stone", "plate", "shore"]);
    state = applyGuess(state, "zzzze").state; // reveals eerie's last e
    expect(state.revealed[0]![4]).toBe(true);
    expect([...state.rowHints[0]!]).toContain("e");
  });
});

describe("progress", () => {
  it("is solved only when all 25 cells are revealed", () => {
    let state = newGrid(SOLUTION);
    expect(isSolved(state)).toBe(false);
    for (const word of SOLUTION) state = applyGuess(state, word).state;
    expect(cellsRevealed(state)).toBe(GRID_SIZE * GRID_SIZE);
    expect(isSolved(state)).toBe(true);
    expect(rowsRemaining(state)).toBe(0);
  });

  it("counts the rows still open", () => {
    const state = newGrid(SOLUTION);
    expect(rowsRemaining(state)).toBe(GRID_SIZE);
  });

  it("records every guess", () => {
    let state = newGrid(SOLUTION);
    state = applyGuess(state, "crane").state;
    state = applyGuess(state, "stone").state;
    expect(state.guesses).toEqual(["crane", "stone"]);
  });

  it("does not mutate the state it was given", () => {
    const state = newGrid(SOLUTION);
    applyGuess(state, "crane");
    expect(cellsRevealed(state)).toBe(0);
    expect(state.guesses).toEqual([]);
  });
});

describe("scoreGrid", () => {
  it("gives partial credit for an unfinished grid", () => {
    expect(
      scoreGrid({
        solved: false,
        guessesUsed: 8,
        guessesAllowed: 8,
        timeMs: 1000,
        cells: 10,
      }),
    ).toBeGreaterThan(0);
  });

  it("rewards spare guesses", () => {
    const base = { solved: true, guessesAllowed: 15, timeMs: 30_000, cells: 25 };
    expect(scoreGrid({ ...base, guessesUsed: 5 })).toBeGreaterThan(
      scoreGrid({ ...base, guessesUsed: 12 }),
    );
  });
});
