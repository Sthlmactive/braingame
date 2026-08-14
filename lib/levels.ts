import type { Band } from "./bands";
import { DIFFICULTY_LENGTH, type Difficulty } from "./difficulty";
import type { Level } from "./games";

/**
 * The difficulty ladder for all seven games, in one place.
 *
 * Level 1 has to be genuinely easy for a beginner and level 10 genuinely hard
 * for a fluent adult, so the knobs move together: the word pool widens, the
 * allowance shrinks, and the assists switch off.
 */

const idx = (level: Level): number => level - 1;

function at<T>(table: readonly T[], level: Level): T {
  return table[idx(level)]!;
}

// ---------------------------------------------------------------------------
// Five
// ---------------------------------------------------------------------------

export interface FiveConfig {
  /** 5 for Lätt and Medel, 6 for Svår and Extrem. */
  length: number;
  guesses: number;
  hints: number;
  /** Extrem takes the letter colours off the keyboard. */
  keyboardColours: boolean;
}

/**
 * Five has no levels. It has four difficulties and plays forever.
 *
 *   Lätt    5 letters, 6 guesses, keyboard colours on,  2 hints
 *   Medel   5 letters, 6 guesses, keyboard colours on,  1 hint
 *   Svår    6 letters, 6 guesses, keyboard colours on,  0 hints
 *   Extrem  6 letters, 6 guesses, keyboard colours off, 0 hints
 *
 * There is no hard mode anywhere: any valid word is a legal guess at any
 * point. Svår and Extrem differ only by the keyboard colours and by how hard
 * the words themselves are.
 */
export const FIVE_CONFIG: Record<Difficulty, FiveConfig> = {
  easy: {
    length: DIFFICULTY_LENGTH.easy,
    guesses: 6,
    hints: 2,
    keyboardColours: true,
  },
  medium: {
    length: DIFFICULTY_LENGTH.medium,
    guesses: 6,
    hints: 1,
    keyboardColours: true,
  },
  hard: {
    length: DIFFICULTY_LENGTH.hard,
    guesses: 6,
    hints: 0,
    keyboardColours: true,
  },
  extreme: {
    length: DIFFICULTY_LENGTH.extreme,
    guesses: 6,
    hints: 0,
    keyboardColours: false,
  },
};

export function fiveConfig(difficulty: Difficulty): FiveConfig {
  return FIVE_CONFIG[difficulty];
}

// ---------------------------------------------------------------------------
// Hive
// ---------------------------------------------------------------------------

export interface HiveConfig {
  minLength: number;
  /** How many valid words the generator aims for. */
  targetAnswers: number;
  /** Percentage of the total score needed to clear. */
  scoreToClear: number;
  requirePangram: boolean;
  /** Seconds, or 0 for no countdown. */
  seconds: number;
}

const HIVE_MIN_LENGTH = [3, 3, 3, 3, 4, 4, 4, 5, 5, 5] as const;
const HIVE_TARGET = [20, 25, 30, 35, 40, 45, 50, 55, 60, 70] as const;
const HIVE_SCORE = [20, 27, 33, 40, 47, 53, 60, 67, 73, 80] as const;
const HIVE_SECONDS = [0, 0, 0, 0, 0, 300, 255, 210, 165, 120] as const;

export function hiveConfig(level: Level): HiveConfig {
  return {
    minLength: at(HIVE_MIN_LENGTH, level),
    targetAnswers: at(HIVE_TARGET, level),
    scoreToClear: at(HIVE_SCORE, level),
    requirePangram: level >= 8,
    seconds: at(HIVE_SECONDS, level),
  };
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export interface GridConfig {
  size: number;
  guesses: number;
  band: Band;
  /** Levels 9 and 10 need every column to be a word as well. */
  columnsToo: boolean;
}

const GRID_GUESSES = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6] as const;

/**
 * Grid used to borrow Five's band ladder. Five has no levels any more, so Grid
 * owns its ladder now. The values are exactly what Grid was already getting:
 * the top two rungs read "top40k" rather than "full" because those two bands
 * are the same set today, and pinning them keeps Grid's answers unchanged if
 * the answer pool is ever widened.
 */
const GRID_BAND: readonly Band[] = [
  "top1k",
  "top2k",
  "top3k",
  "top5k",
  "top10k",
  "top20k",
  "top20k",
  "top40k",
  "top40k",
  "top40k",
];

