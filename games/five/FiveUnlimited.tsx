"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Tile, type TileState } from "@/components/Tile";
import { Keyboard, type KeyState } from "@/components/Keyboard";
import { DataError } from "@/components/NotFound";
import { Sheet, SheetButton } from "@/components/Sheet";
import { useApp } from "@/components/AppProvider";
import {
  isValidWord,
  loadLanguage,
  difficultyPool,
  poolFingerprint,
} from "@/lib/dictionary";
import { fiveConfig } from "@/lib/levels";
import { logReject } from "@/lib/debug";
import { emptyFiveStat, type FiveStat } from "@/lib/storage";
import {
  advance,
  bagKey,
  currentWord,
  ensureBag,
  loadBags,
  saveBag,
  type BagState,
} from "@/lib/bag";
import type { Difficulty } from "@/lib/difficulty";
import type { Lang, StringKey } from "@/lib/i18n";
import { useBoardFit } from "@/lib/useBoardFit";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { revealTiming } from "@/lib/reveal";
import { play } from "@/lib/sound";
import { FiveResult } from "./FiveResult";
import { checkGuess, hintPosition, keyboardState, scoreGuess, type Mark } from "./engine";

const MARK_TO_TILE: Record<Mark, TileState> = {
  correct: "hit",
  present: "near",
  absent: "miss",
};

export const DIFFICULTY_KEY: Record<Difficulty, StringKey> = {
  easy: "diffEasy",
  medium: "diffMedium",
  hard: "diffHard",
  extreme: "diffExtreme",
};

const HOWTO_KEY = "Ordlek.five.howto.v1";

interface Finished {
  won: boolean;
  guessesUsed: number;
  answer: string;
  stat: FiveStat;
  /** The draw that emptied the bag, so the message is shown exactly once. */
  wrapped: boolean;
}

/**
 * Five, unlimited. Pick a language, pick a difficulty, then play words from a
 * shuffled bag until you stop wanting to.
 *
 * The board renders straight away and only Enter waits for the word list, so
 * opening the game never shows a spinner where the board should be.
 */
