"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard } from "@/components/Keyboard";
import { Tile } from "@/components/Tile";
import { clueFor, type ClueBank } from "@/lib/clues";
import type { Lang, T } from "@/lib/i18n";
import { entriesOf, isBlack, sizeOf, wordOf, type Entry } from "@/lib/mini";
import { useBoardFit } from "@/lib/useBoardFit";
import { useSolveClock } from "./useSolveClock";
import {
  activeCells,
  applyHint,
  backspace,
  entryAt,
  hintCell,
  hintKey,
  isComplete,
  isSolved,
  newGame,
  selectCell,
  stepEntry,
  typeLetter,
  wrongCells,
  type MiniState,
} from "./engine";

/**
 * The board, the clue bar and the keyboard.
 *
 * Layout is Five's `100dvh` flex column with one more `shrink-0` element in
 * it: header, board (`flex-1`), clue bar, keyboard. The clue bar has a
 * **fixed** height of two lines — not `auto` — because a bar that grew with
 * the clue would resize the board on every arrow tap. `useBoardFit` measures
 * the flex-1 box, so the tiles shrink to whatever the bar and keyboard leave.
 */

/** How long the wrong letters stay marked before the grid is handed back. */
const WRONG_MS = 900;

export interface MiniProps {
  lang: Lang;
  t: T;
  /** The puzzle string, one character per cell, `#` for black. */
  puzzle: string;
  /** Index of this puzzle in its bank, for picking between a word's two clues. */
  puzzleIndex: number;
  clues: ClueBank;
  hints: number;
  onSolved: (seconds: number) => void;
  /** The header shows the clock, so the tick is reported out. */
  onTick: (seconds: number) => void;
  onOpenClueList: (open: boolean) => void;
  clueListOpen: boolean;
}

