"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { useApp } from "@/components/AppProvider";
import { GUESS_BUCKETS, type FiveStat } from "@/lib/storage";
import type { Difficulty } from "@/lib/difficulty";
import type { Lang, StringKey } from "@/lib/i18n";

const DIFFICULTY_KEY: Record<Difficulty, StringKey> = {
  easy: "diffEasy",
  medium: "diffMedium",
  hard: "diffHard",
  extreme: "diffExtreme",
};

/**
 * The screen the endless loop lives on, and now the most visited screen in the
 * app, so it is built as a destination rather than as a modal.
 *
 * Nytt ord is the only thing that should ever need a tap, and it starts the
 * next word in place: no route change, no menu, no returning to a picker.
 *
 * This is the one place outside the board where a state colour is allowed. The
 * bar for the round just played is the result being reported, so it earns
 * `--hit`; every other bar is `--line`.
 */
export function FiveResult({
  open,
  won,
  answer,
  guessesUsed,
  stat,
  lang,
  difficulty,
  wrapped,
  onNewWord,
}: {
  open: boolean;
  won: boolean;
  answer: string;
  guessesUsed: number;
  stat: FiveStat;
  lang: Lang;
  difficulty: Difficulty;
  wrapped: boolean;
  onNewWord: () => void;
}) {
  const router = useRouter();
  const { t } = useApp();
  const [shared, setShared] = useState(false);

  const winRate = stat.played === 0 ? 0 : Math.round((stat.won / stat.played) * 100);
  const most = Math.max(1, ...stat.distribution);

  const share = useCallback(() => {
    const line = won
      ? t("rightIn", { n: guessesUsed })
      : `${t("theWordWasLabel")} ${answer.toUpperCase()}`;
    const text = `${t("appName")} · ${t(DIFFICULTY_KEY[difficulty])} · ${line}`;
    // navigator.share is the good path on a phone; the clipboard is the
    // fallback, and neither failing is worth interrupting the loop over.
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
  }, [won, guessesUsed, answer, difficulty, t]);

  return (
    <Sheet open={open} dismissable={false}>
      <div className="pt-1 pb-5">
        <div className="t-caption tracking-[0.08em] text-[var(--muted)] uppercase">
          {won ? t("rightIn", { n: guessesUsed }) : t("theWordWasLabel")}
        </div>
        <div className="t-result mt-1.5">{answer.toUpperCase()}</div>
        <div className="t-body mt-1.5 text-[var(--muted)]">
          {t(DIFFICULTY_KEY[difficulty])} ·{" "}
          {t(lang === "sv" ? "langSv" : "langEn")}
        </div>

        {/* The bag emptied and reshuffled. Said once, on the word that wrapped. */}
        {wrapped ? (
          <p className="t-body mt-3">{t("allWordsPlayed")}</p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Stat label={t("currentStreak")} value={String(stat.streak)} />
        <Stat label={t("maxStreak")} value={String(stat.maxStreak)} />
        <Stat label={t("wins")} value={`${winRate}%`} />
      </div>

      <div className="pt-5 pb-5">
        <div className="t-caption tracking-[0.08em] text-[var(--muted)] uppercase">
          {t("guessDistribution")}
        </div>
        {stat.played === 0 ? (
          <p className="t-body mt-2 text-[var(--muted)]">{t("noGamesYet")}</p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            {Array.from({ length: GUESS_BUCKETS }, (_, i) => {
              const n = stat.distribution[i] ?? 0;
              const isThis = won && guessesUsed === i + 1;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="t-caption tnum w-3 text-[var(--muted)]">
                    {i + 1}
                  </span>
                  <div
                    className="t-caption tnum flex h-5 items-center justify-end px-1.5 font-semibold"
                    style={{
                      width: `${Math.max(9, (n / most) * 100)}%`,
                      borderRadius: "var(--radius-tile)",
                      background: isThis ? "var(--hit)" : "var(--line)",
                      color: isThis ? "var(--on-state)" : "var(--ink)",
                    }}
                  >
                    {n}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 pb-2">
        <button
          type="button"
          onClick={onNewWord}
          className="t-row tap w-full"
          style={{
            background: "var(--ink)",
            color: "var(--paper)",
            borderRadius: "var(--radius-card)",
            padding: "14px 16px",
          }}
        >
          {t("newWord")}
        </button>
        <div className="flex gap-2">
          <OutlineButton onClick={() => router.replace(`/five/${lang}`)}>
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
  children: React.ReactNode;
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
      className="flex-1 px-3 py-3"
      style={{ background: "var(--raised)", borderRadius: "var(--radius-card)" }}
    >
      <div className="t-title tnum">{value}</div>
      <div className="t-caption mt-0.5 text-[var(--muted)]">{label}</div>
    </div>
  );
}