export function FiveUnlimited({
  lang,
  difficulty,
}: {
  lang: Lang;
  difficulty: Difficulty;
}) {
  const { t, recordFiveRun } = useApp();
  const cfg = fiveConfig(difficulty);
  const reduced = useReducedMotion();
  const timing = useMemo(() => revealTiming(reduced), [reduced]);

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [bag, setBag] = useState<BagState | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);

  const [guesses, setGuesses] = useState<string[]>([]);
  /**
   * How many guesses have finished revealing. The keyboard reads this rather
   * than `guesses`, so a key never recolours before its row has landed.
   */
  const [revealed, setRevealed] = useState(0);
  const [bounceRow, setBounceRow] = useState(-1);
  const [current, setCurrent] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState(-1);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [howTo, setHowTo] = useState(false);
  const [hinted, setHinted] = useState<Set<number>>(() => new Set());
  const [hintsUsed, setHintsUsed] = useState(0);
  const settled = useRef(false);
  const hintsLeft = cfg.hints - hintsUsed;

  // Show the rules once per device.
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(HOWTO_KEY)) setHowTo(true);
    } catch {
      // Private mode. Showing the rules again is harmless.
    }
  }, []);

  const load = useCallback(() => {
    setPhase("loading");
    let cancelled = false;
    loadLanguage(lang).then(
      () => {
        if (cancelled) return;
        const pool = difficultyPool(lang, difficulty);
        if (pool.length === 0) {
          setPhase("error");
          return;
        }
        const hash = poolFingerprint(lang, difficulty);
        const stored = loadBags()[bagKey(lang, difficulty)];
        // A pool that changed under a saved cursor resets the bag rather than
        // silently pointing at a different word.
        const next = ensureBag(stored, hash, pool.length);
        setBag(next);
        setAnswer(currentWord(pool, next));
        setPhase("ready");
      },
      () => !cancelled && setPhase("error"),
    );
    return () => {
      cancelled = true;
    };
  }, [lang, difficulty]);

  useEffect(() => load(), [load]);

  const flash = useCallback((msg: string) => {
    setMessage(msg);
    setShaking(true);
    play("bad");
    window.setTimeout(() => setShaking(false), 280);
    window.setTimeout(() => setMessage((m) => (m === msg ? null : m)), 1600);
  }, []);

  /** Draw the next word from the bag without leaving the screen. */
  const newWord = useCallback(() => {
    const pool = difficultyPool(lang, difficulty);
    if (!bag || pool.length === 0) return;
    const stepped = advance(bag, pool.length);
    saveBag(bagKey(lang, difficulty), stepped.state);
    setBag(stepped.state);
    setAnswer(currentWord(pool, stepped.state));
    setGuesses([]);
    setRevealed(0);
    setBounceRow(-1);
    setCurrent("");
    setLastSubmitted(-1);
    setFinished(null);
    setHinted(new Set());
    setHintsUsed(0);
    settled.current = false;
  }, [bag, lang, difficulty]);

  const onLetter = useCallback(
    (letter: string) => {
      if (phase !== "ready" || finished) return;
      setCurrent((c) => (c.length >= cfg.length ? c : c + letter));
      play("tap");
    },
    [phase, finished, cfg.length],
  );

  const onDelete = useCallback(() => {
    if (finished) return;
    setCurrent((c) => c.slice(0, -1));
    play("tap");
  }, [finished]);

  const onEnter = useCallback(() => {
    // Enter is the one control that genuinely needs the word list.
    if (phase !== "ready" || !answer || finished) return;
    const guess = current;
    const check = checkGuess({
      guess,
      length: cfg.length,
      isWord: (w) => isValidWord(w, lang),
    });

    if (!check.ok) {
      logReject({
        word: guess,
        length: guess.length,
        lang,
        level: difficulty,
        reason: check.reason ?? "unknown",
      });
      flash(
        check.reason === "wrongLength"
          ? t("wrongLength", { n: cfg.length })
          : t(check.reason ?? "notAWord"),
      );
      return;
    }

    const next = [...guesses, guess];
    setGuesses(next);
    setCurrent("");
    setLastSubmitted(next.length - 1);

    const rowMs = timing.rowMs(cfg.length);
    // Keys recolour only once the whole row has landed.
    window.setTimeout(() => setRevealed(next.length), rowMs);

    const won = guess === answer;
    if (won || next.length >= cfg.guesses) {
      if (settled.current) return;
      settled.current = true;
      const stat = recordFiveRun(lang, difficulty, {
        won,
        guessesUsed: next.length,
      });
      // This word was the last one in the bag, so the player has now seen every
      // word at this difficulty. Said on this sheet, once, before the reshuffle
      // that the next Nytt ord performs.
      const pool = difficultyPool(lang, difficulty);
      const wrapped = bag !== null && bag.cursor === pool.length - 1;
      if (won && timing.settle) {
        window.setTimeout(() => setBounceRow(next.length - 1), rowMs);
      }
      window.setTimeout(() => play(won ? "win" : "bad"), rowMs);
      // The sheet waits for the row, and for the bounce when there is one.
      window.setTimeout(
        () => setFinished({ won, guessesUsed: next.length, answer, stat, wrapped }),
        rowMs + (won && timing.settle ? 380 : 240),
      );
    } else {
      play("place");
    }
  }, [
    phase,
    answer,
    finished,
    current,
    cfg,
    guesses,
    lang,
    difficulty,
    flash,
    t,
    recordFiveRun,
    bag,
    timing,
  ]);

  const useHint = useCallback(() => {
    if (!answer || hintsLeft <= 0 || finished) return;
    const pos = hintPosition(answer, guesses, hinted);
    if (pos === null) return;
    // The letter shows greyed in its own column and stays there until typed
    // past. Splicing it into the typed string would put it in the wrong column.
    setHinted((r) => new Set(r).add(pos));
    setHintsUsed((n) => n + 1);
    play("good");
  }, [answer, hintsLeft, guesses, hinted, finished]);

  const [boardRef, tilePx] = useBoardFit(cfg.length, cfg.guesses, {
    gap: 4,
    max: 62,
  });

  const keyStates = useMemo(() => {
    if (!answer || !cfg.keyboardColours) return {};
    return keyboardState(guesses.slice(0, revealed), answer) as Record<
      string,
      KeyState
    >;
  }, [guesses, revealed, answer, cfg.keyboardColours]);

  if (phase === "error") return <DataError onRetry={load} />;

  const rows = Array.from({ length: cfg.guesses }, (_, r) => r);

  return (
    <main
      className="page-enter game-surface safe-x mx-auto flex w-full max-w-[560px] flex-col"
      style={{ height: "100dvh" }}
    >
      {/* Four things, and no more. The streak lives on the result sheet: at
          zero it is noise and mid game it is a distraction. ---------------- */}
      <header className="safe-top flex shrink-0 items-center gap-2 pt-2 pb-3">
        <Link
          href={`/five/${lang}`}
          className="tap -ml-2 grid place-items-center text-[var(--muted)]"
          aria-label={t("back")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="t-title truncate">{t("gameFive")}</h1>
          <p className="t-caption truncate text-[var(--muted)]">
            {phase === "ready"
              ? `${t(DIFFICULTY_KEY[difficulty])} · ${t(
                  lang === "sv" ? "langSv" : "langEn",
                )}`
              : t("loadingWords")}
          </p>
        </div>

        {cfg.hints > 0 ? (
          <button
            type="button"
            className="t-caption tap shrink-0 px-1"
            style={{ color: hintsLeft > 0 ? "var(--ink)" : "var(--muted)" }}
            onClick={useHint}
            disabled={hintsLeft <= 0 || phase !== "ready" || finished !== null}
          >
            {hintsLeft > 0 ? `${t("hint")} ${hintsLeft}` : t("noHintsLeft")}
          </button>
        ) : null}

        <button
          type="button"
          className="tap shrink-0 text-[var(--muted)]"
          onClick={() => setHowTo(true)}
          aria-label={t("howToPlay")}
        >
          ?
        </button>
      </header>

      {/* The board takes what is left and centres inside it, so the gap above
          the first row matches the gap below the last. -------------------- */}
      <div
        ref={boardRef}
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center py-2"
        style={{ gap: "var(--gap-tile)" }}
      >
        {message ? (
          <div
            className="fade-enter t-caption absolute top-1 z-10 rounded-[var(--radius-card)] px-3 py-1.5 font-semibold"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
            role="status"
          >
            {message}
          </div>
        ) : null}

        {rows.map((r) => {
          const submitted = r < guesses.length;
          const word = submitted ? guesses[r]! : r === guesses.length ? current : "";
          const marks = submitted && answer ? scoreGuess(guesses[r]!, answer) : null;
          const isActive = r === guesses.length;
          return (
            <div
              key={r}
              className={`flex ${shaking && isActive ? "shake" : ""}`}
              style={{ gap: "var(--gap-tile)" }}
            >
              {Array.from({ length: cfg.length }, (_, c) => {
                const letter = word[c] ?? "";
                const showHint = isActive && hinted.has(c) && !letter;
                let state: TileState = "empty";
                if (marks) state = MARK_TO_TILE[marks[c]!];
                else if (letter) state = "typed";
                else if (showHint) state = "muted";
                return (
                  <Tile
                    key={c}
                    px={tilePx}
                    letter={showHint && answer ? answer[c] : letter || undefined}
                    state={state}
                    flip={submitted && timing.flip}
                    flipMs={timing.flipMs}
                    flipDelay={
                      submitted && r === lastSubmitted ? timing.delayFor(c) : 0
                    }
                    settleKey={r === bounceRow ? `win-${r}` : undefined}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="shrink-0">
        <Keyboard
          lang={lang}
          t={t}
          onLetter={onLetter}
          onEnter={onEnter}
          onDelete={onDelete}
          states={keyStates}
          showStates={cfg.keyboardColours}
          disabled={phase !== "ready" || finished !== null}
        />
      </div>

      <HowToPlay
        open={howTo}
        difficulty={difficulty}
        length={cfg.length}
        guesses={cfg.guesses}
        keyboardColours={cfg.keyboardColours}
        onClose={() => {
          setHowTo(false);
          try {
            window.localStorage.setItem(HOWTO_KEY, "1");
          } catch {
            // ignore
          }
        }}
      />

      <FiveResult
        open={finished !== null}
        won={finished?.won ?? false}
        answer={finished?.answer ?? ""}
        guessesUsed={finished?.guessesUsed ?? 0}
        stat={finished?.stat ?? emptyFiveStat()}
        lang={lang}
        difficulty={difficulty}
        wrapped={finished?.wrapped ?? false}
        onNewWord={newWord}
      />
    </main>
  );
}

/**
 * The rules. There is no hard mode to explain: the only ways a guess is turned
 * away are wrong length and not a word. The grey keyboard is spelled out for
 * Extrem, since it is otherwise easy to read as a bug.
 */
function HowToPlay({
  open,
  difficulty,
  length,
  guesses,
  keyboardColours,
  onClose,
}: {
  open: boolean;
  difficulty: Difficulty;
  length: number;
  guesses: number;
  keyboardColours: boolean;
  onClose: () => void;
}) {
  const { t } = useApp();
  return (
    <Sheet open={open} onClose={onClose} title={t("howToPlay")}>
      <div className="flex flex-col gap-3 pt-1 pb-3">
        <p className="t-body text-[var(--muted)]">
          {t(DIFFICULTY_KEY[difficulty])} ·{" "}
          {t("fiveRuleGuesses", { len: length, n: guesses })}
        </p>
        <p className="t-body text-[var(--muted)]">{t("fiveRuleColours")}</p>
        {!keyboardColours ? (
          <p className="t-body text-[var(--muted)]">{t("fiveRuleNoColours")}</p>
        ) : null}
      </div>
      <div className="pb-2">
        <SheetButton variant="loud" onClick={onClose}>
          {t("startPlaying")}
        </SheetButton>
      </div>
    </Sheet>
  );
}
