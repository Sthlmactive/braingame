import type { StringKey } from "./i18n";

export const GAME_IDS = [
  "five",
  "mini",
  "hive",
  "grid",
  "loop",
  "ordoku",
  "rush",
  "tiles",
] as const;

export type GameId = (typeof GAME_IDS)[number];

export function isGameId(v: unknown): v is GameId {
  return typeof v === "string" && (GAME_IDS as readonly string[]).includes(v);
}

/**
 * The games that still have ten levels, which is every game except Five.
 * Five moved to difficulties and lives at /five, so it has no /g/five routes.
 */
export type UnlevelledGameId = "five" | "mini";

/**
 * The games that still have ten levels: every game except Five and Mini, both
 * of which have difficulties and their own routes.
 */
export const LEVELLED_GAME_IDS = GAME_IDS.filter(
  (g): g is Exclude<GameId, UnlevelledGameId> => g !== "five" && g !== "mini",
);

export function isLevelledGameId(v: unknown): v is Exclude<GameId, UnlevelledGameId> {
  return (
    typeof v === "string" && (LEVELLED_GAME_IDS as readonly string[]).includes(v)
  );
}

export interface GameMeta {
  id: GameId;
  nameKey: StringKey;
  descKey: StringKey;
}

export const GAMES: Record<GameId, GameMeta> = {
  five: {
    id: "five",
    nameKey: "gameFive",
    descKey: "gameFiveDesc",
  },
  mini: {
    id: "mini",
    nameKey: "miniName",
    descKey: "miniTagline",
  },
  hive: {
    id: "hive",
    nameKey: "gameHive",
    descKey: "gameHiveDesc",
  },
  grid: {
    id: "grid",
    nameKey: "gameGrid",
    descKey: "gameGridDesc",
  },
  loop: {
    id: "loop",
    nameKey: "gameLoop",
    descKey: "gameLoopDesc",
  },
  ordoku: {
    id: "ordoku",
    nameKey: "gameOrdoku",
    descKey: "gameOrdokuDesc",
  },
  rush: {
    id: "rush",
    nameKey: "gameRush",
    descKey: "gameRushDesc",
  },
  tiles: {
    id: "tiles",
    nameKey: "gameTiles",
    descKey: "gameTilesDesc",
  },
};

export const GAME_LIST: GameMeta[] = GAME_IDS.map((id) => GAMES[id]);

export const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type Level = (typeof LEVELS)[number];

export function isLevel(v: unknown): v is Level {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10;
}

export function asLevel(v: unknown): Level | null {
  const n = typeof v === "string" ? Number(v) : v;
  return isLevel(n) ? (n as Level) : null;
}
