"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard } from "@/components/Keyboard";
import { Loading, PuzzleError } from "@/components/NotFound";
import { Sheet, SheetButton } from "@/components/Sheet";
import type { GameProps } from "@/components/GameShell";
import { useApp } from "@/components/AppProvider";
import { GAMES } from "@/lib/games";
import { isValidWord, randomWord } from "@/lib/dictionary";
import { loadGridSquares } from "@/lib/puzzles";
import { gridConfig } from "@/lib/levels";
import { mulberry32, randomSeed } from "@/lib/rng";
import { useBoardFit } from "@/lib/useBoardFit";
import { play } from "@/lib/sound";
import { logReject } from "@/lib/debug";
import { HowToPlay } from "./HowToPlay";
import {
  GRID_SIZE,
  applyGuess,
  cellsRevealed,
  isSolved,
  newGrid,
  scoreGrid,
  type GridState,
} from "./engine";

const SEEN_KEY = "Ordlek.grid.howto.v1";
/** Reserved beside the grid so the grid itself stays square and centred. */
const HINT_COL = 46;

export function Grid({
  lang,
  level,
  onFinish,
  onGiveUp,
  requestGiveUp,
}: GameProps) {
  const { t } = useApp();
  const router = useRouter();
  const cfg = useMemo(() => gridConfig(level), [level]);

  const [state, setState] = useState<GridState | null>(null);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Cells revealed by the most recent guess, for the staggered flip. */
  const [justPlaced, setJustPlaced] = useState<Set<string>>(new Set());
  const startedAt = useRef(Date.now());

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setHowTo(true);
    } catch {
      // Private mode. Showing the rules again is harmless.
    }
  }, []);

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
    window.setTimeout(() => setMessage((m) => (m === msg ? null : m)), 1400);
  }, []);

  // The grid is square and shares the row with the hint column.
  const [boardRef, cellPx] = useBoardFit(GRID_SIZE, GRID_SIZE, {
    gap: 4,
    max: 60,
    reserveWidth: HINT_COL + 8,
  });

  const onEnter = useCallback(() => {
    if (!state) return;
    if (current.length < GRID_SIZE) {
      flash(t("wrongLength", { n: GRID_SIZE }));
      return;
    }
    if (!isValidWord(current, lang)) {
      logReject({
        word: current,
        length: current.length,
        lang,
        level: String(level),
        reason: "notAWord",
      });
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
    setJustPlaced(new Set(outcome.placed.map(([r, c]) => `${r}-${c}`)));
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
      }, 600);
    }
  }, [state, current, lang, level, cfg.guesses, flash, t, onFinish]);

  const dismissHowTo = useCallback(() => {
    setHowTo(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  if (failed) return <PuzzleError onRetry={() => window.location.reload()} />;

  const gridSide = cellPx * GRID_SIZE + (GRID_SIZE - 1) * 4;
  const guessesLeft = state ? cfg.guesses - state.guesses.length : cfg.guesses;

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
      <header className="flex shrink-0 items-center gap-1 pb-2">
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
            {t(GAMES.grid.nameKey)}
          </h1>
          <p className="truncate text-xs text-[var(--muted)]">
            {t("levelN", { n: level })} · {t("guessesLeft", { n: guessesLeft })}
          </p>
        </div>

        <button
          type="button"
          className="tap grid shrink-0 place-items-center rounded-full text-[var(--muted)]"
          onClick={() => setHowTo(true)}
          aria-label={t("howToPlay")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M9.6 9.4a2.4 2.4 0 1 1 3.2 2.3c-.5.2-.8.7-.8 1.2v.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="12" cy="16.6" r="1" fill="currentColor" />
          </svg>
        </button>

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

      {/* Board and hint column ------------------------------------------- */}
      <div ref={boardRef} className="grid min-h-0 flex-1 place-items-center">
        {state === null ? (
          <Loading />
        ) : (
          <div className={`flex items-center gap-2 ${shaking ? "shake" : ""}`}>
            <div
              className="grid"
              style={{
                width: gridSide,
                height: gridSide,
                gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                gap: 4,
              }}
            >
              {state.solution.flatMap((row, r) =>
                [...row].map((ch, c) => {
                  const shown = state.revealed[r]![c]!;
                  const fresh = justPlaced.has(`${r}-${c}`);
                  return (
                    <div
                      key={`${r}-${c}`}
                      className="grid aspect-square place-items-center rounded-[4px]"
                      style={{
                        background: shown ? "var(--correct)" : "var(--absent)",
                        color: shown ? "var(--on-state)" : "transparent",
                        fontWeight: 700,
                        fontSize: Math.round(cellPx * 0.46),
                        lineHeight: 1,
                        textTransform: "uppercase",
                        // Newly revealed cells flip in left to right.
                        animation: fresh
                          ? `tile-flip 320ms ${c * 60}ms var(--ease-soft)`
                          : undefined,
                      }}
                    >
                      {shown ? ch : ""}
                    </div>
                  );
                }),
              )}
            </div>

            <div
              className="flex flex-col justify-between"
              style={{ width: HINT_COL, height: gridSide }}
            >
              {state.rowHints.map((hints, r) => (
                <div
                  key={r}
                  className="flex items-center text-[0.6rem] leading-tight font-semibold tracking-wide uppercase"
                  style={{
                    height: cellPx,
                    color: "var(--present)",
                    wordBreak: "break-all",
                  }}
                  aria-label={t("gridRowHints")}
                >
                  {[...hints].join(" ")}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* The rule, always on screen -------------------------------------- */}
      <p className="shrink-0 py-1.5 text-center text-[0.7rem] leading-snug text-[var(--muted)]">
        {message ?? t("gridInstruction")}
      </p>

      {/* What I am typing ------------------------------------------------ */}
      <div className="flex shrink-0 justify-center gap-1.5 pb-1.5">
        {Array.from({ length: GRID_SIZE }, (_, i) => {
          const ch = current[i];
          const active = i === current.length;
          return (
            <div
              key={i}
              className="grid place-items-center rounded-[4px] text-base font-bold uppercase"
              style={{
                width: 34,
                height: 40,
                background: "var(--surface)",
                border: `1.5px solid ${active ? "var(--accent)" : "var(--line)"}`,
                color: "var(--text)",
              }}
            >
              {ch ?? (active ? <span className="caret">|</span> : "")}
            </div>
          );
        })}
      </div>

      {/* Guesses already tried ------------------------------------------- */}
      <div className="no-scrollbar h-[24px] shrink-0 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full items-center justify-center gap-2 whitespace-nowrap">
          {state && state.guesses.length > 0 ? (
            state.guesses.map((g) => (
              <span
                key={g}
                className="shrink-0 text-[0.7rem] tracking-wide text-[var(--muted)] uppercase"
              >
                {g}
              </span>
            ))
          ) : (
            <span className="text-[0.7rem] text-[var(--line)]">
              {t("previousGuesses")}
            </span>
          )}
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

      <HowToPlay open={howTo} onClose={dismissHowTo} t={t} />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t("more")}>
        <div className="flex flex-col gap-2 pt-1 pb-2">
          <SheetButton
            variant="danger"
            onClick={() => {
              setMenuOpen(false);
              requestGiveUp();
            }}
          >
            {t("giveUp")}
          </SheetButton>
          <SheetButton onClick={() => setMenuOpen(false)}>{t("cancel")}</SheetButton>
        </div>
      </Sheet>
    </div>
  );
}
