import type { Lang } from "@/lib/i18n";
import type { Dawg } from "@/lib/dawg";
import {
  BINGO_BONUS,
  BLANK,
  CENTRE,
  RACK_SIZE,
  SIZE,
  letterValue,
  premiumAt,
} from "./board";

/**
 * The Tiles rules and the opponent's move search.
 *
 * The board is a flat array of 225 cells. A cell holds the letter that is
 * showing; a tile played from a blank shows its chosen letter but scores zero,
 * so blanks are tracked separately.
 */

export type Cell = string | null;
export type Board = Cell[];
/** True where the showing letter came from a blank and therefore scores zero. */
export type BlankMask = boolean[];

export const idx = (r: number, c: number): number => r * SIZE + c;
export const rowOf = (i: number): number => Math.floor(i / SIZE);
export const colOf = (i: number): number => i % SIZE;

export function emptyBoard(): Board {
  return new Array(SIZE * SIZE).fill(null);
}

export function emptyBlanks(): BlankMask {
  return new Array(SIZE * SIZE).fill(false);
}

export type Dir = "h" | "v";

export interface PlacedTile {
  index: number;
  letter: string;
  /** True when this came off a blank tile. */
  blank: boolean;
}

export interface Move {
  tiles: PlacedTile[];
  word: string;
  dir: Dir;
  score: number;
  /** Every word the move forms, main word first. */
  words: string[];
}

// ---------------------------------------------------------------------------
// Rack handling
// ---------------------------------------------------------------------------

export function rackCounts(rack: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of rack) m.set(l, (m.get(l) ?? 0) + 1);
  return m;
}

/**
 * Work out how to supply `needed` from the rack, spending blanks last.
 * Returns which of the needed letters must come from a blank, or null when the
 * rack cannot cover it at all.
 */
export function supply(
  needed: string[],
  rack: string[],
): boolean[] | null {
  const counts = rackCounts(rack);
  let blanks = counts.get(BLANK) ?? 0;
  const fromBlank: boolean[] = [];
  for (const letter of needed) {
    const have = counts.get(letter) ?? 0;
    if (have > 0) {
      counts.set(letter, have - 1);
      fromBlank.push(false);
    } else if (blanks > 0) {
      blanks--;
      fromBlank.push(true);
    } else {
      return null;
    }
  }
  return fromBlank;
}

// ---------------------------------------------------------------------------
// Reading the board
// ---------------------------------------------------------------------------

export function isEmpty(board: Board): boolean {
  return board.every((c) => c === null);
}

/** Walk back to the start of the run through `i`, then read it forwards. */
function runThrough(
  board: Board,
  i: number,
  dir: Dir,
): { start: number; cells: number[] } {
  const step = dir === "h" ? 1 : SIZE;
  let start = i;
  while (true) {
    const prev = start - step;
    if (prev < 0) break;
    if (dir === "h" && colOf(prev) > colOf(start)) break;
    if (board[prev] === null) break;
    start = prev;
  }
  const cells: number[] = [];
  let cur = start;
  while (cur < SIZE * SIZE && board[cur] !== null) {
    cells.push(cur);
    const next = cur + step;
    if (dir === "h" && next < SIZE * SIZE && colOf(next) < colOf(cur)) break;
    cur = next;
  }
  return { start, cells };
}

export function wordAt(board: Board, i: number, dir: Dir): string {
  return runThrough(board, i, dir)
    .cells.map((c) => board[c]!)
    .join("");
}

// ---------------------------------------------------------------------------
// Validation and scoring
// ---------------------------------------------------------------------------

export type PlacementError =
  | "empty"
  | "notInLine"
  | "notContiguous"
  | "mustCoverCentre"
  | "mustTouch"
  | "notAWord";

export interface PlacementResult {
  ok: boolean;
  error?: PlacementError;
  /** Set when the failure is a bad word, so the UI can name it. */
  badWord?: string;
  move?: Move;
}

/**
 * Check a set of placements and score them. This is the single source of truth
 * for legality: the player's turn and the opponent's both go through it.
 */
