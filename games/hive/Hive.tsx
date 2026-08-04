"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameProps } from "@/components/GameShell";
import { PuzzleError } from "@/components/NotFound";
import { useApp } from "@/components/AppProvider";
import { hiveConfig } from "@/lib/levels";
import { mulberry32, randomSeed, shuffle } from "@/lib/rng";
import { formatTime } from "@/lib/i18n";
import { play } from "@/lib/sound";
import { useCountdown } from "@/lib/useCountdown";
import {
  generateHive,
  hasCleared,
  submitWord,
  type HivePuzzle,
} from "./engine";

export function Hive({ lang, level, onFinish, setStatus, onGiveUp }: GameProps) {
  const { t } = useApp();
  const cfg = useMemo(() => hiveConfig(level), [level]);
  const puzzle = useMemo<HivePuzzle | null>(
    () => generateHive(lang, cfg, mulberry32(randomSeed())),
    [lang, cfg],
  );

  const [outer, setOuter] = useState<string[]>(() => puzzle?.outer ?? []);
  const [typed, setTyped] = useState("");
  const [found, setFound] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const startedAt = useRef(Date.now());

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

  useEffect(() => {
    if (!puzzle) return;
    const needed = Math.ceil((puzzle.maxScore * cfg.scoreToClear) / 100);
    setStatus(
      <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
        {cfg.seconds > 0 ? (
          <span
            style={{ color: remaining <= 30 ? "var(--present)" : undefined }}
            className="font-display font-bold"
          >
            {formatTime(remaining * 1000)}
          </span>
        ) : null}
        <span>
          {score}/{needed}
        </span>
      </span>,
    );
  }, [puzzle, score, cfg, remaining, setStatus]);

  const flash = useCallback((msg: string) => {
    setMessage(msg);
    setShaking(true);
    play("bad");
    window.setTimeout(() => setShaking(false), 280);
    window.setTimeout(() => setMessage((m) => (m === msg ? null : m)), 1500);
  }, []);

  const submit = useCallback(() => {
    if (!puzzle || typed.length === 0) return;
    const res = submitWord(typed, puzzle, foundSet);
    if (!res.ok) {
      flash(
        res.reason === "tooShort"
          ? t("tooShort", { n: puzzle.minLength })
          : res.reason === "missingCentre"
            ? t("missingCentre")
            : res.reason === "alreadyFound"
              ? t("alreadyFound")
              : t("notAWord"),
      );
      setTyped("");
      return;
    }
    play(res.pangram ? "win" : "good");
    setFound((f) => [res.word, ...f]);
    setScore((s) => s + res.score);
    setMessage(res.pangram ? t("pangram") : `+${res.score}`);
    window.setTimeout(() => setMessage(null), 1200);
    setTyped("");
  }, [puzzle, typed, foundSet, flash, t]);

  // Finishing every word ends the round early.
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
  const progress = Math.min(1, score / Math.max(1, needed));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="pt-1 pb-2">
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
            {t("found")} {found.length}/{puzzle.answers.length}
          </span>
          {cfg.requirePangram ? (
            <span style={{ color: gotPangram ? "var(--correct)" : undefined }}>
              {t("pangram")} {gotPangram ? "✓" : "—"}
            </span>
          ) : null}
        </div>
      </div>

      <div className="no-scrollbar max-h-[76px] overflow-y-auto pb-1">
        <div className="flex flex-wrap gap-1">
          {found.map((w) => (
            <span
              key={w}
              className="rounded-md px-2 py-1 text-[0.7rem]"
              style={{
                background: puzzle.pangrams.includes(w)
                  ? "var(--accent)"
                  : "var(--surface)",
                color: puzzle.pangrams.includes(w) ? "var(--ink)" : "var(--muted)",
              }}
            >
              {w}
            </span>
          ))}
        </div>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-5">
        {message ? (
          <div
            className="fade-enter absolute top-1 z-10 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: "var(--text)", color: "var(--ink)" }}
            role="status"
          >
            {message}
          </div>
        ) : null}

        <div
          className={`font-display flex h-10 items-center text-2xl font-bold tracking-[0.12em] uppercase ${
            shaking ? "shake" : ""
          }`}
        >
          {typed.length === 0 ? (
            <span className="text-base tracking-normal text-[var(--muted)] normal-case">
              {t("tooShort", { n: puzzle.minLength })}
            </span>
          ) : (
            [...typed].map((ch, i) => (
              <span
                key={i}
                style={{
                  color:
                    ch === puzzle.centre
                      ? "var(--accent)"
                      : puzzle.letters.includes(ch)
                        ? "var(--text)"
                        : "var(--muted)",
                }}
              >
                {ch}
              </span>
            ))
          )}
        </div>

        <Honeycomb centre={puzzle.centre} outer={outer} onTap={tap} />

        <div className="flex gap-2">
          <ActionButton label={t("del")} onPress={() => setTyped((s) => s.slice(0, -1))} />
          <ActionButton
            label={t("shuffle")}
            onPress={() => {
              setOuter((o) => shuffle([...o], mulberry32(randomSeed())));
              play("tap");
            }}
          />
          <ActionButton label={t("submit")} onPress={submit} loud />
        </div>
      </div>
    </div>
  );
}

/**
 * Six hexes around one. Positioned by hand rather than by a grid, because a
 * honeycomb is the one shape CSS grid is bad at.
 */
function Honeycomb({
  centre,
  outer,
  onTap,
}: {
  centre: string;
  outer: string[];
  onTap: (letter: string) => void;
}) {
  const R = 46; // hex width
  const ring = 52; // distance from centre
  const positions = [0, 60, 120, 180, 240, 300].map((deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: Math.cos(rad) * ring * 1.02, y: Math.sin(rad) * ring * 0.92 };
  });

  return (
    <div
      className="relative"
      style={{ width: R + ring * 2.1, height: R + ring * 1.9 }}
    >
      <Hex letter={centre} onTap={onTap} centre size={R} x={0} y={0} />
      {outer.map((l, i) => (
        <Hex
          key={l}
          letter={l}
          onTap={onTap}
          size={R}
          x={positions[i]!.x}
          y={positions[i]!.y}
        />
      ))}
    </div>
  );
}

function Hex({
  letter,
  onTap,
  size,
  x,
  y,
  centre = false,
}: {
  letter: string;
  onTap: (l: string) => void;
  size: number;
  x: number;
  y: number;
  centre?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      className="tile absolute font-bold"
      style={{
        left: "50%",
        top: "50%",
        width: size,
        height: size * 1.14,
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${
          pressed ? 0.94 : 1
        })`,
        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
        borderRadius: 0,
        background: centre ? "var(--accent)" : "var(--surface)",
        color: centre ? "var(--ink)" : "var(--text)",
        fontSize: "1.4rem",
        border: "none",
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={() => onTap(letter)}
      aria-label={letter}
    >
      <span className="tile-glyph">{letter}</span>
    </button>
  );
}

function ActionButton({
  label,
  onPress,
  loud = false,
}: {
  label: string;
  onPress: () => void;
  loud?: boolean;
}) {
  return (
    <button
      type="button"
      className="tap rounded-full px-5 py-2.5 text-xs font-semibold"
      style={{
        border: loud ? "none" : "1px solid var(--line)",
        background: loud ? "var(--accent)" : "transparent",
        color: loud ? "var(--ink)" : "var(--text)",
      }}
      onClick={onPress}
    >
      {label}
    </button>
  );
}
