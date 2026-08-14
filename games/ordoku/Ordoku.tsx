"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PuzzleError } from "@/components/NotFound";
import { Sheet, SheetButton } from "@/components/Sheet";
import type { GameProps } from "@/components/GameShell";
import { useApp } from "@/components/AppProvider";
import { GAMES } from "@/lib/games";
import { answerPool } from "@/lib/dictionary";
import { ordokuConfig } from "@/lib/levels";
import { formatTime } from "@/lib/i18n";
import { mulberry32, randomSeed, shuffle } from "@/lib/rng";
import { useBoardFit } from "@/lib/useBoardFit";
import { play } from "@/lib/sound";
import {
  boxIndex,
  conflicts,
  generateOrdoku,
  isComplete,
  scoreOrdoku,
  type OrdokuPuzzle,
} from "./engine";

const SIZE = 9;
const CELLS = SIZE * SIZE;

/** One undo step: what the cell held before the move. */
interface Step {
  index: number;
  value: number;
  notes: number;
}

export function Ordoku({
  lang,
  level,
  onFinish,
  onGiveUp,
  requestGiveUp,
}: GameProps) {
  const { t, settings, setOrdokuGlyphs } = useApp();
  const router = useRouter();
  const cfg = useMemo(() => ordokuConfig(level), [level]);
  const glyphs = settings.ordokuGlyphs;

  const puzzle = useMemo<OrdokuPuzzle | null>(() => {
    const rng = mulberry32(randomSeed());
    const candidates = shuffle(
      answerPool(lang, SIZE, "top20k").filter((w) => new Set(w).size === SIZE),
      rng,
    );
    for (const word of candidates.slice(0, 20)) {
      const p = generateOrdoku(word, SIZE, cfg.givens, rng);
      if (p) return p;
    }
    return null;
  }, [lang, cfg.givens]);

  const [cells, setCells] = useState<Int8Array>(() =>
    puzzle ? Int8Array.from(puzzle.puzzle) : new Int8Array(CELLS).fill(-1),
  );
  /** Bit i set means "symbol i is pencilled in here". */
  const [notes, setNotes] = useState<Int16Array>(() => new Int16Array(CELLS));
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const history = useRef<Step[]>([]);
  const startedAt = useRef(Date.now());

  const hintsLeft = cfg.hints - hintsUsed;

  useEffect(() => {
    const id = window.setInterval(
      () => setElapsed(Date.now() - startedAt.current),
      1000,
    );
    return () => window.clearInterval(id);
  }, []);

  const given = useMemo(
    () => (puzzle ? Array.from(puzzle.puzzle, (v) => v >= 0) : []),
    [puzzle],
  );

  const bad = useMemo(
    () => (cfg.liveConflicts ? conflicts(cells, SIZE) : new Set<number>()),
    [cells, cfg.liveConflicts],
  );

  const filled = useMemo(
    () => Array.from(cells).filter((v) => v >= 0).length,
    [cells],
  );

  const solved = useMemo(() => isComplete(cells, SIZE), [cells]);

  useEffect(() => {
    if (!puzzle) return;
    onGiveUp(() => ({
      cleared: false,
      score: 0,
      timeMs: Date.now() - startedAt.current,
      reason: "gaveUp",
      revealWord: glyphs === "letters" ? puzzle.word : undefined,
    }));
  }, [puzzle, onGiveUp, glyphs]);

  /** Display glyph for a symbol index, in whichever mode is active. */
  const glyphFor = useCallback(
    (symbol: number): string =>
      glyphs === "numbers"
        ? String(symbol + 1)
        : (puzzle?.letters[symbol] ?? "").toUpperCase(),
    [glyphs, puzzle],
  );

  const finishSolved = useCallback(() => {
    if (!puzzle) return;
    const timeMs = Date.now() - startedAt.current;
    window.setTimeout(
      () =>
        onFinish({
          cleared: true,
          score: scoreOrdoku({
            solved: true,
            size: SIZE,
            timeMs,
            mistakes,
            hintsUsed,
          }),
          timeMs,
          reason: "solved",
          revealWord: glyphs === "letters" ? puzzle.word : undefined,
        }),
      360,
    );
  }, [puzzle, mistakes, hintsUsed, onFinish, glyphs]);

  const place = useCallback(
    (symbol: number) => {
      if (!puzzle || selected === null || given[selected]) return;

      const step: Step = {
        index: selected,
        value: cells[selected]!,
        notes: notes[selected]!,
      };

      if (notesMode) {
        const nextNotes = Int16Array.from(notes);
        nextNotes[selected] = nextNotes[selected]! ^ (1 << symbol);
        history.current.push(step);
        setNotes(nextNotes);
        play("tap");
        return;
      }

      const next = Int8Array.from(cells);
      next[selected] = next[selected] === symbol ? -1 : symbol;
      const wrong =
        next[selected]! >= 0 && next[selected] !== puzzle.solution[selected];

      // Placing a value retires that pencil mark everywhere it can no longer
      // be true: the same row, column and box.
      const nextNotes = Int16Array.from(notes);
      nextNotes[selected] = 0;
      if (next[selected]! >= 0) {
        const r = Math.floor(selected / SIZE);
        const c = selected % SIZE;
        const b = boxIndex(SIZE, r, c);
        for (let i = 0; i < CELLS; i++) {
          const ri = Math.floor(i / SIZE);
          const ci = i % SIZE;
          if (ri === r || ci === c || boxIndex(SIZE, ri, ci) === b) {
            nextNotes[i] = nextNotes[i]! & ~(1 << symbol);
          }
        }
      }

      history.current.push(step);
      setCells(next);
      setNotes(nextNotes);
      if (wrong) setMistakes((m) => m + 1);
      play(wrong ? "bad" : "place");

      if (isComplete(next, SIZE)) finishSolved();
    },
    [puzzle, selected, given, cells, notes, notesMode, finishSolved],
  );

  const undo = useCallback(() => {
    const step = history.current.pop();
    if (!step) return;
    setCells((prev) => {
      const next = Int8Array.from(prev);
      next[step.index] = step.value;
      return next;
    });
    setNotes((prev) => {
      const next = Int16Array.from(prev);
      next[step.index] = step.notes;
      return next;
    });
    setSelected(step.index);
    play("tap");
  }, []);

  const erase = useCallback(() => {
    if (selected === null || given[selected]) return;
    history.current.push({
      index: selected,
      value: cells[selected]!,
      notes: notes[selected]!,
    });
    setCells((prev) => {
      const next = Int8Array.from(prev);
      next[selected] = -1;
      return next;
    });
    setNotes((prev) => {
      const next = Int16Array.from(prev);
      next[selected] = 0;
      return next;
    });
    play("tap");
  }, [selected, given, cells, notes]);

  const useHint = useCallback(() => {
    if (!puzzle || hintsLeft <= 0) return;
    // Fill the selected cell if it is empty, otherwise the first empty one.
    let target = selected !== null && cells[selected]! < 0 ? selected : -1;
    if (target < 0) target = Array.from(cells).findIndex((v) => v < 0);
    if (target < 0) return;

    history.current.push({
      index: target,
      value: cells[target]!,
      notes: notes[target]!,
    });
    const next = Int8Array.from(cells);
    next[target] = puzzle.solution[target]!;
    setCells(next);
    setHintsUsed((n) => n + 1);
    setSelected(target);
    play("good");
    if (isComplete(next, SIZE)) finishSolved();
  }, [puzzle, hintsLeft, selected, cells, notes, finishSolved]);

  // The board is a square that fills whatever space is left over.
  const [boardRef, cellPx] = useBoardFit(SIZE, SIZE, {
    gap: 0,
    max: 44,
    min: 24,
  });

  const remainingOf = useCallback(
    (symbol: number) => SIZE - Array.from(cells).filter((v) => v === symbol).length,
    [cells],
  );

  if (!puzzle) return <PuzzleError onRetry={() => window.location.reload()} />;

  const selRow = selected === null ? -1 : Math.floor(selected / SIZE);
  const selCol = selected === null ? -1 : selected % SIZE;
  const selBox = selected === null ? -1 : boxIndex(SIZE, selRow, selCol);
  const selValue = selected === null ? -1 : cells[selected]!;

  const boardSide = cellPx * SIZE;
  const frame = "rgba(244, 246, 249, 0.4)";

  // The diagonal, as it stands, for the hidden word strip.
  const diagonal = Array.from({ length: SIZE }, (_, i) => cells[i * SIZE + i]!);

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
            {t(GAMES.ordoku.nameKey)}
          </h1>
          <p className="truncate text-xs text-[var(--muted)]">
            {t("levelN", { n: level })} · {t("cellsFilled", { n: filled, m: CELLS })}
          </p>
        </div>

        <span className="font-display shrink-0 text-sm font-bold text-[var(--muted)]">
          {formatTime(elapsed)}
        </span>

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

      {/* Status row: mode toggle, and the hidden word in letters mode ----- */}
      <div className="flex shrink-0 items-center justify-between gap-3 pb-2">
        <div
          className="flex rounded-lg p-0.5"
          style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
          role="group"
        >
          {(["numbers", "letters"] as const).map((mode) => {
            const on = glyphs === mode;
            return (
              <button
                key={mode}
                type="button"
                className="rounded-md px-3 py-1.5 text-xs font-semibold"
                style={{
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "var(--on-state)" : "var(--muted)",
                }}
                aria-pressed={on}
                onClick={() => {
                  // Display only. The board holds symbols either way.
                  setOrdokuGlyphs(mode);
                  play("tap");
                }}
              >
                {t(mode === "numbers" ? "glyphNumbers" : "glyphLetters")}
              </button>
            );
          })}
        </div>

        {glyphs === "letters" ? (
          <div className="flex items-center gap-[3px]" aria-label={t("hiddenWord")}>
            {diagonal.map((v, i) => {
              const reveal =
                v >= 0 && (!cfg.hideWordUntilSolved || solved) && v === puzzle.solution[i * SIZE + i];
              return (
                <span
                  key={i}
                  className="font-display text-sm font-bold uppercase"
                  style={{
                    width: 13,
                    textAlign: "center",
                    color: reveal ? "var(--accent)" : "var(--muted)",
                    borderBottom: reveal ? "none" : "1.5px solid var(--line)",
                    lineHeight: 1.2,
                  }}
                >
                  {reveal ? puzzle.letters[v] : " "}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Board ----------------------------------------------------------- */}
      <div ref={boardRef} className="grid min-h-0 flex-1 place-items-center py-1">
        <div
          className="grid"
          style={{
            width: boardSide,
            height: boardSide,
            gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
            border: `3px solid ${frame}`,
            background: "var(--raised)",
          }}
        >
          {Array.from({ length: CELLS }, (_, i) => {
            const r = Math.floor(i / SIZE);
            const c = i % SIZE;
            const v = cells[i]!;
            const isGiven = given[i];
            const isBad = bad.has(i);
            const isSelected = selected === i;
            const inScope =
              selected !== null &&
              (r === selRow || c === selCol || boxIndex(SIZE, r, c) === selBox);
            const sameValue = v >= 0 && v === selValue && !isSelected;
            const cellNotes = notes[i]!;

            let background = "transparent";
            if (isBad) background = "rgba(242, 102, 75, 0.30)";
            else if (isSelected) background = "rgba(63, 187, 209, 0.15)";
            else if (sameValue) background = "rgba(63, 187, 209, 0.12)";
            else if (inScope) background = "rgba(255, 255, 255, 0.06)";

            return (
              <button
                key={i}
                type="button"
                className="relative grid place-items-center"
                style={{
                  // Cells share their borders: no gaps, no rounded corners.
                  borderRight:
                    c === SIZE - 1
                      ? "none"
                      : c % 3 === 2
                        ? `2px solid ${frame}`
                        : "1px solid var(--line)",
                  borderBottom:
                    r === SIZE - 1
                      ? "none"
                      : r % 3 === 2
                        ? `2px solid ${frame}`
                        : "1px solid var(--line)",
                  background,
                  color: isGiven ? "var(--text)" : "var(--accent)",
                  fontWeight: isGiven ? 600 : 500,
                  fontSize: Math.round(cellPx * 0.52),
                  lineHeight: 1,
                }}
                onClick={() => {
                  play("tap");
                  setSelected((s) => (s === i ? null : i));
                }}
                aria-label={`${r + 1},${c + 1}`}
              >
                {v >= 0 ? (
                  <span>{glyphFor(v)}</span>
                ) : cellNotes !== 0 ? (
                  <span
                    className="grid h-full w-full"
                    style={{
                      gridTemplateColumns: "repeat(3, 1fr)",
                      fontSize: Math.round(cellPx * 0.24),
                      color: "var(--muted)",
                      fontWeight: 500,
                    }}
                  >
                    {Array.from({ length: SIZE }, (_, s) => (
                      <span key={s} className="grid place-items-center leading-none">
                        {cellNotes & (1 << s) ? glyphFor(s) : ""}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Value pad ------------------------------------------------------- */}
      <div className="no-scrollbar shrink-0 overflow-x-auto pt-2">
        <div className="flex min-w-max justify-center gap-1.5">
          {Array.from({ length: SIZE }, (_, symbol) => {
            const left = remainingOf(symbol);
            const dim = cfg.dimUsedValues && left <= 0;
            return (
              <button
                key={symbol}
                type="button"
                className="tap grid shrink-0 place-items-center rounded-lg font-semibold"
                style={{
                  width: 44,
                  height: 44,
                  fontSize: "1.15rem",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  color: dim ? "var(--line)" : "var(--text)",
                  opacity: dim ? 0.5 : 1,
                }}
                onClick={() => place(symbol)}
                disabled={selected === null}
                aria-label={glyphFor(symbol)}
              >
                {glyphFor(symbol)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls -------------------------------------------------------- */}
      <div className="flex shrink-0 items-center justify-center gap-2 pt-2">
        <PadButton label={t("undo")} onPress={undo} />
        <PadButton label={t("erase")} onPress={erase} disabled={selected === null} />
        <PadButton
          label={t("notes")}
          onPress={() => {
            setNotesMode((n) => !n);
            play("tap");
          }}
          active={notesMode}
        />
        {cfg.hints > 0 ? (
          <PadButton
            label={hintsLeft > 0 ? `${t("hint")} ${hintsLeft}` : t("hint")}
            onPress={useHint}
            disabled={hintsLeft <= 0}
          />
        ) : null}
      </div>

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

function PadButton({
  label,
  onPress,
  disabled = false,
  active = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className="tap flex-1 rounded-lg px-2 text-xs font-semibold disabled:opacity-40"
      style={{
        height: 44,
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--on-state)" : "var(--text)",
        border: active ? "none" : "1px solid var(--line)",
      }}
      onClick={onPress}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