export function evaluatePlacement(
  board: Board,
  blanks: BlankMask,
  placed: PlacedTile[],
  lang: Lang,
  dawg: Dawg,
): PlacementResult {
  if (placed.length === 0) return { ok: false, error: "empty" };

  const rows = new Set(placed.map((p) => rowOf(p.index)));
  const cols = new Set(placed.map((p) => colOf(p.index)));
  if (rows.size > 1 && cols.size > 1) return { ok: false, error: "notInLine" };

  // A single tile could extend either way; prefer whichever forms a longer word.
  let dir: Dir = rows.size === 1 ? "h" : "v";

  const next = board.slice();
  const nextBlanks = blanks.slice();
  for (const p of placed) {
    if (next[p.index] !== null) return { ok: false, error: "notContiguous" };
    next[p.index] = p.letter;
    nextBlanks[p.index] = p.blank;
  }

  if (placed.length === 1) {
    const h = wordAt(next, placed[0]!.index, "h");
    const v = wordAt(next, placed[0]!.index, "v");
    dir = h.length >= v.length ? "h" : "v";
  }

  // The tiles have to form one unbroken run once the board's own tiles count.
  const sorted = [...placed].sort((a, b) => a.index - b.index);
  const step = dir === "h" ? 1 : SIZE;
  for (let k = 1; k < sorted.length; k++) {
    for (let i = sorted[k - 1]!.index + step; i < sorted[k]!.index; i += step) {
      if (next[i] === null) return { ok: false, error: "notContiguous" };
    }
  }

  const first = isEmpty(board);
  if (first) {
    if (!placed.some((p) => p.index === idx(CENTRE, CENTRE))) {
      return { ok: false, error: "mustCoverCentre" };
    }
  } else {
    // Every later move must touch what is already there.
    const touches = placed.some((p) => {
      const r = rowOf(p.index);
      const c = colOf(p.index);
      return (
        (r > 0 && board[idx(r - 1, c)] !== null) ||
        (r < SIZE - 1 && board[idx(r + 1, c)] !== null) ||
        (c > 0 && board[idx(r, c - 1)] !== null) ||
        (c < SIZE - 1 && board[idx(r, c + 1)] !== null)
      );
    });
    if (!touches) return { ok: false, error: "mustTouch" };
  }

  const placedSet = new Set(placed.map((p) => p.index));
  const words: string[] = [];
  let total = 0;

  const scoreRun = (cells: number[]): number | null => {
    if (cells.length < 2) return 0;
    const word = cells.map((c) => next[c]!).join("");
    if (!dawg.has(word)) {
      words.push(word);
      return null;
    }
    words.push(word);
    let sum = 0;
    let multiplier = 1;
    for (const c of cells) {
      const base = nextBlanks[c] ? 0 : letterValue(next[c]!, lang);
      if (placedSet.has(c)) {
        // Premiums only count the turn the tile lands on them.
        const p = premiumAt(rowOf(c), colOf(c));
        if (p === "d") sum += base * 2;
        else if (p === "t") sum += base * 3;
        else sum += base;
        if (p === "D") multiplier *= 2;
        else if (p === "T") multiplier *= 3;
      } else {
        sum += base;
      }
    }
    return sum * multiplier;
  };

  const main = runThrough(next, sorted[0]!.index, dir).cells;
  const mainScore = scoreRun(main);
  if (mainScore === null) {
    return { ok: false, error: "notAWord", badWord: words[words.length - 1] };
  }
  total += mainScore;

  const cross: Dir = dir === "h" ? "v" : "h";
  for (const p of placed) {
    const cells = runThrough(next, p.index, cross).cells;
    if (cells.length < 2) continue;
    const s = scoreRun(cells);
    if (s === null) {
      return { ok: false, error: "notAWord", badWord: words[words.length - 1] };
    }
    total += s;
  }

  if (placed.length === RACK_SIZE) total += BINGO_BONUS;

  return {
    ok: true,
    move: {
      tiles: placed,
      word: main.map((c) => next[c]!).join(""),
      dir,
      score: total,
      words,
    },
  };
}

export function applyMove(
  board: Board,
  blanks: BlankMask,
  move: Move,
): { board: Board; blanks: BlankMask } {
  const next = board.slice();
  const nextBlanks = blanks.slice();
  for (const t of move.tiles) {
    next[t.index] = t.letter;
    nextBlanks[t.index] = t.blank;
  }
  return { board: next, blanks: nextBlanks };
}

// ---------------------------------------------------------------------------
// Move generation
// ---------------------------------------------------------------------------

export interface SearchLimits {
  maxWordLength: number;
  /** 0 ignores premium squares, 1 values them fully. */
  premiumWeight: number;
  /** Stop searching after this long, so a turn never hangs the UI. */
  budgetMs: number;
}

/**
 * Every legal move, best first. The opponent and the player's hint both use
 * this; difficulty comes from which move gets picked, not from a weaker search.
 *
 * Lines are scanned one at a time. For each window of the line the board's own
 * letters become a fixed pattern and the gaps become wildcards, which the DAWG
 * fills in. That keeps the search inside the automaton instead of guessing
 * words and testing them.
 */
