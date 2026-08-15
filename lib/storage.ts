import type { Lang } from "./i18n";
import { isLang } from "./i18n";
import { isDifficulty, type Difficulty } from "./difficulty";
import { GAME_IDS, type GameId, type Level } from "./games";

/**
 * A tiny typed wrapper over localStorage. Everything is defensive: a corrupt
 * or unknown payload resets to defaults silently rather than throwing, so a
 * schema bump can never brick the app on someone's phone.
 */

export const STORAGE_KEY = "Ordlek.state.v1";

/**
 * 2 dropped Five's per level records, because Five stopped having levels. The
 * other six games kept theirs untouched.
 *
 * 3 added Mini. Nothing was dropped, so a v2 state upgrades by gaining an
 * empty `mini` map rather than by losing anything.
 */
export const SCHEMA_VERSION = 3;

export type MotionPref = "system" | "full" | "reduced";

/** Ordoku renders the same puzzle as digits or as the hidden word's letters. */
export type GlyphMode = "numbers" | "letters";

export interface Settings {
  lang: Lang;
  sound: boolean;
  motion: MotionPref;
  ordokuGlyphs: GlyphMode;
}

export interface LevelRecord {
  completed: boolean;
  bestScore: number;
  /** Milliseconds. 0 means no time recorded. */
  bestTimeMs: number;
  streak: number;
}

/** How many guesses a Five win took, bucketed 1..6. Index 0 is a one guess win. */
export const GUESS_BUCKETS = 6;

/** Five's record for one language and difficulty. It has no levels to key on. */
export interface FiveStat {
  played: number;
  won: number;
  streak: number;
  maxStreak: number;
  /** Six bars: wins by number of guesses used. */
  distribution: number[];
}

export function emptyFiveStat(): FiveStat {
  return {
    played: 0,
    won: 0,
    streak: 0,
    maxStreak: 0,
    distribution: new Array<number>(GUESS_BUCKETS).fill(0),
  };
}

/**
 * Mini's record for one language and difficulty. A crossword is a speed game,
 * so the number that matters is time, not guesses — there is no distribution
 * to plot and no win rate, because a mini is not lost, only unfinished.
 */
export interface MiniStat {
  solved: number;
  /** Seconds. 0 when nothing has been solved yet. */
  bestSeconds: number;
  streak: number;
  maxStreak: number;
}

export function emptyMiniStat(): MiniStat {
  return { solved: 0, bestSeconds: 0, streak: 0, maxStreak: 0 };
}

export interface AppState {
  v: number;
  settings: Settings;
  /** Keyed by `${game}:${lang}:${level}`. Five is no longer in here. */
  progress: Record<string, LevelRecord>;
  /** Five only, keyed by `${lang}:${difficulty}`. */
  five: Record<string, FiveStat>;
  /** Last language and difficulty played, so the home card can deep link. */
  fiveLast: { lang: Lang; difficulty: Difficulty } | null;
  /** Mini only, keyed by `${lang}:${difficulty}`. */
  mini: Record<string, MiniStat>;
  miniLast: { lang: Lang; difficulty: Difficulty } | null;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: "sv",
  sound: true,
  motion: "system",
  ordokuGlyphs: "letters",
};

export function defaultState(): AppState {
  return {
    v: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    progress: {},
    five: {},
    fiveLast: null,
    mini: {},
    miniLast: null,
  };
}

export function fiveKey(lang: Lang, difficulty: Difficulty): string {
  return `${lang}:${difficulty}`;
}

export function miniKey(lang: Lang, difficulty: Difficulty): string {
  return `${lang}:${difficulty}`;
}

export function progressKey(game: GameId, lang: Lang, level: Level): string {
  return `${game}:${lang}:${level}`;
}

export const EMPTY_RECORD: LevelRecord = {
  completed: false,
  bestScore: 0,
  bestTimeMs: 0,
  streak: 0,
};

// --------------------------------------------------------------------------
// Validation. Anything that does not match is dropped, not repaired blindly.
// --------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function parseSettings(v: unknown): Settings {
  if (!isObject(v)) return { ...DEFAULT_SETTINGS };
  const motion = v.motion;
  const glyphs = v.ordokuGlyphs;
  return {
    lang: isLang(v.lang) ? v.lang : DEFAULT_SETTINGS.lang,
    sound: typeof v.sound === "boolean" ? v.sound : DEFAULT_SETTINGS.sound,
    motion:
      motion === "full" || motion === "reduced" || motion === "system"
        ? motion
        : DEFAULT_SETTINGS.motion,
    ordokuGlyphs:
      glyphs === "numbers" || glyphs === "letters"
        ? glyphs
        : DEFAULT_SETTINGS.ordokuGlyphs,
  };
}

