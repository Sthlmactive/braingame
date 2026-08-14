import type { Lang } from "./i18n";

/**
 * A side channel for diagnosing "it rejected a word I know".
 *
 * Every refused guess is appended to localStorage so a real rejection can be
 * read back off the phone that saw it, instead of being reconstructed from
 * memory. There is no UI: this is a debugging aid, not a feature.
 *
 * Deliberately NOT gated on NODE_ENV. The rejections worth reading happen on a
 * real phone playing the deployed build, which is a production bundle, so a dev
 * only gate would log exactly nothing useful. It stays cheap instead: a bounded
 * ring buffer of small records, capped well under any quota, and every write is
 * wrapped so a full or disabled storage can never interrupt a game.
 *
 * To read it:   JSON.parse(localStorage.getItem("ordlek.debug.rejects"))
 * To clear it:  localStorage.removeItem("ordlek.debug.rejects")
 */

export const REJECT_LOG_KEY = "ordlek.debug.rejects";

/** Oldest entries are dropped once the log is this long. */
export const REJECT_LOG_LIMIT = 200;

export interface RejectEntry {
  /** The word as typed, already normalised the way lookup sees it. */
  word: string;
  length: number;
  lang: Lang;
  /** Level number for the games still on levels, difficulty slug for Five. */
  level: string;
  /** Which check refused it. */
  reason: string;
  /** Epoch milliseconds, so entries can be ordered and aged. */
  at: number;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRejects(): RejectEntry[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(REJECT_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RejectEntry[]) : [];
  } catch {
    // Corrupt payload is not worth repairing; the next write starts over.
    return [];
  }
}

/** Append one refused guess. Never throws. */
export function logReject(entry: Omit<RejectEntry, "at">): void {
  const s = storage();
  if (!s) return;
  try {
    const log = readRejects();
    log.push({ ...entry, at: Date.now() });
    // Keep the newest, so a long session cannot push out what just happened.
    const trimmed =
      log.length > REJECT_LOG_LIMIT ? log.slice(log.length - REJECT_LOG_LIMIT) : log;
    s.setItem(REJECT_LOG_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota, private mode, anything at all. A debug log never breaks a game.
  }
}

export function clearRejects(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(REJECT_LOG_KEY);
  } catch {
    // ignore
  }
}
