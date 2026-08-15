"use client";

import dynamic from "next/dynamic";
import { GameShell, type GameProps } from "@/components/GameShell";
import { Loading, NotFound } from "@/components/NotFound";
import { isDifficulty, type Difficulty } from "@/lib/difficulty";
import { isLevelledGameId, type GameId, type UnlevelledGameId } from "@/lib/games";
import { isLang } from "@/lib/i18n";
import { useBandLevel } from "@/lib/useBandLevel";

/**
 * Each game is its own chunk. Opening Hive must not download Tiles, so the
 * boards are loaded on demand rather than imported into one bundle.
 */
const loading = () => <Loading />;

const BOARDS: Record<
  Exclude<GameId, UnlevelledGameId>,
  React.ComponentType<GameProps>
> = {
  hive: dynamic(() => import("@/games/hive/Hive").then((m) => m.Hive), { loading }),
  grid: dynamic(() => import("@/games/grid/Grid").then((m) => m.Grid), { loading }),
  loop: dynamic(() => import("@/games/loop/Loop").then((m) => m.Loop), { loading }),
  ordoku: dynamic(() => import("@/games/ordoku/Ordoku").then((m) => m.Ordoku), {
    loading,
  }),
  rush: dynamic(() => import("@/games/rush/Rush").then((m) => m.Rush), { loading }),
  tiles: dynamic(() => import("@/games/tiles/Tiles").then((m) => m.Tiles), {
    loading,
  }),
};

/** Games that render their own header and full page layout. */
const OWN_CHROME = new Set<GameId>(["hive", "loop", "ordoku", "grid"]);

export function GameBoardScreen({
  game,
  lang,
  difficulty,
}: {
  game: string;
  lang: string;
  difficulty: string;
}) {
  const valid = isDifficulty(difficulty) ? (difficulty as Difficulty) : null;
  const ok = isLevelledGameId(game) && isLang(lang) && valid !== null;
  // Hooks cannot sit behind a return, so the invalid case still calls it with
  // values it will never use.
  const { level, next } = useBandLevel(
    ok ? game : "hive",
    ok ? lang : "sv",
    valid ?? "easy",
  );

  if (!ok) return <NotFound />;
  const Board = BOARDS[game];

  return (
    <GameShell
      game={game}
      lang={lang}
      level={level}
      difficulty={valid}
      // A new round draws the next level from the band's bag, so playing
      // again at the same difficulty is a different puzzle and a different
      // level rather than the same one twice.
      onNextPuzzle={next}
      ownChrome={OWN_CHROME.has(game)}
    >
      {(props) => <Board {...props} />}
    </GameShell>
  );
}
