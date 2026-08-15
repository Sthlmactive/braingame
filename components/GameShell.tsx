"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Screen } from "./Screen";
import { DataError, Loading } from "./NotFound";
import { ResultSheet, type GameResult } from "./ResultSheet";
import { Sheet, SheetButton } from "./Sheet";
import { useApp } from "./AppProvider";
import { GAMES, type GameId, type Level } from "@/lib/games";
import type { Difficulty } from "@/lib/difficulty";
import type { StringKey } from "@/lib/i18n";

const DIFF_NAME: Record<Difficulty, StringKey> = {
  easy: "diffEasy",
  medium: "diffMedium",
  hard: "diffHard",
  extreme: "diffExtreme",
};
import type { Lang } from "@/lib/i18n";
import { loadLanguage } from "@/lib/dictionary";
import { play } from "@/lib/sound";

export interface GameProps {
  lang: Lang;
  level: Level;
  /** Changes on every restart so a game can reset all of its state. */
  runId: number;
  onFinish: (result: GameResult) => void;
  /** Lets a game publish a line of status into the header. */
  setStatus: (status: ReactNode) => void;
  /**
   * Lets a game decide what giving up looks like, so the result sheet can
   * still reveal the answer. Returning null falls back to a plain zero.
   */
  onGiveUp: (fn: () => GameResult | null) => void;
  /**
   * Opens the give up confirmation. Games drawing their own chrome call this
   * from wherever they put the control.
   */
  requestGiveUp: () => void;
}

/**
 * Everything the seven games share: loading the language, the header, give up,
 * recording the run, and the result sheet. A game only implements its board.
 */
export function GameShell({
  game,
  lang,
  level,
  difficulty,
  onNextPuzzle,
  ownChrome = false,
  children,
}: {
  game: GameId;
  lang: Lang;
  level: Level;
  /** Which band this round was drawn from. Levels are not user facing. */
  difficulty?: Difficulty;
  /** Draws the next level from the band's bag when the player plays again. */
  onNextPuzzle?: () => void;
  /**
   * The game draws its own header and page frame. The shell still owns
   * loading, giving up, recording the run and the result sheet.
   */
  ownChrome?: boolean;
  children: (props: GameProps) => ReactNode;
}) {
  const { t, record } = useApp();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [runId, setRunId] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [isBest, setIsBest] = useState(false);
  const [status, setStatus] = useState<ReactNode>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const finished = useRef(false);
  const giveUpFn = useRef<(() => GameResult | null) | null>(null);
  const registerGiveUp = useCallback((fn: () => GameResult | null) => {
    giveUpFn.current = fn;
  }, []);

  const load = useCallback(() => {
    setPhase("loading");
    let cancelled = false;
    loadLanguage(lang).then(
      () => !cancelled && setPhase("ready"),
      () => !cancelled && setPhase("error"),
    );
    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => load(), [load]);

  const onFinish = useCallback(
    (r: GameResult) => {
      // A game can race a timer against a final move; only the first counts.
      if (finished.current) return;
      finished.current = true;
      play(r.cleared ? "win" : "bad");
      const { isBestScore } = record(game, lang, level, {
        cleared: r.cleared,
        score: r.score,
        timeMs: r.timeMs,
      });
      setIsBest(isBestScore);
      setResult(r);
    },
    [game, lang, level, record],
  );

  const restart = useCallback(() => {
    onNextPuzzle?.();
    finished.current = false;
    giveUpFn.current = null;
    setResult(null);
    setIsBest(false);
    setStatus(null);
    setRunId((n) => n + 1);
  }, [onNextPuzzle]);

  const meta = GAMES[game];

  if (phase === "error") return <DataError onRetry={load} />;

  const board = (
    <>
      {children({
        lang,
        level,
        runId,
        onFinish,
        setStatus,
        onGiveUp: registerGiveUp,
        requestGiveUp: () => setConfirmQuit(true),
      })}
    </>
  );

  const sheets = (
    <>
      <Sheet
        open={confirmQuit}
        onClose={() => setConfirmQuit(false)}
        title={t("giveUp")}
      >
        <div className="flex flex-col gap-2 pt-1 pb-2">
          <SheetButton
            variant="danger"
            onClick={() => {
              setConfirmQuit(false);
              onFinish(
                giveUpFn.current?.() ?? {
                  cleared: false,
                  score: 0,
                  timeMs: 0,
                  reason: "gaveUp",
                },
              );
            }}
          >
            {t("giveUp")}
          </SheetButton>
          <SheetButton onClick={() => setConfirmQuit(false)}>
            {t("cancel")}
          </SheetButton>
        </div>
      </Sheet>

      <ResultSheet
        open={result !== null}
        result={result}
        isBestScore={isBest}
        onPlayAgain={restart}
      />
    </>
  );

  if (ownChrome) {
    return (
      <div
        className="game-surface"
        style={{ ["--accent" as string]: meta.accent }}
      >
        {phase === "loading" ? (
          <div className="flex min-h-dvh flex-col">
            <Loading />
          </div>
        ) : (
          <div key={runId} className="contents">
            {board}
          </div>
        )}
        {sheets}
      </div>
    );
  }

  return (
    <Screen
      title={t(meta.nameKey)}
      subtitle={difficulty ? t(DIFF_NAME[difficulty]) : undefined}
      game={game}
      right={
        <div className="flex items-center gap-3">
          {status}
          <button
            type="button"
            className="tap px-1 text-xs font-semibold text-[var(--muted)]"
            onClick={() => setConfirmQuit(true)}
          >
            {t("giveUp")}
          </button>
        </div>
      }
    >
      {phase === "loading" ? (
        <Loading />
      ) : (
        <div key={runId} className="flex min-h-0 flex-1 flex-col">
          {board}
        </div>
      )}

      {sheets}
    </Screen>
  );
}
