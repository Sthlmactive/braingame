import type { Difficulty } from "./difficulty";
import type { Lang } from "./i18n";
import { mulberry32, randomSeed, shuffle } from "./rng";

/**
 * The shuffled bag that decides which word comes next.
 *
 * Never Math.random() over the pool: that repeats words long before it has
 * shown them all. A bag draws every word exactly once, then reshuffles.
 *
 * What is stored is a seed and a cursor, not the shuffled array, so the whole
 * permutation of a few thousand words costs a handful of bytes. The order is
 * rebuilt from the seed on demand and memoised.
 */

export const BAG_KEY = "ordlek.five.bag.v1";

export interface BagState {
  seed: number;
  cursor: number;
  /**
   * Fingerprint of the pool this cursor indexes into. A rebuild that reorders
   * the pool changes it, which is the signal to start the bag over rather than
   * carry on pointing at whatever now sits at that index.
   */
  hash: string;
}

/** Keyed by `${lang}:${difficulty}`, e.g. "sv:easy". */
export type BagStore = Record<string, BagState>;

export function bagKey(lang: Lang, level: Difficulty): string {
  return `${lang}:${level}`;
}

// ---------------------------------------------------------------------------
// The permutation
// ---------------------------------------------------------------------------

const orders = new Map<string, string[]>();

/**
 * The pool in bag order. Memoised per seed and pool, because a Fisher-Yates
 * over a few thousand strings is cheap once and wasteful on every render.
 */
export function bagOrder(
  pool: readonly string[],
  seed: number,
  hash: string,
): string[] {
  const key = `${hash}:${seed}`;
  const cached = orders.get(key);
  if (cached) return cached;
  const order = shuffle([...pool], mulberry32(seed));
  orders.set(key, order);
  return order;
}

/** Test hook, so a memoised order cannot leak between cases. */
export function clearBagOrders(): void {
  orders.clear();
}

// ---------------------------------------------------------------------------
// State transitions, all pure
// ---------------------------------------------------------------------------

function isBagState(v: unknown): v is BagState {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.seed === "number" &&
    Number.isFinite(b.seed) &&
    typeof b.cursor === "number" &&
    Number.isInteger(b.cursor) &&
    b.cursor >= 0 &&
    typeof b.hash === "string"
  );
}

/**
 * The bag to use now. Starts a fresh one when there is none, when the pool has
 * changed underneath it, or when the cursor no longer addresses the pool.
 */
export function ensureBag(
  stored: unknown,
  hash: string,
  poolLength: number,
  seedFn: () => number = randomSeed,
): BagState {
  if (
    isBagState(stored) &&
    stored.hash === hash &&
    stored.cursor < poolLength &&
    poolLength > 0
  ) {
    return stored;
  }
  return { seed: seedFn(), cursor: 0, hash };
}

/** The word this bag is currently pointing at. */
export function currentWord(
  pool: readonly string[],
  state: BagState,
): string | null {
  if (pool.length === 0) return null;
  const order = bagOrder(pool, state.seed, state.hash);
  return order[state.cursor] ?? null;
}

/**
 * Move to the next word. When the bag runs out it is reshuffled under a new
 * seed and `wrapped` is set, which is what the "you have played every word"
 * line keys off. It is reported once, on the draw that wraps.
 */
export function advance(
  state: BagState,
  poolLength: number,
  seedFn: () => number = randomSeed,
): { state: BagState; wrapped: boolean } {
  const next = state.cursor + 1;
  if (next >= poolLength) {
    return { state: { seed: seedFn(), cursor: 0, hash: state.hash }, wrapped: true };
  }
  return { state: { ...state, cursor: next }, wrapped: false };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadBags(): BagStore {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(BAG_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: BagStore = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isBagState(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveBag(key: string, state: BagState): void {
  const s = storage();
  if (!s) return;
  try {
    const all = loadBags();
    all[key] = state;
    s.setItem(BAG_KEY, JSON.stringify(all));
  } catch {
    // Quota or private mode. A lost cursor costs a repeated word, not a crash.
  }
}