// Five is deliberately absent: it has difficulties now, not levels, so a
// "five:sv:3" key from v1 matches nothing here and is dropped on migration.
const LEVELLED_GAMES = GAME_IDS.filter((g) => g !== "five");
const KEY_RE = new RegExp(`^(${LEVELLED_GAMES.join("|")}):(sv|en):([1-9]|10)$`);

function parseProgress(v: unknown): Record<string, LevelRecord> {
  if (!isObject(v)) return {};
  const out: Record<string, LevelRecord> = {};
  for (const [key, raw] of Object.entries(v)) {
    if (!KEY_RE.test(key) || !isObject(raw)) continue;
    out[key] = {
      completed: raw.completed === true,
      bestScore: Math.max(0, num(raw.bestScore)),
      bestTimeMs: Math.max(0, num(raw.bestTimeMs)),
      streak: Math.max(0, num(raw.streak)),
    };
  }
  return out;
}

const FIVE_KEY_RE = /^(sv|en):(easy|medium|hard|extreme)$/;

function parseFive(v: unknown): Record<string, FiveStat> {
  if (!isObject(v)) return {};
  const out: Record<string, FiveStat> = {};
  for (const [key, raw] of Object.entries(v)) {
    if (!FIVE_KEY_RE.test(key) || !isObject(raw)) continue;
    const dist = Array.isArray(raw.distribution) ? raw.distribution : [];
    out[key] = {
      played: Math.max(0, num(raw.played)),
      won: Math.max(0, num(raw.won)),
      streak: Math.max(0, num(raw.streak)),
      maxStreak: Math.max(0, num(raw.maxStreak)),
      distribution: Array.from({ length: GUESS_BUCKETS }, (_, i) =>
        Math.max(0, num(dist[i])),
      ),
    };
  }
  return out;
}

function parseMini(v: unknown): Record<string, MiniStat> {
  if (!isObject(v)) return {};
  const out: Record<string, MiniStat> = {};
  for (const [key, value] of Object.entries(v)) {
    if (!isObject(value)) continue;
    const [lang, difficulty] = key.split(":");
    if (!isLang(lang) || !isDifficulty(difficulty)) continue;
    out[key] = {
      solved: num(value.solved),
      bestSeconds: num(value.bestSeconds),
      streak: num(value.streak),
      maxStreak: num(value.maxStreak),
    };
  }
  return out;
}

function parseFiveLast(v: unknown): AppState["fiveLast"] {
  if (!isObject(v)) return null;
  if (!isLang(v.lang) || !isDifficulty(v.difficulty)) return null;
  return { lang: v.lang, difficulty: v.difficulty };
}

/**
 * Bring any stored payload up to the current schema.
 *
 * v1 to v2 is not a rewrite: settings and the other six games' progress are
 * parsed exactly as before, and Five's old per level records simply fail the
 * progress key test and disappear. Anything unrecognised still falls through
 * to defaults silently, so a bad payload cannot brick the app on a phone.
 */
export function migrate(raw: unknown): AppState {
  if (!isObject(raw)) return defaultState();
  const v = num(raw.v, 0);
  if (v < 1 || v > SCHEMA_VERSION) return defaultState();
  return {
    v: SCHEMA_VERSION,
    settings: parseSettings(raw.settings),
    progress: parseProgress(raw.progress),
    // v1 had no Five stats at all, so this is simply empty for those payloads.
    five: parseFive(raw.five),
    mini: parseMini(raw.mini),
    miniLast: parseFiveLast(raw.miniLast),
    fiveLast: parseFiveLast(raw.fiveLast),
  };
}

// --------------------------------------------------------------------------
// Read and write
// --------------------------------------------------------------------------

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    // Private mode and disabled storage both throw on access, not on use.
    const s = window.localStorage;
    const probe = "__ordlek_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadState(): AppState {
  const s = storage();
  if (!s) return defaultState();
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or private mode. Progress is not worth crashing a game over.
  }
}