export function gridConfig(level: Level): GridConfig {
  return {
    size: 5,
    guesses: at(GRID_GUESSES, level),
    band: at(GRID_BAND, level),
    columnsToo: level >= 9,
  };
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

export interface LoopConfig {
  wheelLetters: number;
  slots: number;
  hints: number;
}

const LOOP_WHEEL = [4, 4, 5, 5, 6, 6, 7, 7, 8, 8] as const;
const LOOP_SLOTS = [4, 5, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const LOOP_HINTS = [3, 3, 3, 2, 2, 1, 0, 0, 0, 0] as const;

export function loopConfig(level: Level): LoopConfig {
  return {
    wheelLetters: at(LOOP_WHEEL, level),
    slots: at(LOOP_SLOTS, level),
    hints: at(LOOP_HINTS, level),
  };
}

// ---------------------------------------------------------------------------
// Ordoku
// ---------------------------------------------------------------------------

export interface OrdokuConfig {
  /** Always 9. Difficulty is the givens and the assists, not the board. */
  size: 9;
  /** How many cells start filled. */
  givens: number;
  /** Levels 1 to 5 highlight a clash the moment it happens. */
  liveConflicts: boolean;
  /** Levels 1 to 3 dim a pad value once all nine of it are placed. */
  dimUsedValues: boolean;
  /** Levels 9 and 10 keep the hidden word secret until the board is solved. */
  hideWordUntilSolved: boolean;
  hints: number;
}

const ORDOKU_GIVENS = [50, 46, 42, 38, 34, 32, 30, 28, 26, 24] as const;
const ORDOKU_HINTS = [3, 3, 2, 2, 1, 1, 0, 0, 0, 0] as const;

export function ordokuConfig(level: Level): OrdokuConfig {
  return {
    size: 9,
    givens: at(ORDOKU_GIVENS, level),
    liveConflicts: level <= 5,
    dimUsedValues: level <= 3,
    hideWordUntilSolved: level >= 9,
    hints: at(ORDOKU_HINTS, level),
  };
}

// ---------------------------------------------------------------------------
// Rush
// ---------------------------------------------------------------------------

export interface RushConfig {
  tiles: number;
  /** Seconds, or 0 for no countdown. */
  seconds: number;
  /** Seconds between peels, or 0 for none. */
  peelEvery: number;
  /** How strongly the tile bag leans towards vowels. */
  vowelBias: number;
}

const RUSH_TILES = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30] as const;
const RUSH_SECONDS = [0, 0, 0, 0, 360, 324, 288, 252, 216, 180] as const;
const RUSH_VOWEL_BIAS = [
  2.2, 2.0, 1.8, 1.6, 1.45, 1.3, 1.2, 1.1, 1.05, 1.0,
] as const;

export function rushConfig(level: Level): RushConfig {
  return {
    tiles: at(RUSH_TILES, level),
    seconds: at(RUSH_SECONDS, level),
    peelEvery: level >= 7 ? 45 : 0,
    vowelBias: at(RUSH_VOWEL_BIAS, level),
  };
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

export interface TilesConfig {
  /** Longest word the opponent will play. */
  aiMaxWordLength: number;
  /** 0 ignores premium squares entirely, 1 plays them for everything. */
  aiPremiumWeight: number;
  /**
   * Where in the ranked list of legal moves the opponent picks. 1 is always
   * the best move it found, 0.2 is a middling one.
   */
  aiSkill: number;
  hints: number;
  /** Seconds per turn, or 0 for untimed. */
  turnSeconds: number;
}

const TILES_MAX_WORD = [3, 4, 4, 5, 5, 6, 7, 8, 15, 15] as const;
const TILES_PREMIUM = [0, 0.2, 0.35, 0.5, 0.65, 0.75, 0.85, 0.95, 1, 1] as const;
const TILES_SKILL = [
  0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1,
] as const;
const TILES_HINTS = [3, 3, 2, 2, 1, 0, 0, 0, 0, 0] as const;

export function tilesConfig(level: Level): TilesConfig {
  return {
    aiMaxWordLength: at(TILES_MAX_WORD, level),
    aiPremiumWeight: at(TILES_PREMIUM, level),
    aiSkill: at(TILES_SKILL, level),
    hints: at(TILES_HINTS, level),
    turnSeconds: level >= 8 ? 60 : 0,
  };
}
