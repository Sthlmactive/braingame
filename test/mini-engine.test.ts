import { describe, expect, it } from "vitest";
import {
  activeCells,
  advance,
  applyHint,
  backspace,
  hintCell,
  isComplete,
  isSolved,
  newGame,
  selectCell,
  stepEntry,
  typeLetter,
  wrongCells,
} from "@/games/mini/engine";
import { entriesOf } from "@/lib/mini";

/**
 * A 5x5 with two black squares in opposite corners, which is Svår's geometry,
 * plus a fully checked 4x4, which is Lätt's.
 */
const HARD = "#abcdefghijklmnopqrstuvw#"; // 25 cells, black in opposite corners
const OPEN = "abcdefghijklmnop";

const setup = (solution: string) => {
  const state = newGame(solution);
  return { state, entries: entriesOf(solution) };
};

describe("cursor", () => {
  it("starts on the first entry's first cell", () => {
    const { state } = setup(OPEN);
    expect(state.cursor).toEqual({ cell: 0, direction: "across" });
  });

  it("never selects a black square", () => {
    const { state, entries } = setup(HARD);
    expect(selectCell(state, entries, 0)).toEqual(state.cursor);
  });

  it("flips direction when the selected cell is tapped again", () => {
    const { state, entries } = setup(OPEN);
    const flipped = selectCell(state, entries, state.cursor.cell);
    expect(flipped.direction).toBe("down");
    expect(flipped.cell).toBe(state.cursor.cell);

    const back = selectCell({ ...state, cursor: flipped }, entries, flipped.cell);
    expect(back.direction).toBe("across");
  });

  it("keeps the direction when moving to a different cell", () => {
    const { state, entries } = setup(OPEN);
    expect(selectCell(state, entries, 6)).toEqual({ cell: 6, direction: "across" });
  });
});

describe("typing", () => {
  it("advances within the entry", () => {
    const { state, entries } = setup(OPEN);
    const next = typeLetter(state, entries, "x");
    expect(next.filled[0]).toBe("x");
    expect(next.cursor.cell).toBe(1);
  });

  it("skips cells that already hold a letter", () => {
    const { state, entries } = setup(OPEN);
    // Pre-fill the second cell, then type into the first.
    const seeded = { ...state, filled: " z  ".padEnd(16, " ") };
    const next = typeLetter(seeded, entries, "x");
    expect(next.cursor.cell).toBe(2);
  });

  it("jumps to the next entry with an empty cell when the entry fills up", () => {
    const { state, entries } = setup(OPEN);
    let s = state;
    for (const letter of "abcd") s = typeLetter(s, entries, letter);
    // The first across row is full; the cursor must have left it.
    expect(s.filled.slice(0, 4)).toBe("abcd");
    expect(activeCells(s, entries)).not.toEqual([0, 1, 2, 3]);
    expect(s.filled[s.cursor.cell]).toBe(" ");
  });

  it("stays put when the grid is full", () => {
    const { state, entries } = setup(OPEN);
    const full = { ...state, filled: OPEN };
    expect(advance(full, entries, full.filled)).toEqual(full.cursor);
  });
});

describe("backspace", () => {
  it("clears the current cell without moving", () => {
    const { state, entries } = setup(OPEN);
    const typed = typeLetter(state, entries, "x");
    const at = { ...typed, cursor: { cell: 0, direction: "across" as const } };
    const cleared = backspace(at, entries);
    expect(cleared.filled[0]).toBe(" ");
    expect(cleared.cursor.cell).toBe(0);
  });

  it("steps back and clears when the cell is already empty", () => {
    const { state, entries } = setup(OPEN);
    let s = typeLetter(state, entries, "a");
    s = typeLetter(s, entries, "b");
    // Cursor sits on cell 2, which is empty.
    const cleared = backspace(s, entries);
    expect(cleared.cursor.cell).toBe(1);
    expect(cleared.filled[1]).toBe(" ");
  });

  it("does nothing at the start of an entry", () => {
    const { state, entries } = setup(OPEN);
    expect(backspace(state, entries)).toEqual(state);
  });
});

describe("checking", () => {
  it("is not complete until every white cell is filled", () => {
    const { state, entries } = setup(HARD);
    expect(isComplete(state)).toBe(false);
    const one = typeLetter(state, entries, "a");
    expect(isComplete(one)).toBe(false);
  });

  it("a full but wrong grid is complete and not solved", () => {
    const { state } = setup(OPEN);
    const wrong = { ...state, filled: "zbcdefghijklmnop" };
    expect(isComplete(wrong)).toBe(true);
    expect(isSolved(wrong)).toBe(false);
    expect(wrongCells(wrong)).toEqual([0]);
  });

  it("a full and correct grid is solved", () => {
    const { state } = setup(OPEN);
    expect(isSolved({ ...state, filled: OPEN })).toBe(true);
  });

  it("never reports a black square as wrong", () => {
    const { state } = setup(HARD);
    expect(wrongCells({ ...state, filled: HARD })).toEqual([]);
  });
});

describe("hints", () => {
  it("reveals exactly one letter, and only in the active entry", () => {
    const { state, entries } = setup(OPEN);
    const cell = hintCell(state, entries);
    expect(cell).not.toBeNull();
    expect(activeCells(state, entries)).toContain(cell);

    const after = applyHint(state, entries, cell!);
    const revealed = [...after.filled].filter((c) => c !== " ").length;
    expect(revealed).toBe(1);
    expect(after.filled[cell!]).toBe(state.solution[cell!]);
  });

  it("returns null when the active entry is already correct", () => {
    const { state, entries } = setup(OPEN);
    const done = { ...state, filled: "abcd" + " ".repeat(12) };
    expect(hintCell(done, entries)).toBeNull();
  });
});

describe("clue bar arrows", () => {
  it("steps to the next entry and wraps", () => {
    const { state, entries } = setup(OPEN);
    const next = stepEntry(state, entries, 1);
    expect(next).not.toEqual(state.cursor);

    let cursor = state.cursor;
    for (let i = 0; i < entries.length; i++) {
      cursor = stepEntry({ ...state, cursor }, entries, 1);
    }
    expect(cursor).toEqual(state.cursor);
  });
});
