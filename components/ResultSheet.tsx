"use client";

import { useRouter } from "next/navigation";
import { Sheet, SheetButton } from "./Sheet";
import { useApp } from "./AppProvider";
import { formatTime, type StringKey } from "@/lib/i18n";
import type { GameId, Level } from "@/lib/games";

export type FinishReason =
  | "solved"
  | "outOfGuesses"
  | "timeUp"
  | "gaveUp"
  | "notCleared";

export interface GameResult {
  cleared: boolean;
  score: number;
  timeMs: number;
  reason: FinishReason;
  /** e.g. the hidden word, shown when the player did not get it. */
  revealWord?: string;
  /** A line of extra context, already translated by the game. */
  note?: string;
}

const REASON_KEY: Record<FinishReason, StringKey> = {
  solved: "solved",
  outOfGuesses: "outOfGuesses",
  timeUp: "timeUp",
  gaveUp: "gaveUp",
  notCleared: "notCleared",
};

export function ResultSheet({
  open,
  result,
  game,
  level,
  isBestScore,
  onPlayAgain,
}: {
  open: boolean;
  result: GameResult | null;
  game: GameId;
  level: Level;
  isBestScore: boolean;
  onPlayAgain: () => void;
}) {
  const router = useRouter();
  const { t, lang } = useApp();
  if (!result) return null;

  const hasNext = level < 10;

  return (
    <Sheet open={open} dismissable={false} title={t(REASON_KEY[result.reason])}>
      <div className="pb-4">
        <p className="text-sm text-[var(--muted)]">
          {result.cleared ? t("cleared") : t("notCleared")}
        </p>

        {result.revealWord ? (
          <p className="font-display mt-3 text-lg font-bold">
            {t("theWordWas", { w: result.revealWord.toUpperCase() })}
          </p>
        ) : null}

        {result.note ? (
          <p className="mt-2 text-sm text-[var(--muted)]">{result.note}</p>
        ) : null}

        <div className="mt-4 flex gap-6">
          <Stat label={t("score")} value={String(result.score)} />
          {result.timeMs > 0 ? (
            <Stat label={t("timeLeft")} value={formatTime(result.timeMs)} />
          ) : null}
          {isBestScore ? (
            <Stat label={t("newBest")} value="★" accent />
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 pb-2">
        {result.cleared && hasNext ? (
          <SheetButton
            variant="loud"
            onClick={() => router.replace(`/g/${game}/${lang}/${level + 1}`)}
          >
            {t("nextLevel")}
          </SheetButton>
        ) : null}
        <SheetButton
          variant={result.cleared && hasNext ? "quiet" : "loud"}
          onClick={onPlayAgain}
        >
          {t("playAgain")}
        </SheetButton>
        <SheetButton onClick={() => router.push("/")}>{t("home")}</SheetButton>
      </div>
    </Sheet>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className="font-display text-2xl font-bold"
        style={accent ? { color: "var(--accent)" } : undefined}
      >
        {value}
      </div>
      <div className="text-[0.7rem] tracking-wide text-[var(--muted)] uppercase">
        {label}
      </div>
    </div>
  );
}
