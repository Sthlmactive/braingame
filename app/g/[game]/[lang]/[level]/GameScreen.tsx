"use client";

import dynamic from "next/dynamic";
import { GameShell, type GameProps } from "@/components/GameShell";
import { Loading, NotFound } from "@/components/NotFound";
import { asLevel, isGameId, type GameId } from "@/lib/games";
import { isLang } from "@/lib/i18n";

/**
 * Each game is its own chunk. Opening Five must not download Tiles, so the
 * boards are loaded on demand rather than imported into one bundle.
 */
const loading = () => <Loading />;

const BOARDS: Record<GameId, React.ComponentType<GameProps>> = {
  five: dynamic(() => import("@/games/five/Five").then((m) => m.Five), {
    loading,
  }),
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
  if (!isGameId(game) || !isLang(lang) || lvl === null) return <NotFound />;
  const Board = BOARDS[game];

  return (
    <GameShell game={game} lang={lang} level={lvl}>
      {(props) => <Board {...props} />}
    </GameShell>
  );
}
