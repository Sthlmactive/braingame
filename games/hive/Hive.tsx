"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameProps } from "@/components/GameShell";
import { PuzzleError } from "@/components/NotFound";
import { Sheet, SheetButton } from "@/components/Sheet";
import { useApp } from "@/components/AppProvider";
import { GAMES } from "@/lib/games";
import { hiveConfig } from "@/lib/levels";
import { mulberry32, randomSeed, shuffle } from "@/lib/rng";
import { formatTime, type StringKey } from "@/lib/i18n";
import { play } from "@/lib/sound";
import { useCountdown } from "@/lib/useCountdown";
import { Honeycomb } from "./Honeycomb";
import { generateHive, hasCleared, submitWord, type HivePuzzle } from "./engine";

interface Toast {
  id: number;
  text: string;
  tone: "bad" | "good";
}

export function Hive({
  lang,
  level,
  onFinish,
  onGiveUp,
  requestGiveUp,
}: GameProps) {
  const { t } = useApp();
  const router = useRouter();
  const cfg = useMemo(() => hiveConfig(level), [level]);
  const puzzle = useMemo<HivePuzzle | null>(
    () => generateHive(lang, cfg, mulberry32(randomSeed())),
    [lang, cfg],
  );

  const [outer, setOuter] = useState<string[]>(() => puzzle?.outer ?? []);
  const [typed, setTyped] = useState("");
  const [found, setFound] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const startedAt = useRef(Date.now());
  const toastId = useRef(0);

  const foundSet = useMemo(() => new Set(found), [found]);
  const gotPangram = useMemo(
    () => (puzzle ? found.some((w) => puzzle.pangrams.includes(w)) : false),
    [found, puzzle],
  );

  const finish = useCallback(
    (reason: "solved" | "timeUp" | "notCleared") => {
      if (!puzzle) return;
      const cleared = hasCleared(score, puzzle, cfg, gotPangram);
      onFinish({
        cleared,
        score,
        timeMs: Date.now() - startedAt.current,
        reason: cleared ? "solved" : reason,
        note: cleared
          ? undefined
          : cfg.requirePangram && !gotPangram
            ? t("needPangram")
            : t("needScore", {
                n: Math.ceil((puzzle.maxScore * cfg.scoreToClear) / 100),
              }),
      });
    },
    [puzzle, score, cfg, gotPangram, onFinish, t],
  );

  const remaining = useCountdown(cfg.seconds, () => finish("timeUp"));

  useEffect(() => {
    onGiveUp(() => ({
      cleared: false,
      score,
      timeMs: Date.now() - startedAt.current,
      reason: "gaveUp",
    }));
  }, [onGiveUp, score]);

  const showToast = useCallback((text: string, tone: "bad" | "good") => {
    toastId.current += 1;
    const id = toastId.current;
    setToast({ id, text, tone });
    // The slot stays reserved either way; this only clears the text.
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 1200);
  }, []);

  const submit = useCallback(() => {
    if (!puzzle || typed.length === 0) return;
    const res = submitWord(typed, puzzle, foundSet);
    setTyped("");

    if (!res.ok) {
      const key: StringKey =
        res.reason === "tooShort"
          ? "tooShort"
          : res.reason === "missingCentre"
            ? "missingCentre"
            : res.reason === "alreadyFound"
              ? "alreadyFound"
              : "notAWord";
      showToast(
        key === "tooShort" ? t("tooShort", { n: puzzle.minLength }) : t(key),
        "bad",
      );
      play("bad");
      return;
    }

    play(res.pangram ? "win" : "good");
    setFound((f) => [res.word, ...f]);
    setScore((s) => s + res.score);
    showToast(res.pangram ? t("pangram") : `+${res.score}`, "good");
  }, [puzzle, typed, foundSet, showToast, t]);

  // Finding every word ends the round early.
  useEffect(() => {
    if (puzzle && found.length > 0 && found.length === puzzle.answers.length) {
      finish("solved");
    }
  }, [found.length, puzzle, finish]);

  const tap = useCallback((letter: string) => {
    setTyped((s) => (s.length >= 14 ? s : s + letter));
    play("tap");
  }, []);

  if (!puzzle) return <PuzzleError onRetry={() => window.location.reload()} />;

  const needed = Math.ceil((puzzle.maxScore * cfg.scoreToClear) / 100);
  const progress = Math.min(1, found.length / Math.max(1, puzzle.answers.length));

  return (
    <div
      className="mx-auto flex w-full max-w-[420px] flex-col"
      style={{
        height: "100dvh",
        paddingTop: "max(var(--safe-t), 8px)",
        paddingBottom: "max(var(--safe-b), 8px)",
        paddingLeft: "max(var(--safe-l), 16px)",
        paddingRight: "max(var(--safe-r), 16px)",
      }}
    >
      {/* Header ---------------------------------------------------------- */}
      <header className="flex shrink-0 items-center gap-2 pb-2">
        <button
          type="button"
          className="tap -ml-2 grid shrink-0 place-items-center rounded-full text-[var(--muted)]"
          onClick={() => router.back()}
          aria-label={t("back")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-lg leading-tight font-bold">
            {t(GAMES.hive.nameKey)}
          </h1>
          <p className="truncate text-xs text-[var(--muted)]">
            {t("levelN", { n: level })}
            {cfg.seconds > 0 ? ` · ${formatTime(remaining * 1000)}` : ""}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div className="font-display text-lg leading-tight font-bold">
            {t("scorePoints", { n: score })}
          </div>
          <div className="text-xs text-[var(--muted)]">
            {t("goalN", { n: needed })}
          </div>
        </div>

        {/* Giving up is a rare action, so it hides behind the overflow. */}
        <button
          type="button"
          className="tap -mr-2 grid shrink-0 place-items-center rounded-full text-[var(--muted)]"
          onClick={() => setMenuOpen(true)}
          aria-label={t("more")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <circle cx="5" cy="12" r="1.8" fill="currentColor" />
            <circle cx="12" cy="12" r="1.8" fill="currentColor" />
            <circle cx="19" cy="12" r="1.8" fill="currentColor" />
          </svg>
        </button>
      </header>

      {/* Progress -------------------------------------------------------- */}
      <div className="shrink-0 pb-2">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--line)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: "var(--accent)",
              transition: "width 220ms var(--ease-soft)",
            }}
          />
        </div>
        <div className="flex justify-between pt-1 text-[0.7rem] text-[var(--muted)]">
          <span>
            {t("wordsOfTotal", { n: found.length, m: puzzle.answers.length })}
          </span>
          {cfg.requirePangram ? (
            <span style={{ color: gotPangram ? "var(--correct)" : undefined }}>
              {t("pangram")} {gotPangram ? "✓" : "—"}
            </span>
          ) : null}
        </div>
      </div>

      {/* Found words ----------------------------------------------------- */}
      <button
        type="button"
        className="no-scrollbar h-[34px] shrink-0 overflow-x-auto overflow-y-hidden text-left"
        onClick={() => found.length > 0 && setListOpen(true)}
        aria-label={t("foundWords")}
      >
        <div className="flex h-full items-center gap-1.5 whitespace-nowrap">
          {found.length === 0 ? (
            <span className="text-[0.72rem] text-[var(--muted)]">
              {t("foundWords")}
            </span>
          ) : (
            found.map((w) => {
              const pangram = puzzle.pangrams.includes(w);
              return (
                <span
                  key={w}
                  className="shrink-0 rounded-md px-2 py-1 text-[0.72rem]"
                  style={{
                    background: "var(--surface)",
                    color: pangram ? "var(--accent)" : "var(--muted)",
                    border: `1px solid ${pangram ? "var(--accent)" : "transparent"}`,
                  }}
                >
                  {w}
                </span>
              );
            })
          )}
        </div>
      </button>

      {/* Toast slot, always reserved so nothing below ever shifts --------- */}
      <div className="flex h-[26px] shrink-0 items-center justify-center">
        {toast ? (
          <span
            key={toast.id}
            className="toast-enter rounded-lg px-3 py-1 text-xs font-semibold"
            style={{
              background: toast.tone === "good" ? "var(--accent)" : "var(--text)",
              color: "var(--on-state)",
            }}
            role="status"
          >
            {toast.text}
          </span>
        ) : null}
      </div>

      {/* Word being typed ------------------------------------------------ */}
      <div className="flex h-[44px] shrink-0 items-center justify-center">
        {typed.length === 0 ? (
          <span className="text-sm text-[var(--muted)]">{t("typeAWord")}</span>
        ) : (
          <span className="font-display flex items-center text-[1.6rem] leading-none font-bold tracking-[0.14em] uppercase">
            {[...typed].map((ch, i) => (
              <span
                key={i}
                style={{
                  color:
                    ch === puzzle.centre ? "var(--accent)" : "var(--text)",
                }}
              >
                {ch}
              </span>
            ))}
            <span
              className="caret ml-0.5 inline-block"
              style={{
                width: 2,
                height: "1.15em",
                background: "var(--accent)",
              }}
              aria-hidden
            />
          </span>
        )}
      </div>

      {/* Hive ------------------------------------------------------------ */}
      <div className="grid min-h-0 flex-1 place-items-center py-2">
        <Honeycomb centre={puzzle.centre} outer={outer} onTap={tap} />
      </div>

      {/* Controls -------------------------------------------------------- */}
      <div className="flex shrink-0 items-center justify-center gap-3 pt-2">
        <button
          type="button"
          className="tap rounded-full px-5 text-sm font-semibold"
          style={{ height: 48, border: "1px solid var(--line)" }}
          onClick={() => {
            setTyped((s) => s.slice(0, -1));
            play("tap");
          }}
        >
          {t("del")}
        </button>

        <button
          type="button"
          className="tap grid place-items-center rounded-full"
          style={{
            width: 48,
            height: 48,
            border: "1px solid var(--line)",
            color: "var(--text)",
          }}
          onClick={() => {
            // Only the ring moves. The centre letter is required in every
            // word, so shuffling it would be actively confusing.
            setOuter((o) => shuffle([...o], mulberry32(randomSeed())));
            play("tap");
          }}
          aria-label={t("shuffle")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 7h4l8 10h4M4 17h4l2-2.5M16 7h4M18 5l2 2-2 2M18 15l2 2-2 2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          className="tap rounded-full px-6 text-sm font-semibold"
          style={{
            height: 48,
            background: "var(--accent)",
            color: "var(--on-state)",
          }}
          onClick={submit}
        >
          {t("submit")}
        </button>
      </div>

      {/* Full found list ------------------------------------------------- */}
      <Sheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={t("foundWords")}
      >
        <div className="max-h-[60dvh] overflow-y-auto pb-4">
          {groupByLength(found).map(([len, words]) => (
            <div key={len} className="pb-3">
              <div className="pb-1.5 text-[0.7rem] tracking-wide text-[var(--muted)] uppercase">
                {t("nLetters", { n: len })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {words.map((w) => {
                  const pangram = puzzle.pangrams.includes(w);
                  return (
                    <span
                      key={w}
                      className="rounded-md px-2 py-1 text-[0.78rem]"
                      style={{
                        background: "var(--surface)",
                        color: pangram ? "var(--accent)" : "var(--text)",
                        border: `1px solid ${pangram ? "var(--accent)" : "transparent"}`,
                      }}
                    >
                      {w}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Sheet>

      {/* Overflow menu --------------------------------------------------- */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t("more")}>
        <div className="flex flex-col gap-2 pt-1 pb-2">
          <SheetButton
            variant="danger"
            onClick={() => {
              setMenuOpen(false);
              // The shell owns the confirm step.
              requestGiveUp();
            }}
          >
            {t("giveUp")}
          </SheetButton>
          <SheetButton onClick={() => setMenuOpen(false)}>
            {t("cancel")}
          </SheetButton>
        </div>
      </Sheet>
    </div>
  );
}

/** Longest first, and alphabetical inside each length. */
function groupByLength(words: string[]): Array<[number, string[]]> {
  const byLength = new Map<number, string[]>();
  for (const w of words) {
    const list = byLength.get(w.length);
    if (list) list.push(w);
    else byLength.set(w.length, [w]);
  }
  return [...byLength.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([len, list]) => [len, [...list].sort()] as [number, string[]]);
}
