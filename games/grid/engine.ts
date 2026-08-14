/**
 * Grid: a 5 by 5 square where every row is a word. A guess places every letter
 * it gets right anywhere in the grid, and reports which of its letters live
 * somewhere else in each row.
 */

export const GRID_SIZE = 5;

export interface GridState {
  /** The five row words. */
  solution: string[];
  revealed: boolean[][];
  /** Per row, letters known to be in that row but not yet placed. */
  rowHints: Set<string>[];
  guesses: string[];
}

export function newGrid(solution: string[]): GridState {
  return {
    solution,
    revealed: solution.map((w) => [...w].map(() => false)),
    rowHints: solution.map(() => new Set<string>()),
    guesses: [],
  };
}

export interface GuessOutcome {
  state: GridState;
  /** Cells this guess turned over, for the flip animation. */
  placed: Array<[row: number, col: number]>;
  newHints: number;
}

export function applyGuess(state: GridState, guess: string): GuessOutcome {
  const revealed = state.revealed.map((r) => [...r]);
  const rowHints = state.rowHints.map((s) => new Set(s));
  const placed: Array<[number, number]> = [];
  let newHints = 0;

  // The column check. Each letter of the guess is compared against all five
  // cells of its own column, so one guess can fill cells on any row.
  for (let r = 0; r < state.solution.length; r++) {
    const row = state.solution[r]!;
    for (let c = 0; c < GRID_SIZE; c++) {
      if (guess[c] === row[c] && !revealed[r]![c]) {
        revealed[r]![c] = true;
        placed.push([r, c]);
      }
    }
  }

  // The hints. Any letter of the guess that is in a row but was not revealed
  // there by the column check becomes an amber chip for that row. Chips
  // accumulate across guesses and clear once the letter is placed.
  const guessLetters = new Set(guess);
  for (let r = 0; r < state.solution.length; r++) {
    const row = state.solution[r]!;
    for (const ch of guessLetters) {
      if (!row.includes(ch)) continue;
      const stillHidden = [...row].some((rc, i) => rc === ch && !revealed[r]![i]);
      if (stillHidden && !rowHints[r]!.has(ch)) {
        rowHints[r]!.add(ch);
        newHints++;
      }
    }
    for (const ch of [...rowHints[r]!]) {
      const stillHidden = [...row].some((rc, i) => rc === ch && !revealed[r]![i]);
      if (!stillHidden) rowHints[r]!.delete(ch);
    }
  }

  return {
    state: { ...state, revealed, rowHints, guesses: [...state.guesses, guess] },
    placed,
    newHints,
  };
}

export function isSolved(state: GridState): boolean {
  return state.revealed.every((row) => row.every(Boolean));
}

export function rowsRemaining(state: GridState): number {
  return state.revealed.filter((row) => !row.every(Boolean)).length;
}

export function cellsRevealed(state: GridState): number {
  return state.revealed.flat().filter(Boolean).length;
}

export function scoreGrid({
  solved,
  guessesUsed,
  guessesAllowed,
  timeMs,
  cells,
}: {
  solved: boolean;
  guessesUsed: number;
  guessesAllowed: number;
  timeMs: number;
  cells: number;
}): number {
  // Partial credit: an unfinished grid is still worth what was uncovered.
  const uncovered = cells * 12;
  if (!solved) return uncovered;
  const spare = Math.max(0, guessesAllowed - guessesUsed) * 45;
  const speed = Math.max(0, 300 - Math.floor(timeMs / 1000)) * 2;
  return 400 + uncovered + spare + speed;
}
