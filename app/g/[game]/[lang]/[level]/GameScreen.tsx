"use client";

import dynamic from "next/dynamic";
import { GameShell, type GameProps } from "@/components/GameShell";
import { Loading, NotFound } from "@/components/NotFound";
import { asLevel, isLevelledGameId, type GameId } from "@/lib/games";
import { isLang } from "@/lib/i18n";

/**
 * Each game is its own chunk. Opening Five must not download Tiles, so the
 * boards are loaded on demand rather than imported into one bundle.
 */
const loading = () => <Loading />;

/** Five is not here: it has no levels and lives at /five. */
const BOARDS: Record<Exclude<GameId, "five">, React.ComponentType<GameProps>> = {
  hive: dynamic(() => import("@/games/hive/Hive").then((m) => m.Hive), {
    loading,
  }),
  grid: dynamic(() => import("@/games/grid/Grid").then((m) => m.Grid), {
    loading,
  }),
  loop: dynamic(() => import("@/games/loop/Loop").then((m) => m.Loop), {
    loading,
  }),
  ordoku: dynamic(() => import("@/games/ordoku/Ordoku").then((m) => m.Ordoku), {
    loading,
  }),
  rush: dynamic(() => import("@/games/rush/Rush").then((m) => m.Rush), {
    loading,
  }),
  tiles: dynamic(() => import("@/games/tiles/Tiles").then((m) => m.Tiles), {
    loading,
  }),
};

/** Games that render their own header and full page layout. */
const OWN_CHROME = new Set<GameId>(["hive", "loop", "ordoku", "grid"]);

export function GameScreen({
  game,
  lang,
  level,
}: {
  game: string;
  lang: string;
  level: string;
}) {
  const lvl = asLevel(level);
  if (!isLevelledGameId(game) || !isLang(lang) || lvl === null) return <NotFound />;
  const Board = BOARDS[game];

  return (
    <GameShell
      game={game}
      lang={lang}
      level={lvl}
      // These games draw their own header and page frame.
      ownChrome={OWN_CHROME.has(game)}
    >
      {(props) => <Board {...props} />}
    </GameShell>
  );
}
