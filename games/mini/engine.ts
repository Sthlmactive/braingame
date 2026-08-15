import {
  BLACK,
  entriesOf,
  isBlack,
  sizeOf,
  type Direction,
  type Entry,
} from "@/lib/mini";

/**
 * Mini's interaction rules, with no React and no DOM.
 *
 * Everything about where the cursor goes lives here, because "typing advances
 * within the entry, skipping filled cells, and jumps to the next unfilled
 * entry at the end" is a sentence with about six edge cases in it, and none of
 * them should need a browser to test.
 */

export interface Cursor {
  /** Index into the grid string. Always a white cell. */
  cell: number;
  direction: Direction;
}

export interface MiniState {
  /** The solution, one character per cell, `#` for black. Never shown. */
  solution: string;
  /** What the player has typed. Same length; " " for an empty white cell. */
  filled: string;
  cursor: Cursor;
}

export function emptyFill(solution: string): string {
  return [...solution].map((c) => (c === BLACK ? BLACK : " ")).join("");
}

/** The entries running through a cell, at most one per direction. */
export function entriesAt(entries: Entry[], cell: number): Entry[] {
  return entries.filter((e) => e.cells.includes(cell));
}

export function entryAt(
  entries: Entry[],
  cell: number,
  direction: Direction,
): Entry | null {
  return entries.find((e) => e.direction === direction && e.cells.includes(cell)) ?? null;
}

/** The first white cell in reading order, where a fresh puzzle starts. */
export function firstCell(solution: string): number {
  const i = [...solution].findIndex((c) => c !== BLACK);
  return i < 0 ? 0 : i;
}

/**
 * Tapping a cell selects it. Tapping the selected cell again flips between
 * across and down — the standard phone crossword gesture, and the reason the
 * board needs no direction control of its own.
 */
export function selectCell(
  state: MiniState,
  entries: Entry[],
  cell: number,
): Cursor {
  if (isBlack(state.solution, cell)) return state.cursor;

  if (cell === state.cursor.cell) {
    const flipped: Direction = state.cursor.direction === "across" ? "down" : "across";
    // Only flip if the cell actually has an entry that way; a cell in a
    // one-directional run stays put rather than selecting nothing.
    return entryAt(entries, cell, flipped) ? { cell, direction: flipped } : state.cursor;
  }

  const keeps = entryAt(entries, cell, state.cursor.direction);
  return { cell, direction: keeps ? state.cursor.direction : otherDirection(state, entries, cell) };
}

function otherDirection(state: MiniState, entries: Entry[], cell: number): Direction {
  const across = entryAt(entries, cell, "across");
  return across ? "across" : "down";
}

/** Cells of the entry the cursor is in, in reading order. */
export function activeCells(state: MiniState, entries: Entry[]): number[] {
  return entryAt(entries, state.cursor.cell, state.cursor.direction)?.cells ?? [];
}

const isEmpty = (filled: string, cell: number): boolean => filled[cell] === " ";

/**
 * Where the cursor lands after typing.
 *
 * Within the entry, skip cells that already hold a letter — a solver filling
 * crossings should not have to step over their own work. When the entry has no
 * empty cell left, jump to the first empty cell of the next entry that has
 * one, wrapping around; if the whole grid is full, stay put.
 */
export function advance(state: MiniState, entries: Entry[], filled: string): Cursor {
  const entry = entryAt(entries, state.cursor.cell, state.cursor.direction);
  if (!entry) return state.cursor;

  const at = entry.cells.indexOf(state.cursor.cell);
  const ahead = entry.cells.slice(at + 1).find((c) => isEmpty(filled, c));
  if (ahead !== undefined) return { cell: ahead, direction: state.cursor.direction };

  const order = entries.filter((e) => e.cells.some((c) => isEmpty(filled, c)));
  if (order.length === 0) return state.cursor;

  const here = entries.indexOf(entry);
  const next =
    order.find((e) => entries.indexOf(e) > here) ??
    order.find((e) => entries.indexOf(e) <= here) ??
    order[0]!;
  const cell = next.cells.find((c) => isEmpty(filled, c))!;
  return { cell, direction: next.direction };
}

