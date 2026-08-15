"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { DataError, Loading, NotFound } from "@/components/NotFound";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { HowToPlay } from "@/games/mini/HowToPlay";
import { Mini } from "@/games/mini/Mini";
import { formatTime, MiniResult } from "@/games/mini/MiniResult";
import { advance, currentWord, ensureBag, loadBags, miniBagKey, saveBag } from "@/lib/bag";
import { clueFor, loadClues, type ClueBank } from "@/lib/clues";
import { isDifficulty, type Difficulty } from "@/lib/difficulty";
import { isLang, type Lang } from "@/lib/i18n";
import { MINI_HINTS, entriesOf, wordOf } from "@/lib/mini";
import { play } from "@/lib/sound";

const SEEN_HELP = "ordlek.mini.helpSeen.v1";

/**
 * The game screen: loads the bank and the clues, serves puzzles from the bag,
 * and owns everything around the board — the clock in the header, the result
 * sheet, the clue list and the rules.
 *
 * The board itself owns none of that, which is what lets `Mini` be a plain
 * component over a puzzle string.
 */
export function MiniGameScreen({
  lang,
  difficulty,
}: {
  lang: string;
  difficulty: string;
}) {
  const { t, ready, recordMiniRun, miniStat } = useApp();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [bank, setBank] = useState<string[]>([]);
  const [clues, setClues] = useState<ClueBank>(new Map());
  const [index, setIndex] = useState(0);
  const [puzzle, setPuzzle] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [solvedIn, setSolvedIn] = useState<number | null>(null);
  const [isBest, setIsBest] = useState(false);
  const [clueList, setClueList] = useState(false);
  const [help, setHelp] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const bagRef = useRef<ReturnType<typeof ensureBag> | null>(null);

  const validLang = isLang(lang) ? (lang as Lang) : null;
  const validDifficulty = isDifficulty(difficulty) ? (difficulty as Difficulty) : null;

  const load = useCallback(async () => {
    if (!validLang || !validDifficulty) return;
    setPhase("loading");
    try {
      const [bankText, clueBank] = await Promise.all([
        fetch(`/data/${validLang}/mini-${validDifficulty}.txt`).then((r) => {
          if (!r.ok) throw new Error(`bank ${r.status}`);
          return r.text();
        }),
        loadClues(validLang, validDifficulty),
      ]);
      const puzzles = bankText.split("\n").filter((line) => line.length > 0);
      setBank(puzzles);
      setClues(clueBank);

      // The bag, with the pool fingerprint, exactly as Five serves words.
      const key = miniBagKey(validLang, validDifficulty);
      const hash = `${puzzles.length}:${puzzles[0] ?? ""}:${puzzles[puzzles.length - 1] ?? ""}`;
      const state = ensureBag(loadBags()[key], hash, puzzles.length);
      bagRef.current = state;
      saveBag(key, state);
      setPuzzle(currentWord(puzzles, state));
      setIndex(state.cursor);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [validLang, validDifficulty]);

  useEffect(() => {
    void load();
  }, [load]);

  // The rules, once, before the first puzzle.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(SEEN_HELP)) return;
    setHelp(true);
    window.localStorage.setItem(SEEN_HELP, "1");
  }, []);

  const onSolved = useCallback(
    (seconds: number) => {
      if (!validLang || !validDifficulty) return;
      play("good");
      const { isBest: best } = recordMiniRun(validLang, validDifficulty, seconds);
      setIsBest(best);
      setSolvedIn(seconds);
    },
    [validLang, validDifficulty, recordMiniRun],
  );

  const nextPuzzle = useCallback(() => {
    if (!validLang || !validDifficulty || !bagRef.current) return;
    const key = miniBagKey(validLang, validDifficulty);
    const { state } = advance(bagRef.current, bank.length);
    bagRef.current = state;
    saveBag(key, state);
    setPuzzle(currentWord(bank, state));
    setIndex(state.cursor);
    setSolvedIn(null);
    setElapsed(0);
    setRound((n) => n + 1);
  }, [validLang, validDifficulty, bank]);

  const entries = useMemo(() => (puzzle ? entriesOf(puzzle) : []), [puzzle]);

  if (!validLang || !validDifficulty) return <NotFound />;
  if (phase === "error") return <DataError onRetry={() => void load()} />;

  return (
    <Screen
      title={t("miniName")}
      subtitle={t(
        validDifficulty === "easy"
          ? "diffEasy"
          : validDifficulty === "medium"
            ? "diffMedium"
            : validDifficulty === "hard"
              ? "diffHard"
              : "diffExtreme",
      )}
      backHref={`/mini/${validLang}`}
      right={
        <div className="flex items-center gap-3">
          <span className="t-row tnum text-[var(--muted)]">{formatTime(elapsed)}</span>
          <button
            type="button"
            onClick={() => setHelp(true)}
            className="tap px-1 text-xs font-semibold text-[var(--muted)]"
          >
            {t("howToPlay")}
          </button>
        </div>
      }
    >
      {phase === "loading" || !puzzle || !ready ? (
        <Loading />
      ) : (
        <Mini
          key={round}
          lang={validLang}
          t={t}
          puzzle={puzzle}
          puzzleIndex={index}
          clues={clues}
          hints={MINI_HINTS[validDifficulty]}
          onSolved={onSolved}
          onTick={setElapsed}
          onOpenClueList={setClueList}
          clueListOpen={clueList}
        />
      )}

      <Sheet open={clueList} onClose={() => setClueList(false)} title={t("clues")}>
        <div className="flex flex-col gap-4 pb-4">
          {(["across", "down"] as const).map((direction) => (
            <div key={direction}>
              <div className="t-caption tracking-[0.08em] text-[var(--muted)] uppercase">
                {t(direction === "across" ? "miniAcross" : "miniDown")}
              </div>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {entries
                  .filter((e) => e.direction === direction)
                  .map((e) => (
                    <li key={`${e.number}${direction}`} className="flex gap-2">
                      <span className="t-body tnum w-5 shrink-0 text-right text-[var(--muted)]">
                        {e.number}
                      </span>
                      <span className="t-body">
                        {puzzle ? clueFor(clues, wordOf(puzzle, e), index) : ""}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </Sheet>

      <HowToPlay open={help} onClose={() => setHelp(false)} t={t} />

      <MiniResult
        open={solvedIn !== null}
        seconds={solvedIn ?? 0}
        isBest={isBest}
        stat={miniStat(validLang, validDifficulty)}
        lang={validLang}
        difficulty={validDifficulty}
        onNewPuzzle={nextPuzzle}
      />
    </Screen>
  );
}
