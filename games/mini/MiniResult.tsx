"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { useApp } from "@/components/AppProvider";
import type { MiniStat } from "@/lib/storage";
import type { Difficulty } from "@/lib/difficulty";
import type { Lang, StringKey } from "@/lib/i18n";

const DIFFICULTY_KEY: Record<Difficulty, StringKey> = {
  easy: "diffEasy",
  medium: "diffMedium",
  hard: "diffHard",
  extreme: "diffExtreme",
};

/** mm:ss. A mini is a speed game, so the clock is the headline. */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Mini's result sheet, built as Five's is: a destination rather than a modal,
 * with the one tap that matters — Nytt kryss — starting the next puzzle in
 * place, no route change and no picker.
 *
 * The only state colour in Mini lives here, on the time when it is a personal
 * best. Nothing on the board is ever coloured: a crossword reports nothing
 * until it is finished, so there is no state for colour to mean.
 */
export function MiniResult({
  open,
  seconds,
  isBest,
  stat,
  lang,
  difficulty,
  onNewPuzzle,
}: {
  open: boolean;
  seconds: number;
  isBest: boolean;
  stat: MiniStat;
  lang: Lang;
  difficulty: Difficulty;
  onNewPuzzle: () => void;
}) {
  const router = useRouter();
  const { t } = useApp();
  const [shared, setShared] = useState(false);

  const share = useCallback(() => {
    const text = `${t("appName")} · ${t("miniName")} · ${t(DIFFICULTY_KEY[difficulty])} · ${formatTime(seconds)}`;
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    if (nav?.share) {
      void nav.share({ text }).catch(() => undefined);
      return;
    }
    void nav?.clipboard?.writeText(text).then(
      () => {
        setShared(true);
        window.setTimeout(() => setShared(false), 1600);
      },
      () => undefined,
    );
  }, [seconds, difficulty, t]);

  return (
    <Sheet open={open} dismissable={false}>
      <div className="pt-1 pb-5">
        <div className="t-caption tracking-[0.08em] text-[var(--muted)] uppercase">
          {t("timeTaken")}
        </div>
        <div
          className="t-result tnum mt-1.5"
          style={isBest ? { color: "var(--hit)" } : undefined}
        >
          {formatTime(seconds)}
        </div>
        <div className="t-body mt-1.5 text-[var(--muted)]">
          {t(DIFFICULTY_KEY[difficulty])} · {t(lang === "sv" ? "langSv" : "langEn")}
        </div>
      </div>

      <div className="flex gap-2">
        <Stat label={t("timeTaken")} value={formatTime(seconds)} />
        <Stat
          label={t("miniBestTime")}
          value={stat.bestSeconds > 0 ? formatTime(stat.bestSeconds) : "—"}
        />
        <Stat label={t("currentStreak")} value={String(stat.streak)} />
      </div>

      <div className="flex flex-col gap-2 pt-6 pb-2">
        <button
          type="button"
          onClick={onNewPuzzle}
          className="t-row tap w-full"
          style={{
            background: "var(--ink)",
            color: "var(--paper)",
            borderRadius: "var(--radius-card)",
            padding: "14px 16px",
          }}
        >
          {t("newCross")}
        </button>
        <div className="flex gap-2">
          <OutlineButton onClick={() => router.replace(`/mini/${lang}`)}>
            {t("changeLevel")}
          </OutlineButton>
          <OutlineButton onClick={share}>
            {shared ? t("shareCopied") : t("share")}
          </OutlineButton>
        </div>
      </div>
    </Sheet>
  );
}

function OutlineButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="t-row tap hairline flex-1"
      style={{ borderRadius: "var(--radius-card)", padding: "14px 12px" }}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex-1 px-2 py-3 text-center"
      style={{ background: "var(--raised)", borderRadius: "var(--radius-card)" }}
    >
      <div className="t-row tnum">{value}</div>
      <div className="t-caption mt-0.5 text-[var(--muted)]">{label}</div>
    </div>
  );
}
