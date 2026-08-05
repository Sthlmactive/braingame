"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loading, PuzzleError } from "@/components/NotFound";
import type { GameProps } from "@/components/GameShell";
import { useApp } from "@/components/AppProvider";
import { isValidWord } from "@/lib/dictionary";
import { loadLoopBoards } from "@/lib/puzzles";
import { loopConfig } from "@/lib/levels";
import { mulberry32, randomSeed, shuffle } from "@/lib/rng";
import { useBoardFit } from "@/lib/useBoardFit";
import { play } from "@/lib/sound";
import { key, layout, type LoopBoard } from "./board";

export function Loop({ lang, level, onFinish, setStatus, onGiveUp }: GameProps) {
  const { t } = useApp();
  const cfg = useMemo(() => loopConfig(level), [level]);

  const [board, setBoard] = useState<LoopBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [solved, setSolved] = useState<string[]>([]);
  const [bonus, setBonus] = useState<string[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const wheelRef = useRef<HTMLDivElement>(null);
  const [wheel, setWheel] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadLoopBoards(lang).then(
      (all) => {
        if (cancelled) return;
        const list = all[level] ?? [];
        if (list.length === 0) {
          setFailed(true);
          return;
        }
        const rng = mulberry32(randomSeed());
        const chosen = list[Math.floor(rng() * list.length)]!;
        setBoard(chosen);
        setWheel(shuffle([...chosen.wheel], rng));
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [lang, level]);

  const target = useMemo(
    () => (board ? board.words.map((w) => w.word) : []),
    [board],
  );
  const hintsLeft = cfg.hints - hintsUsed;

  // The crossword shares the screen with the wheel, so it is sized from the
  // area actually left over rather than from the viewport width.
  const [boardRef, cellPx] = useBoardFit(board?.width ?? 1, board?.height ?? 1, {
    gap: 2,
    max: 30,
    min: 14,
  });

  useEffect(() => {
    if (!board) return;
    setStatus(
      <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <span>
          {solved.length}/{target.length}
        </span>
        {bonus.length > 0 ? (
          <span style={{ color: "var(--accent)" }}>+{bonus.length}</span>
        ) : null}
      </span>,
    );
  }, [board, solved.length, target.length, bonus.length, setStatus]);

  useEffect(() => {
    onGiveUp(() => ({
      cleared: false,
      score: solved.length * 30 + bonus.length * 8,
      timeMs: Date.now() - startedAt.current,
      reason: "gaveUp",
    }));
  }, [onGiveUp, solved.length, bonus.length]);

  const flash = useCallback((msg: string) => {
    setMessage(msg);
    window.setTimeout(() => setMessage((m) => (m === msg ? null : m)), 1200);
  }, []);

  const currentWord = picked.map((i) => wheel[i]!).join("");

  const submit = useCallback(() => {
    const word = currentWord;
    setPicked([]);
    if (word.length < 3) return;

    if (target.includes(word)) {
      if (solved.includes(word)) {
        flash(t("alreadyFound"));
        return;
      }
      const next = [...solved, word];
      setSolved(next);
      play("good");
      if (next.length === target.length) {
        const timeMs = Date.now() - startedAt.current;
        window.setTimeout(
          () =>
            onFinish({
              cleared: true,
              score:
                target.length * 50 +
                bonus.length * 10 +
                Math.max(0, 300 - Math.floor(timeMs / 1000)) * 2 -
                hintsUsed * 40,
              timeMs,
              reason: "solved",
              note: bonus.length > 0 ? t("bonusFound", { n: bonus.length }) : undefined,
            }),
          420,
        );
      }
      return;
    }

    if (isValidWord(word, lang)) {
      if (bonus.includes(word)) {
        flash(t("alreadyFound"));
        return;
      }
      setBonus((b) => [...b, word]);
      play("place");
      flash(t("bonusWords"));
      return;
    }

    play("bad");
    flash(t("notAWord"));
  }, [
    currentWord,
    target,
    solved,
    bonus,
    lang,
    flash,
    t,
    onFinish,
    hintsUsed,
  ]);

  const useHint = useCallback(() => {
    if (!board || hintsLeft <= 0) return;
    const missing = target.filter((w) => !solved.includes(w));
    if (missing.length === 0) return;
    // Reveal the shortest word still outstanding: the cheapest useful nudge.
    const word = [...missing].sort((a, b) => a.length - b.length)[0]!;
    setSolved((s) => [...s, word]);
    setHintsUsed((n) => n + 1);
    play("good");
    if (solved.length + 1 === target.length) {
      const timeMs = Date.now() - startedAt.current;
      window.setTimeout(
        () =>
          onFinish({
            cleared: true,
            score: Math.max(0, target.length * 50 - (hintsUsed + 1) * 40),
            timeMs,
            reason: "solved",
          }),
        420,
      );
    }
  }, [board, hintsLeft, target, solved, hintsUsed, onFinish]);

  // Swipe across the wheel: whichever letter the finger is over gets added.
  const dragging = useRef(false);
  const letterAt = useCallback((clientX: number, clientY: number): number | null => {
    const el = document
      .elementFromPoint(clientX, clientY)
      ?.closest("[data-wheel-index]");
    const idx = el?.getAttribute("data-wheel-index");
    return idx === null || idx === undefined ? null : Number(idx);
  }, []);

  const extend = useCallback(
    (index: number | null) => {
      if (index === null) return;
      setPicked((p) => {
        if (p.includes(index)) {
          // Backtracking one step is how you undo a mis-swipe.
          if (p.length >= 2 && p[p.length - 2] === index) return p.slice(0, -1);
          return p;
        }
        play("tap");
        return [...p, index];
      });
    },
    [],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      extend(letterAt(e.clientX, e.clientY));
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      submit();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [extend, letterAt, submit]);

  if (failed) return <PuzzleError onRetry={() => window.location.reload()} />;
  if (!board) return <Loading />;

  const cells = layout(board.words);
  const solvedCells = layout(board.words.filter((w) => solved.includes(w.word)));

  return (
    <div className="game-surface flex min-h-0 flex-1 flex-col">
      <div
        ref={boardRef}
        className="relative flex min-h-0 flex-1 items-center justify-center"
      >
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
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${board.width}, ${cellPx}px)`,
            gap: 2,
          }}
        >
          {Array.from({ length: board.width * board.height }, (_, i) => {
            const x = i % board.width;
            const y = Math.floor(i / board.width);
            const k = key(x, y);
            const letter = cells.get(k);
            if (letter === undefined) return <span key={i} />;
            const shown = solvedCells.get(k);
            return (
              <div
                key={i}
                className="tile"
                style={{
                  width: cellPx,
                  height: cellPx,
                  fontSize: Math.round(cellPx * 0.52),
                  borderRadius: 4,
                  background: shown ? "var(--accent)" : "var(--surface)",
                  color: shown ? "var(--ink)" : "transparent",
                  border: "none",
                }}
              >
                <span className="tile-glyph">{shown ?? letter}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex h-9 items-center justify-center">
        <span className="font-display text-xl font-bold tracking-[0.14em] uppercase">
          {currentWord}
        </span>
      </div>

      <div className="flex items-center justify-center gap-4 pb-3">
        {cfg.hints > 0 ? (
          <button
            type="button"
            className="tap rounded-full px-3 py-2 text-xs font-semibold"
            style={{
              border: "1px solid var(--line)",
              color: hintsLeft > 0 ? "var(--accent)" : "var(--muted)",
            }}
            onClick={useHint}
            disabled={hintsLeft <= 0}
          >
            {hintsLeft > 0 ? `${t("hint")} · ${hintsLeft}` : t("noHintsLeft")}
          </button>
        ) : null}

        <Wheel
          ref={wheelRef}
          letters={wheel}
          picked={picked}
          onStart={(i) => {
            dragging.current = true;
            setPicked([i]);
            play("tap");
          }}
          onTap={(i) => extend(i)}
        />

        <button
          type="button"
          className="tap rounded-full px-3 py-2 text-xs font-semibold"
          style={{ border: "1px solid var(--line)" }}
          onClick={() => {
            setWheel((w) => shuffle([...w], mulberry32(randomSeed())));
            setPicked([]);
            play("tap");
          }}
        >
          {t("shuffle")}
        </button>
      </div>

      <div className="flex justify-center pb-2">
        <button
          type="button"
          className="tap rounded-xl px-6 py-2.5 text-sm font-semibold disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--ink)" }}
          onClick={submit}
          disabled={picked.length < 3}
        >
          {t("submit")}
        </button>
      </div>
    </div>
  );
}

function Wheel({
  ref,
  letters,
  picked,
  onStart,
  onTap,
}: {
  ref: React.Ref<HTMLDivElement>;
  letters: string[];
  picked: number[];
  onStart: (index: number) => void;
  onTap: (index: number) => void;
}) {
  const size = 168;
  const radius = size / 2 - 24;
  return (
    <div
      ref={ref}
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size, background: "var(--surface)" }}
    >
      {letters.map((letter, i) => {
        const angle = (i / letters.length) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const on = picked.includes(i);
        return (
          <button
            key={i}
            type="button"
            data-wheel-index={i}
            className="tile absolute"
            style={{
              left: "50%",
              top: "50%",
              width: 42,
              height: 42,
              marginLeft: -21,
              marginTop: -21,
              transform: `translate(${x}px, ${y}px)`,
              borderRadius: "50%",
              border: "none",
              background: on ? "var(--accent)" : "var(--ink)",
              color: on ? "var(--ink)" : "var(--text)",
              fontSize: "1.15rem",
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              onStart(i);
            }}
            onPointerEnter={() => onTap(i)}
            aria-label={letter}
          >
            <span className="tile-glyph">{letter}</span>
          </button>
        );
      })}
    </div>
  );
}