export function typeLetter(
  state: MiniState,
  entries: Entry[],
  letter: string,
): MiniState {
  if (isBlack(state.solution, state.cursor.cell)) return state;
  const filled =
    state.filled.slice(0, state.cursor.cell) +
    letter +
    state.filled.slice(state.cursor.cell + 1);
  return { ...state, filled, cursor: advance({ ...state, filled }, entries, filled) };
}

/**
 * Backspace clears the current cell and steps back. On an already empty cell
 * it steps back first and clears there, which is what every text field does
 * and what a solver expects.
 */
export function backspace(state: MiniState, entries: Entry[]): MiniState {
  const entry = entryAt(entries, state.cursor.cell, state.cursor.direction);
  if (!entry) return state;
  const at = entry.cells.indexOf(state.cursor.cell);

  if (!isEmpty(state.filled, state.cursor.cell)) {
    const filled =
      state.filled.slice(0, state.cursor.cell) + " " + state.filled.slice(state.cursor.cell + 1);
    return { ...state, filled };
  }

  const back = entry.cells[at - 1];
  if (back === undefined) return state;
  const filled = state.filled.slice(0, back) + " " + state.filled.slice(back + 1);
  return { ...state, filled, cursor: { cell: back, direction: state.cursor.direction } };
}

/** Every white cell holds a letter. Nothing is checked before this is true. */
export function isComplete(state: MiniState): boolean {
  return ![...state.filled].some((c) => c === " ");
}

/** Cells whose letter is wrong. Only ever called on a complete grid. */
export function wrongCells(state: MiniState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.solution.length; i++) {
    if (state.solution[i] === BLACK) continue;
    if (state.filled[i] !== state.solution[i]) out.push(i);
  }
  return out;
}

export function isSolved(state: MiniState): boolean {
  return isComplete(state) && wrongCells(state).length === 0;
}

/**
 * A hint fills one cell of the entry the cursor is in — the first that is
 * empty or wrong, so spending one always changes something. Returns null when
 * the entry is already correct, so the caller can decline to spend it.
 */
export function hintCell(state: MiniState, entries: Entry[]): number | null {
  const cells = activeCells(state, entries);
  return cells.find((c) => state.filled[c] !== state.solution[c]) ?? null;
}

export function applyHint(state: MiniState, entries: Entry[], cell: number): MiniState {
  const filled = state.filled.slice(0, cell) + state.solution[cell] + state.filled.slice(cell + 1);
  return { ...state, filled, cursor: advance({ ...state, filled }, entries, filled) };
}

/** Step to the next or previous entry, for the clue bar's arrows. */
export function stepEntry(state: MiniState, entries: Entry[], delta: 1 | -1): Cursor {
  const entry = entryAt(entries, state.cursor.cell, state.cursor.direction);
  if (!entry) return state.cursor;
  const at = entries.indexOf(entry);
  const next = entries[(at + delta + entries.length) % entries.length]!;
  const cell = next.cells.find((c) => isEmpty(state.filled, c)) ?? next.cells[0]!;
  return { cell, direction: next.direction };
}

/** Board geometry, for the renderer. */
export function gridSize(solution: string): number {
  return sizeOf(solution);
}

export function newGame(solution: string): MiniState {
  const entries = entriesOf(solution);
  const cell = entries[0]?.cells[0] ?? firstCell(solution);
  return {
    solution,
    filled: emptyFill(solution),
    cursor: { cell, direction: entries[0]?.direction ?? "across" },
  };
}

/**
 * The hint key's state for a whole round.
 *
 * Mini has nothing to submit — the grid checks itself the moment it is full —
 * so the Enter slot is the hint, and it says so. It used to say "Klar", which
 * promised an action the game does not have.
 *
 * Two rules live in the return value, and both exist because a control that
 * comes and goes mid-round moves the key underneath the player's thumb:
 *
 *   - `null` means this difficulty grants no hints at all, so the key is
 *     absent for the entire round. Absent always beats absent-sometimes.
 *   - Otherwise the key is present for the entire round, and only `enabled`
 *     changes. Spending the last hint disables it; it never unmounts.
 *
 * The count is in the label so it is width-invariant as it counts down: the
 * key is the same size at 2, 1 and 0.
 */
export interface HintKey {
  label: string;
  enabled: boolean;
}

export function hintKey(
  granted: number,
  remaining: number,
  word: string,
): HintKey | null {
  if (granted <= 0) return null;
  return {
    label: `${word} ${Math.max(0, remaining)}`,
    enabled: remaining > 0,
  };
}