export function Mini({
  lang,
  t,
  puzzle,
  puzzleIndex,
  clues,
  hints,
  onSolved,
  onTick,
  onOpenClueList,
  clueListOpen,
}: MiniProps) {
  const entries = useMemo(() => entriesOf(puzzle), [puzzle]);
  const size = sizeOf(puzzle);
  const [state, setState] = useState<MiniState>(() => newGame(puzzle));
  const [hintsLeft, setHintsLeft] = useState(hints);
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(false);

  // Starts on the first keystroke, pauses on a hidden tab, and reports the
  // count from an effect rather than from a state updater. See useSolveClock.
  const { seconds, start, stop, reset } = useSolveClock(onTick);

  useEffect(() => {
    setState(newGame(puzzle));
    setHintsLeft(hints);
    setWrong(new Set());
    setDone(false);
    reset();
  }, [puzzle, hints, reset]);

  /**
   * Checking runs in an effect, not inside a state updater.
   *
   * It has to: finishing a puzzle calls `onSolved`, which sets state in the
   * screen above. React runs updaters during the render phase, so doing it
   * there updates the parent mid-render — the same fault the clock had. An
   * effect runs after commit, where notifying another component is legal.
   */
  useEffect(() => {
    if (done || !isComplete(state)) return;
    if (isSolved(state)) {
      stop();
      setDone(true);
      onSolved(seconds);
      return;
    }
    // Wrong: mark, then hand the grid back. The clock keeps running.
    setWrong(new Set(wrongCells(state)));
    const id = window.setTimeout(() => setWrong(new Set()), WRONG_MS);
    return () => window.clearTimeout(id);
  }, [state, done, onSolved, seconds, stop]);

  const onLetter = useCallback(
    (letter: string) => {
      if (done) return;
      start();
      setState((prev) => typeLetter(prev, entries, letter));
    },
    [done, entries, start],
  );

  const onBackspace = useCallback(() => {
    if (done) return;
    setState((prev) => backspace(prev, entries));
  }, [done, entries]);

  const onHint = useCallback(() => {
    if (done || hintsLeft <= 0) return;
    const cell = hintCell(state, entries);
    if (cell === null) return;
    setHintsLeft((n) => n - 1);
    setState(applyHint(state, entries, cell));
  }, [done, hintsLeft, state, entries]);

  const active = useMemo(() => new Set(activeCells(state, entries)), [state, entries]);
  const entry = entryAt(entries, state.cursor.cell, state.cursor.direction);

  const [boardRef, tilePx] = useBoardFit(size, size, { gap: 4, max: 58 });

  const clueText = entry ? clueFor(clues, wordOf(puzzle, entry), puzzleIndex) : "";


  // Presence decided by the grant, which is fixed for the round; availability
  // by what is left. See hintKey in the engine.
  const hint = hintKey(hints, hintsLeft, t("hint"));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Board. flex-1 and optically centred inside whatever is left. */}
      <div ref={boardRef} className="flex min-h-0 flex-1 items-center justify-center">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${size}, ${tilePx}px)`,
            gap: 4,
          }}
          role="grid"
          aria-label={t("clues")}
        >
          {[...puzzle].map((_cell, i) => {
            const black = isBlack(puzzle, i);
            const letter = state.filled[i] ?? " ";
            return (
              <Tile
                key={i}
                px={tilePx}
                state={black ? "black" : wrong.has(i) ? "miss" : letter !== " " ? "typed" : "empty"}
                letter={black ? undefined : letter.trim().toUpperCase() || undefined}
                corner={numberAt(entries, i)}
                activeEntry={!black && active.has(i)}
                activeCell={!black && i === state.cursor.cell}
                onPress={black ? undefined : () => setState((p) => ({ ...p, cursor: selectCell(p, entries, i) }))}
                label={black ? undefined : `${Math.floor(i / size) + 1},${(i % size) + 1}`}
              />
            );
          })}
        </div>
      </div>

      {/*
        Clue bar. The height is fixed, not `auto`: a bar that grew with the
        clue would resize the board on every arrow tap. 64px holds an 11px
        caption line plus two 13px lines at leading-tight, which is the whole
        bank — the longest clue in it is 48 characters and a line fits ~33 at
        this width on a 320pt screen.
      */}
      <div className="shrink-0 px-1 pb-2">
        <div
          className="flex items-center gap-1 rounded-lg px-1"
          style={{ background: "var(--raised)", height: 64 }}
        >
          <ArrowButton dir="prev" label={t("back")} onPress={() => setState((p) => ({ ...p, cursor: stepEntry(p, entries, -1) }))} />
          <button
            type="button"
            onClick={() => onOpenClueList(!clueListOpen)}
            className="tap flex min-w-0 flex-1 flex-col justify-center overflow-hidden text-left"
            style={{ height: 64 }}
          >
            <span className="t-caption block truncate text-[var(--muted)]">
              {entry
                ? `${entry.number} ${entry.direction === "across" ? t("miniAcross") : t("miniDown")}`
                : ""}
            </span>
            {/* Two lines reserved whether the clue needs them or not. */}
            <span
              className="t-body block leading-tight"
              style={{ height: 34, overflow: "hidden" }}
            >
              {clueText}
            </span>
          </button>
          <ArrowButton dir="next" label={t("more")} onPress={() => setState((p) => ({ ...p, cursor: stepEntry(p, entries, 1) }))} />
        </div>
      </div>

      <div className="shrink-0">
        <Keyboard
          lang={lang}
          t={t}
          onLetter={onLetter}
          onDelete={onBackspace}
          // Mini has nothing to submit, so the Enter slot is the hint and is
          // labelled as one. Present for the whole round on a difficulty that
          // grants hints, absent for the whole round on one that does not, and
          // merely disabled once they are spent. See hintKey.
          onEnter={hint?.enabled ? onHint : undefined}
          enterLabel={hint?.label}
          disabled={done}
          showStates={false}
          captureHardware
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {wrong.size > 0 ? t("notQuite") : ""}
      </span>
    </div>
  );
}

/** The clue number a cell prints, or nothing when it starts no entry. */
function numberAt(entries: Entry[], cell: number): string | undefined {
  const starts = entries.find((e) => e.cells[0] === cell);
  return starts ? String(starts.number) : undefined;
}

function ArrowButton({
  dir,
  label,
  onPress,
}: {
  dir: "prev" | "next";
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className="tap grid h-11 w-9 shrink-0 place-items-center text-[var(--muted)]"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
