import type { Difficulty } from "./difficulty";
import { DIFFICULTIES } from "./difficulty";
import type { GameId, Level } from "./games";
import type { Lang } from "./i18n";

/**
 * Levels 1 to 10 become four difficulties.
 *
 * The ten levels stay exactly as they are — the tuning in lib/levels.ts is
 * good and regenerating it would be a waste — but nobody picks a level any
 * more. A difficulty is a band of them, and starting a round draws one from
 * the band at random through the same shuffled bag Five and Mini use, so you
 * do not get level 4 three times in a row.
 *
 * **Bands break where the rules break.** The obvious 2/3/3/2 split puts a
 * rule change inside a band on three of the six games, which would mean two
 * rounds at the same difficulty playing by different rules:
 *
 *   - Hive requires a pangram from level 8, so Extrem is 8-10.
 *   - Rush starts peeling tiles every 45s from level 7, so Svår is 7-8.
 *   - Tiles adds a 60s turn clock from level 8, so Extrem is 8-10.
 *   - Ordoku stops dimming used values after level 3, so Lätt is 1-3.
 *
 * Grid and Loop take the default: Grid's only step is columns-must-be-words
 * at level 9, which already lands on a boundary, and Loop is a pure ramp with
 * no steps at all.
 */

const DEFAULT_BANDS: Record<Difficulty, readonly Level[]> = {
  easy: [1, 2],
  medium: [3, 4, 5],
  hard: [6, 7, 8],
  extreme: [9, 10],
};

const BANDS: Partial<Record<GameId, Record<Difficulty, readonly Level[]>>> = {
  // Pangram required from 8.
  hive: {
    easy: [1, 2],
    medium: [3, 4, 5],
    hard: [6, 7],
    extreme: [8, 9, 10],
  },
  // Tiles start peeling from 7.
  rush: {
    easy: [1, 2],
    medium: [3, 4, 5, 6],
    hard: [7, 8],
    extreme: [9, 10],
  },
  // Turn clock from 8.
  tiles: {
    easy: [1, 2],
    medium: [3, 4, 5],
    hard: [6, 7],
    extreme: [8, 9, 10],
  },
  // Used values stop dimming after 3.
  ordoku: {
    easy: [1, 2, 3],
    medium: [4, 5],
    hard: [6, 7, 8],
    extreme: [9, 10],
  },
};

/** The levels a difficulty draws from, for this game. */
export function levelsIn(game: GameId, difficulty: Difficulty): readonly Level[] {
  return (BANDS[game] ?? DEFAULT_BANDS)[difficulty];
}

/** The bag's pool. Strings, because that is what lib/bag.ts shuffles. */
export function levelPool(game: GameId, difficulty: Difficulty): string[] {
  return levelsIn(game, difficulty).map(String);
}

/**
 * Fingerprint of the pool. Changing a band re-shuffles rather than leaving a
 * cursor pointing into a list that no longer exists.
 */
export function bandHash(game: GameId, difficulty: Difficulty): string {
  return `${game}:${difficulty}:${levelsIn(game, difficulty).join(",")}`;
}

/** Namespaced so a game's level bag cannot collide with Five's word bag. */
export function bandBagKey(
  game: GameId,
  lang: Lang,
  difficulty: Difficulty,
): string {
  return `band:${game}:${lang}:${difficulty}`;
}

/** Every level appears in exactly one band. Asserted in the tests. */
export function coverage(game: GameId): Level[] {
  return DIFFICULTIES.flatMap((d) => [...levelsIn(game, d)]);
}
