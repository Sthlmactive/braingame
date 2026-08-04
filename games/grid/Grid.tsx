"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tile, type TileState } from "@/components/Tile";
import { Keyboard } from "@/components/Keyboard";
import { Loading, PuzzleError } from "@/components/NotFound";
import type { GameProps } from "@/components/GameShell";
import { useApp } from "@/components/AppProvider";
import { isValidWord, randomWord } from "@/lib/dictionary";
import { loadGridSquares } from "@/lib/puzzles";
import { gridConfig } from "@/lib/levels";
import { mulberry32, randomSeed } from "@/lib/rng";
import { play } from "@/lib/sound";
import {
  GRID_SIZE,
  applyGuess,
  cellsRevealed,
  isSolved,
  newGrid,
  scoreGrid,
  type GridState,
} from "./engine";

export function Grid({ lang, level, onFinish, setStatus, onGiveUp }: GameProps) {
  const { t } = useApp();
  const cfg = useMemo(() => gridConfig(level), [level]);

  const [state, setState] = useState<GridState | null>(null);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [flipTick, setFlipTick] = useState(0);
  const startedAt = useRef(Date.now());

  // Levels 9 and 10 need columns to be words too, which is far too slow to
  // search for on a phone, so those come from the prebuilt squares.
  useEffect(() => {
    let cancelled = false;
    const rng = mulberry32(randomSeed());

    const build = async () => {
      if (cfg.columnsToo) {
        const squares = await loadGridSquares(lang);
        if (cancelled) return;
        if (squares.length === 0) {
          setFailed(true);
          return;
        }
        setState(newGrid(squares[Math.floor(rng() * squares.length)]!));
        return;
      }
      const rows: string[] = [];
      const used = new Set<string>();
      for (let i = 0; i < GRID_SIZE * 12 && rows.length < GRID_SIZE; i++) {
        const w = randomWord(lang, GRID_SIZE, cfg.band, rng);
        if (!w || used.has(w)) continue;
        used.add(w);
        rows.push(w);
      }
      if (cancelled) return;
      if (rows.length < GRID_SIZE) setFailed(true);
      else setState(newGrid(rows));
    };

    void build().catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [lang, cfg]);

  useEffect(() => {
    if (!state) return;
    setStatus(
      <span className="text-xs text-[var(--muted)]">
        {cfg.guesses - state.guesses.length} {t("guesses").toLowerCase()}
      </span>,
    );
  }, [state, cfg.guesses, setStatus, t]);

  useEffect(() => {
    if (!state) return;
    onGiveUp(() => ({
      cleared: false,
      score: scoreGrid({
        solved: false,
        guessesUsed: state.guesses.length,
        guessesAllowed: cfg.guesses,
        timeMs: Date.now() - startedAt.current,
        cells: cellsRevealed(state),
      }),
      timeMs: Date.now() - startedAt.current,
      reason: "gaveUp",
      note: state.solution.join(" ").toUpperCase(),
    }));
  }, [state, cfg.guesses, onGiveUp]);

  const flash = useCallback((msg: string) => {
    setMessage(msg);
    setShaking(true);
    play("bad");
    window.setTimeout(() => setShaking(false), 280);
    window.setTimeout(() => setMessage((m) => (m === msg ? null : m)), 1500);
  }, []);

  const onEnter = useCallback(() => {
    if (!state) return;
    if (current.length < GRID_SIZE) {
      flash(t("wrongLength", { n: GRID_SIZE }));
      return;
    }
    if (!isValidWord(current, lang)) {
      flash(t("notAWord"));
      return;
    }
    if (state.guesses.includes(current)) {
      flash(t("alreadyFound"));
      return;
    }

    const outcome = applyGuess(state, current);
    setState(outcome.state);
    setCurrent("");
    setFlipTick((n) => n + 1);
    play(outcome.placed.length > 0 ? "good" : "place");

    const solved = isSolved(outcome.state);
    const outOfGuesses = outcome.state.guesses.length >= cfg.guesses;
    if (solved || outOfGuesses) {
      const timeMs = Date.now() - startedAt.current;
      window.setTimeout(() => {
        onFinish({
          cleared: solved,
          score: scoreGrid({
            solved,
            guessesUsed: outcome.state.guesses.length,
            guessesAllowed: cfg.guesses,
            timeMs,
            cells: cellsRevealed(outcome.state),
          }),
          timeMs,
          reason: solved ? "solved" : "outOfGuesses",
          note: solved ? undefined : outcome.state.solution.join(" ").toUpperCase(),
        });
      }, 520);
    }
  }, [state, current, lang, cfg.guesses, flash, t, onFinish]);

  if (failed) return <PuzzleError onRetry={() => window.location.reload()} />;
  if (!state) return <Loading />;

  const tilePx = Math.min(56, Math.floor((330 - 4 * 6) / GRID_SIZE));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex flex-1 flex-col items-center justify-center gap-2">
        {message ? (
          <div
            className="fade-enter absolute top-0 z-10 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: "var(--text)", color: "var(--ink)" }}
            role="status"
          >
            {message}
          </div>
        ) : null}

        <div className={`flex flex-col gap-[6px] ${shaking ? "shake" : ""}`}>
          {state.solution.map((row, r) => (
            <div key={r} className="flex items-center gap-[6px]">
              {[...row].map((ch, c) => {
                const shown = state.revealed[r]![c]!;
                const state_: TileState = shown ? "correct" : "empty";
                return (
                  <Tile
                    key={c}
                    px={tilePx}
                    letter={shown ? ch : undefined}
                    state={state_}
                    flip
                    flipDelay={c * 55}
                  />
                );
              })}
              <span
                className="ml-1 w-[54px] text-[0.62rem] leading-tight tracking-wide uppercase"
                style={{ color: "var(--present)" }}
                aria-label={t("useTheClues")}
              >
                {[...state.rowHints[r]!].join(" ")}
              </span>
            </div>
          ))}
        </div>

        <div key={flipTick} className="flex h-8 items-center gap-[6px]">
          {Array.from({ length: GRID_SIZE }, (_, i) => (
            <Tile
              key={i}
              px={26}
              letter={current[i] ?? undefined}
              state={current[i] ? "filled" : "empty"}
              settleKey={current[i] ? `${i}-${current[i]}` : undefined}
            />
          ))}
        </div>
      </div>

      <Keyboard
        lang={lang}
        t={t}
        onLetter={(l) => {
          setCurrent((c) => (c.length >= GRID_SIZE ? c : c + l));
          play("tap");
        }}
        onDelete={() => {
          setCurrent((c) => c.slice(0, -1));
          play("tap");
        }}
        onEnter={onEnter}
        showStates={false}
      />
    </div>
  );
}
