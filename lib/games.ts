import type { StringKey } from "./i18n";

export const GAME_IDS = [
  "five",
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
export const LEVELLED_GAME_IDS = GAME_IDS.filter(
  (g): g is Exclude<GameId, "five"> => g !== "five",
);

export function isLevelledGameId(v: unknown): v is Exclude<GameId, "five"> {
  return (
    typeof v === "string" && (LEVELLED_GAME_IDS as readonly string[]).includes(v)
  );
}

export interface GameMeta {
  id: GameId;
  /** CSS variable name holding this game's accent. */
  accentVar: string;
  accent: string;
  nameKey: StringKey;
  descKey: StringKey;
}

export const GAMES: Record<GameId, GameMeta> = {
  five: {
    id: "five",
    accentVar: "--accent-five",
    accent: "#5B7CFF",
    nameKey: "gameFive",
    descKey: "gameFiveDesc",
  },
  hive: {
    id: "hive",
    accentVar: "--accent-hive",
    accent: "#E2A93E",
    nameKey: "gameHive",
    descKey: "gameHiveDesc",
  },
  grid: {
    id: "grid",
    accentVar: "--accent-grid",
    accent: "#37B98A",
    nameKey: "gameGrid",
    descKey: "gameGridDesc",
  },
  loop: {
    id: "loop",
    accentVar: "--accent-loop",
    accent: "#C05CE0",
    nameKey: "gameLoop",
    descKey: "gameLoopDesc",
  },
  ordoku: {
    id: "ordoku",
    accentVar: "--accent-ordoku",
    accent: "#3FBBD1",
    nameKey: "gameOrdoku",
    descKey: "gameOrdokuDesc",
  },
  rush: {
    id: "rush",
    accentVar: "--accent-rush",
    accent: "#F2664B",
    nameKey: "gameRush",
    descKey: "gameRushDesc",
  },
  tiles: {
    id: "tiles",
    accentVar: "--accent-tiles",
    accent: "#7C8CA0",
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