export function clearState(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// --------------------------------------------------------------------------
// Progress helpers
// --------------------------------------------------------------------------

export function getRecord(
  state: AppState,
  game: GameId,
  lang: Lang,
  level: Level,
): LevelRecord {
  return state.progress[progressKey(game, lang, level)] ?? { ...EMPTY_RECORD };
}

export interface RunResult {
  cleared: boolean;
  score: number;
  timeMs: number;
}

/** Fold one finished run into the stored record. Returns the new state. */
export function recordRun(
  state: AppState,
  game: GameId,
  lang: Lang,
  level: Level,
  result: RunResult,
): { state: AppState; record: LevelRecord; isBestScore: boolean } {
  const key = progressKey(game, lang, level);
  const prev = state.progress[key] ?? { ...EMPTY_RECORD };
  const isBestScore = result.cleared && result.score > prev.bestScore;
  const record: LevelRecord = {
    completed: prev.completed || result.cleared,
    bestScore: isBestScore ? result.score : prev.bestScore,
    bestTimeMs:
      result.cleared && result.timeMs > 0
        ? prev.bestTimeMs === 0
          ? result.timeMs
          : Math.min(prev.bestTimeMs, result.timeMs)
        : prev.bestTimeMs,
    streak: result.cleared ? prev.streak + 1 : 0,
  };
  return {
    state: { ...state, progress: { ...state.progress, [key]: record } },
    record,
    isBestScore,
  };
}

export function getFiveStat(
  state: AppState,
  lang: Lang,
  difficulty: Difficulty,
): FiveStat {
  return state.five[fiveKey(lang, difficulty)] ?? emptyFiveStat();
}

/**
 * Fold one finished Five word into its language and difficulty record, and
 * remember where it was played so the home card can deep link back.
 */
export function recordFive(
  state: AppState,
  lang: Lang,
  difficulty: Difficulty,
  result: { won: boolean; guessesUsed: number },
): { state: AppState; stat: FiveStat } {
  const key = fiveKey(lang, difficulty);
  const prev = state.five[key] ?? emptyFiveStat();
  const distribution = [...prev.distribution];
  if (result.won) {
    // Guesses are 1-based; a win in one guess is the first bar. A win outside
    // the six bars is still counted as a win, just not plotted.
    const bar = result.guessesUsed - 1;
    if (bar >= 0 && bar < GUESS_BUCKETS) distribution[bar] = (distribution[bar] ?? 0) + 1;
  }
  const streak = result.won ? prev.streak + 1 : 0;
  const stat: FiveStat = {
    played: prev.played + 1,
    won: prev.won + (result.won ? 1 : 0),
    streak,
    maxStreak: Math.max(prev.maxStreak, streak),
    distribution,
  };
  return {
    state: {
      ...state,
      five: { ...state.five, [key]: stat },
      fiveLast: { lang, difficulty },
    },
    stat,
  };
}

export function getMiniStat(
  state: AppState,
  lang: Lang,
  difficulty: Difficulty,
): MiniStat {
  return state.mini[miniKey(lang, difficulty)] ?? emptyMiniStat();
}

/**
 * Fold one finished crossword in. Only solved puzzles are recorded: a mini is
 * never lost, so an abandoned one leaves the streak alone rather than breaking
 * it — walking away from a puzzle is not a defeat.
 */
export function recordMini(
  state: AppState,
  lang: Lang,
  difficulty: Difficulty,
  seconds: number,
): { state: AppState; stat: MiniStat; isBest: boolean } {
  const key = miniKey(lang, difficulty);
  const prev = state.mini[key] ?? emptyMiniStat();
  const isBest = prev.bestSeconds === 0 || seconds < prev.bestSeconds;
  const streak = prev.streak + 1;
  const stat: MiniStat = {
    solved: prev.solved + 1,
    bestSeconds: isBest ? seconds : prev.bestSeconds,
    streak,
    maxStreak: Math.max(prev.maxStreak, streak),
  };
  return {
    state: {
      ...state,
      mini: { ...state.mini, [key]: stat },
      miniLast: { lang, difficulty },
    },
    stat,
    isBest,
  };
}

/** Highest level cleared for a game and language, 0 when none. */
export function highestCleared(
  state: AppState,
  game: GameId,
  lang: Lang,
): number {
  let best = 0;
  for (let l = 1; l <= 10; l++) {
    if (state.progress[progressKey(game, lang, l as Level)]?.completed) best = l;
  }
  return best;
}
