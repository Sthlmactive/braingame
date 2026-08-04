import type { Lang } from "./i18n";
import { isLang } from "./i18n";
import { GAME_IDS, type GameId, type Level } from "./games";

/**
 * A tiny typed wrapper over localStorage. Everything is defensive: a corrupt
 * or unknown payload resets to defaults silently rather than throwing, so a
 * schema bump can never brick the app on someone's phone.
 */

export const STORAGE_KEY = "Ordlek.state.v1";
export const SCHEMA_VERSION = 1;

export type MotionPref = "system" | "full" | "reduced";

export interface Settings {
  lang: Lang;
  sound: boolean;
  motion: MotionPref;
}

export interface LevelRecord {
  completed: boolean;
  bestScore: number;
  /** Milliseconds. 0 means no time recorded. */
  bestTimeMs: number;
  streak: number;
}

export interface AppState {
  v: number;
  settings: Settings;
  /** Keyed by `${game}:${lang}:${level}`. */
  progress: Record<string, LevelRecord>;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: "sv",
  sound: true,
  motion: "system",
};

export function defaultState(): AppState {
  return { v: SCHEMA_VERSION, settings: { ...DEFAULT_SETTINGS }, progress: {} };
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
  return {
    lang: isLang(v.lang) ? v.lang : DEFAULT_SETTINGS.lang,
    sound: typeof v.sound === "boolean" ? v.sound : DEFAULT_SETTINGS.sound,
    motion:
      motion === "full" || motion === "reduced" || motion === "system"
        ? motion
        : DEFAULT_SETTINGS.motion,
  };
}

const KEY_RE = new RegExp(`^(${GAME_IDS.join("|")}):(sv|en):([1-9]|10)$`);

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

/**
 * Bring any stored payload up to the current schema. Future versions add a
 * case here; anything unrecognised falls through to defaults.
 */
export function migrate(raw: unknown): AppState {
  if (!isObject(raw)) return defaultState();
  const v = num(raw.v, 0);
  if (v < 1 || v > SCHEMA_VERSION) return defaultState();
  return {
    v: SCHEMA_VERSION,
    settings: parseSettings(raw.settings),
    progress: parseProgress(raw.progress),
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
