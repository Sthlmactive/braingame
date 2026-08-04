"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tile } from "@/components/Tile";
import { PuzzleError } from "@/components/NotFound";
import type { GameProps } from "@/components/GameShell";
import { useApp } from "@/components/AppProvider";
import { answerPool } from "@/lib/dictionary";
import { ordokuConfig } from "@/lib/levels";
import { mulberry32, randomSeed, shuffle } from "@/lib/rng";
import { play } from "@/lib/sound";
import {
  BOX,
  conflicts,
  generateOrdoku,
  isComplete,
  scoreOrdoku,
  type OrdokuPuzzle,
  type Size,
} from "./engine";

export function Ordoku({ lang, level, onFinish, setStatus, onGiveUp }: GameProps) {
  const { t } = useApp();
  const cfg = useMemo(() => ordokuConfig(level), [level]);

  const puzzle = useMemo<OrdokuPuzzle | null>(() => {
    const rng = mulberry32(randomSeed());
    // The diagonal word needs exactly `size` distinct letters.
    const candidates = shuffle(
      answerPool(lang, cfg.size, "top20k").filter(
        (w) => new Set(w).size === cfg.size,
      ),
      rng,
    );
    for (const word of candidates.slice(0, 20)) {
      const p = generateOrdoku(word, cfg.size, cfg.givens, rng);
      if (p) return p;
    }
    return null;
  }, [lang, cfg]);

  const [cells, setCells] = useState<Int8Array>(
    () => (puzzle ? Int8Array.from(puzzle.puzzle) : new Int8Array(0)),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [wordShown, setWordShown] = useState(false);
  const startedAt = useRef(Date.now());
  const lastProgress = useRef(Date.now());

  const given = useMemo(
    () => (puzzle ? Array.from(puzzle.puzzle, (v) => v >= 0) : []),
    [puzzle],
  );

  const bad = useMemo(
    () => (cfg.liveConflicts && puzzle ? conflicts(cells, puzzle.size) : new Set<number>()),
    [cells, cfg.liveConflicts, puzzle],
  );

  const filled = useMemo(
    () => Array.from(cells).filter((v) => v >= 0).length,
    [cells],
  );

  useEffect(() => {
    if (!puzzle) return;
    setStatus(
      <span className="text-xs text-[var(--muted)]">
        {filled}/{puzzle.size * puzzle.size}
      </span>,
    );
  }, [filled, puzzle, setStatus]);

  useEffect(() => {
    if (!puzzle) return;
    onGiveUp(() => ({
      cleared: false,
      score: 0,
      timeMs: Date.now() - startedAt.current,
      reason: "gaveUp",
      revealWord: puzzle.word,
    }));
  }, [puzzle, onGiveUp]);

  // Levels 1 to 8 offer the hidden word after a minute of no progress.
  useEffect(() => {
    if (!puzzle || cfg.hideWordUntilSolved || wordShown) return;
    const id = window.setInterval(() => {
      if (Date.now() - lastProgress.current >= cfg.wordHintAfterMs) {
        setWordShown(true);
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [puzzle, cfg.hideWordUntilSolved, cfg.wordHintAfterMs, wordShown]);

  const place = useCallback(
    (symbol: number) => {
      if (!puzzle || selected === null || given[selected]) return;
      lastProgress.current = Date.now();
      setCells((prev) => {
        const next = Int8Array.from(prev);
        next[selected] = next[selected] === symbol ? -1 : symbol;
        const wrong =
          next[selected]! >= 0 && next[selected] !== puzzle.solution[selected];
        if (wrong) setMistakes((m) => m + 1);
        play(wrong ? "bad" : "place");

        if (isComplete(next, puzzle.size)) {
          const timeMs = Date.now() - startedAt.current;
          window.setTimeout(
            () =>
              onFinish({
                cleared: true,
                score: scoreOrdoku({
                  solved: true,
                  size: puzzle.size,
                  timeMs,
                  mistakes,
                  hintsUsed: wordShown && !cfg.hideWordUntilSolved ? 1 : 0,
                }),
                timeMs,
                reason: "solved",
                revealWord: puzzle.word,
              }),
            340,
          );
        }
        return next;
      });
    },
    [puzzle, selected, given, mistakes, wordShown, cfg.hideWordUntilSolved, onFinish],
  );

  if (!puzzle) return <PuzzleError onRetry={() => window.location.reload()} />;

  const size = puzzle.size as Size;
  const box = BOX[size];
  // Fit the board to an iPhone SE width without pinch zoom.
  const cell = Math.floor(Math.min(52, (340 - (size + 1) * 2) / size));
  const solved = isComplete(cells, size);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
      <div className="text-center">
        <div className="text-[0.65rem] tracking-widest text-[var(--muted)] uppercase">
          {t("hiddenWord")}
        </div>
        <div className="font-display text-lg font-bold tracking-[0.18em] uppercase">
          {solved || (wordShown && !cfg.hideWordUntilSolved) ? (
            puzzle.word
          ) : (
            <span className="text-sm font-normal tracking-normal text-[var(--muted)] normal-case">
              {t("hiddenWordLocked")}
            </span>
          )}
        </div>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${size}, ${cell}px)`,
          gap: 2,
          padding: 3,
          background: "var(--line)",
          borderRadius: 8,
        }}
      >
        {Array.from({ length: size * size }, (_, i) => {
          const r = Math.floor(i / size);
          const c = i % size;
          const v = cells[i]!;
          const isGiven = given[i];
          const isBad = bad.has(i);
          const onDiagonal = r === c;
          return (
            <button
              key={i}
              type="button"
              className="tile"
              style={{
                width: cell,
                height: cell,
                fontSize: Math.round(cell * 0.46),
                borderRadius: 4,
                border: "none",
                // Box edges get a heavier gutter so the regions read at a glance.
                marginRight: c % box.cols === box.cols - 1 && c < size - 1 ? 3 : 0,
                marginBottom: r % box.rows === box.rows - 1 && r < size - 1 ? 3 : 0,
                background: isBad
                  ? "rgba(242, 102, 75, 0.28)"
                  : selected === i
                    ? "var(--accent)"
                    : isGiven
                      ? "var(--surface)"
                      : "var(--ink)",
                color:
                  selected === i
                    ? "var(--ink)"
                    : isGiven
                      ? "var(--muted)"
                      : onDiagonal && !solved
                        ? "var(--accent)"
                        : "var(--text)",
                outline: onDiagonal ? "1px solid var(--accent)" : undefined,
                outlineOffset: -1,
              }}
              onClick={() => {
                if (isGiven) return;
                play("tap");
                setSelected((s) => (s === i ? null : i));
              }}
              aria-label={`${r + 1},${c + 1}`}
            >
              <span className="tile-glyph">
                {v >= 0 ? puzzle.letters[v] : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-1.5 px-2">
        {puzzle.letters.map((letter, symbol) => {
          const remaining =
            size - Array.from(cells).filter((v) => v === symbol).length;
          return (
            <Tile
              key={letter}
              letter={letter}
              size={size === 9 ? "sm" : "md"}
              state={remaining <= 0 ? "absent" : "filled"}
              onPress={() => place(symbol)}
              disabled={selected === null}
              label={letter}
            />
          );
        })}
      </div>
    </div>
  );
}
