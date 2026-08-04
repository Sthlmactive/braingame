"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tile, type TileState } from "@/components/Tile";
import { Keyboard, type KeyState } from "@/components/Keyboard";
import { PuzzleError } from "@/components/NotFound";
import type { GameProps } from "@/components/GameShell";
import { useApp } from "@/components/AppProvider";
import { isValidWord, randomWord } from "@/lib/dictionary";
import { fiveConfig } from "@/lib/levels";
import { mulberry32, randomSeed } from "@/lib/rng";
import { play } from "@/lib/sound";
import {
  hardModeViolation,
  hintPosition,
  keyboardState,
  scoreGuess,
  scoreRun,
  type Mark,
} from "./engine";

const MARK_TO_TILE: Record<Mark, TileState> = {
  correct: "correct",
  present: "present",
  absent: "absent",
};

export function Five({ lang, level, onFinish, setStatus, onGiveUp }: GameProps) {
  const { t } = useApp();
  const cfg = useMemo(() => fiveConfig(level), [level]);

  const [answer] = useState(() =>
    randomWord(lang, cfg.length, cfg.band, mulberry32(randomSeed())),
  );
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const [hintsUsed, setHintsUsed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const startedAt = useRef(Date.now());
  const [lastSubmitted, setLastSubmitted] = useState(-1);

  const hintsLeft = cfg.hints - hintsUsed;

  // A hint pre-fills its letter, so the row the player is typing starts from
  // whatever has already been revealed.
  const prefill = useCallback(
    (typed: string) => {
      if (revealed.size === 0 || !answer) return typed;
      const out = typed.split("");
      for (const pos of revealed) {
        while (out.length < pos) out.push("");
        if (out[pos] === undefined || out[pos] === "") out[pos] = answer[pos]!;
      }
      return out.join("");
    },
    [revealed, answer],
  );

  useEffect(() => {
    setStatus(
      cfg.hints > 0 ? (
        <span className="text-xs text-[var(--muted)]">
          {t("hint")} {hintsLeft}
        </span>
      ) : null,
    );
  }, [cfg.hints, hintsLeft, setStatus, t]);

  useEffect(() => {
    if (!answer) return;
    onGiveUp(() => ({
      cleared: false,
      score: 0,
      timeMs: Date.now() - startedAt.current,
      reason: "gaveUp",
      revealWord: answer,
    }));
  }, [answer, onGiveUp]);

  const flash = useCallback((msg: string) => {
    setMessage(msg);
    setShaking(true);
    play("bad");
    window.setTimeout(() => setShaking(false), 280);
    window.setTimeout(() => setMessage((m) => (m === msg ? null : m)), 1600);
  }, []);

  const onLetter = useCallback(
    (letter: string) => {
      if (!answer) return;
      setCurrent((c) => (c.length >= cfg.length ? c : c + letter));
      play("tap");
    },
    [answer, cfg.length],
  );

  const onDelete = useCallback(() => {
    setCurrent((c) => c.slice(0, -1));
    play("tap");
  }, []);

  const onEnter = useCallback(() => {
    if (!answer) return;
    const guess = current;
    if (guess.length < cfg.length) {
      flash(t("wrongLength", { n: cfg.length }));
      return;
    }
    if (!isValidWord(guess, lang)) {
      flash(t("notAWord"));
      return;
    }
    if (cfg.hardMode) {
      const v = hardModeViolation(guess, guesses, answer);
      if (v) {
        flash(t("useTheClues"));
        return;
      }
    }

    const next = [...guesses, guess];
    setGuesses(next);
    setCurrent("");
    setLastSubmitted(next.length - 1);

    const solved = guess === answer;
    if (solved || next.length >= cfg.guesses) {
      const timeMs = Date.now() - startedAt.current;
      // Let the flip animation finish before the sheet covers the board.
      window.setTimeout(() => {
        onFinish({
          cleared: solved,
          score: scoreRun({
            solved,
            guessesUsed: next.length,
            guessesAllowed: cfg.guesses,
            timeMs,
            hintsUsed,
            length: cfg.length,
          }),
          timeMs,
          reason: solved ? "solved" : "outOfGuesses",
          revealWord: solved ? undefined : answer,
        });
      }, cfg.length * 90 + 380);
    } else {
      play("place");
    }
  }, [
    answer,
    current,
    cfg,
    guesses,
    lang,
    flash,
    t,
    onFinish,
    hintsUsed,
  ]);

  const useHint = useCallback(() => {
    if (!answer || hintsLeft <= 0) return;
    const pos = hintPosition(answer, guesses, revealed);
    if (pos === null) return;
    setRevealed((r) => new Set(r).add(pos));
    setHintsUsed((n) => n + 1);
    setCurrent((c) => prefill(c));
    play("good");
  }, [answer, hintsLeft, guesses, revealed, prefill]);

  const keyStates = useMemo(() => {
    if (!answer || !cfg.keyboardColours) return {};
    return keyboardState(guesses, answer) as Record<string, KeyState>;
  }, [guesses, answer, cfg.keyboardColours]);

  if (!answer) return <PuzzleError onRetry={() => window.location.reload()} />;

  const rows = Array.from({ length: cfg.guesses }, (_, r) => r);
  // The board must fit an iPhone SE without scrolling, so the tile size falls
  // out of the available width rather than being fixed.
  const tilePx = Math.min(58, Math.floor((340 - (cfg.length - 1) * 6) / cfg.length));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex flex-1 flex-col items-center justify-center gap-[6px] py-2">
        {message ? (
          <div
            className="fade-enter absolute top-0 z-10 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: "var(--text)", color: "var(--ink)" }}
            role="status"
          >
            {message}
          </div>
        ) : null}

        {rows.map((r) => {
          const submitted = r < guesses.length;
          const word = submitted ? guesses[r]! : r === guesses.length ? current : "";
          const marks = submitted ? scoreGuess(guesses[r]!, answer) : null;
          const isActive = r === guesses.length;
          return (
            <div
              key={r}
              className={`flex gap-[6px] ${
                shaking && isActive ? "shake" : ""
              }`}
            >
              {Array.from({ length: cfg.length }, (_, c) => {
                const letter = word[c] ?? "";
                const hinted = isActive && revealed.has(c) && !letter;
                let state: TileState = "empty";
                if (marks) state = MARK_TO_TILE[marks[c]!];
                else if (letter) state = "filled";
                else if (hinted) state = "muted";
                return (
                  <Tile
                    key={c}
                    px={tilePx}
                    letter={hinted ? answer[c] : letter || undefined}
                    state={state}
                    flip={submitted}
                    flipDelay={submitted && r === lastSubmitted ? c * 90 : 0}
                    settleKey={!submitted && letter ? `${r}-${c}-${letter}` : undefined}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {cfg.hints > 0 ? (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            className="tap rounded-full px-4 py-2 text-xs font-semibold"
            style={{
              border: "1px solid var(--line)",
              color: hintsLeft > 0 ? "var(--accent)" : "var(--muted)",
            }}
            onClick={useHint}
            disabled={hintsLeft <= 0}
          >
            {hintsLeft > 0 ? `${t("hint")} · ${hintsLeft}` : t("noHintsLeft")}
          </button>
        </div>
      ) : null}

      <Keyboard
        lang={lang}
        t={t}
        onLetter={onLetter}
        onEnter={onEnter}
        onDelete={onDelete}
        states={keyStates}
        showStates={cfg.keyboardColours}
      />
    </div>
  );
}