export function generateMoves(
  board: Board,
  blanks: BlankMask,
  rack: string[],
  lang: Lang,
  dawg: Dawg,
  limits: SearchLimits,
): Move[] {
  const deadline = Date.now() + limits.budgetMs;
  const moves: Move[] = [];
  const seen = new Set<string>();
  const first = isEmpty(board);
  const maxLen = Math.min(limits.maxWordLength, SIZE);

  const consider = (cells: number[], word: string): void => {
    const placed: PlacedTile[] = [];
    const needed: string[] = [];
    const needIdx: number[] = [];
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k]!;
      if (board[i] === null) {
        needed.push(word[k]!);
        needIdx.push(i);
      } else if (board[i] !== word[k]) {
        return; // clashes with a tile already down
      }
    }
    if (needed.length === 0 || needed.length > rack.length) return;

    const fromBlank = supply(needed, rack);
    if (!fromBlank) return;
    for (let k = 0; k < needed.length; k++) {
      placed.push({
        index: needIdx[k]!,
        letter: needed[k]!,
        blank: fromBlank[k]!,
      });
    }

    const key = placed.map((p) => `${p.index}:${p.letter}`).join(",");
    if (seen.has(key)) return;
    seen.add(key);

    const res = evaluatePlacement(board, blanks, placed, lang, dawg);
    if (res.ok && res.move) moves.push(res.move);
  };

  const scanLine = (cells: number[]): void => {
    for (let start = 0; start < cells.length; start++) {
      if (Date.now() > deadline) return;
      // A window must not cut a word in half at either end.
      if (start > 0 && board[cells[start - 1]!] !== null) continue;
      for (let len = 2; len <= maxLen && start + len <= cells.length; len++) {
        const end = start + len;
        if (end < cells.length && board[cells[end]!] !== null) continue;
        const window = cells.slice(start, end);

        let existing = 0;
        let gaps = 0;
        let pattern = "";
        for (const i of window) {
          const c = board[i];
          if (c === null) {
            gaps++;
            pattern += ".";
          } else {
            existing++;
            pattern += c;
          }
        }
        if (gaps === 0 || gaps > rack.length) continue;

        if (first) {
          // The opening move must cross the centre and nothing else exists.
          if (!window.includes(idx(CENTRE, CENTRE))) continue;
        } else if (existing === 0) {
          // With no letter inside the window it must touch one alongside.
          const adjacent = window.some((i) => {
            const r = rowOf(i);
            const c = colOf(i);
            return (
              (r > 0 && board[idx(r - 1, c)] !== null) ||
              (r < SIZE - 1 && board[idx(r + 1, c)] !== null) ||
              (c > 0 && board[idx(r, c - 1)] !== null) ||
              (c < SIZE - 1 && board[idx(r, c + 1)] !== null)
            );
          });
          if (!adjacent) continue;
        }

        for (const word of dawg.matchPattern(pattern, 400)) {
          consider(window, word);
          if (Date.now() > deadline) return;
        }
      }
    }
  };

  for (let r = 0; r < SIZE; r++) {
    scanLine(Array.from({ length: SIZE }, (_, c) => idx(r, c)));
    if (Date.now() > deadline) break;
  }
  for (let c = 0; c < SIZE; c++) {
    scanLine(Array.from({ length: SIZE }, (_, r) => idx(r, c)));
    if (Date.now() > deadline) break;
  }

  // Weak levels are told to ignore premium squares, so rank them on the raw
  // letter value instead of the premium-inflated score.
  const rank = (m: Move): number => {
    if (limits.premiumWeight >= 1) return m.score;
    const plain = m.tiles.reduce(
      (s, t) => s + (t.blank ? 0 : letterValue(t.letter, lang)),
      0,
    );
    return plain + (m.score - plain) * limits.premiumWeight;
  };

  return moves.sort((a, b) => rank(b) - rank(a));
}

/**
 * Choose the opponent's move. Skill slides from "a middling option" to "the
 * best one it found".
 */
export function chooseMove(moves: Move[], skill: number, rng: () => number): Move | null {
  if (moves.length === 0) return null;
  if (skill >= 1) return moves[0]!;
  // Pick from a window near the top; a higher skill narrows the window.
  const window = Math.max(1, Math.round(moves.length * (1 - skill)));
  const span = Math.min(window, moves.length);
  return moves[Math.floor(rng() * span)] ?? moves[0]!;
}

export function drawFrom(bag: string[], n: number): { drawn: string[]; bag: string[] } {
  const drawn = bag.slice(0, n);
  return { drawn, bag: bag.slice(n) };
}
