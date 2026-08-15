"use client";

import { useRouter } from "next/navigation";
import { Sheet, SheetButton } from "./Sheet";
import { useApp } from "./AppProvider";
import { formatTime, type StringKey } from "@/lib/i18n";

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
  isBestScore,
  onPlayAgain,
}: {
  open: boolean;
  result: GameResult | null;
  isBestScore: boolean;
  onPlayAgain: () => void;
}) {
  const router = useRouter();
  const { t } = useApp();
  if (!result) return null;

  return (
    <Sheet open={open} dismissable={false} title={t(REASON_KEY[result.reason])}>
      <div className="pb-4">
        <p className="t-body text-[var(--muted)]">
          {result.cleared ? t("cleared") : t("notCleared")}
        </p>

        {result.revealWord ? (
          <p className="t-title mt-3">
            {t("theWordWas", { w: result.revealWord.toUpperCase() })}
          </p>
        ) : null}

        {result.note ? (
          <p className="t-body mt-2 text-[var(--muted)]">{result.note}</p>
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

      {/* No "next level": levels are not a user facing concept any more. Play
          again draws the next one from this difficulty's band. */}
      <div className="flex flex-col gap-2 pb-2">
        <SheetButton variant="loud" onClick={onPlayAgain}>
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
        className="t-option"
        style={accent ? { color: "var(--ink)" } : undefined}
      >
        {value}
      </div>
      <div className="t-caption tracking-wide text-[var(--muted)] uppercase">
        {label}
      </div>
    </div>
  );
}
