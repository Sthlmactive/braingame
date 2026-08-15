"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loading, PuzzleError } from "@/components/NotFound";
import { Sheet, SheetButton } from "@/components/Sheet";
import type { GameProps } from "@/components/GameShell";
import { useApp } from "@/components/AppProvider";
import { GAMES } from "@/lib/games";
import { isValidWord } from "@/lib/dictionary";
import { loadLoopBoards } from "@/lib/puzzles";
import { loopConfig } from "@/lib/levels";
import { mulberry32, randomSeed, shuffle } from "@/lib/rng";
import { useBoardFit } from "@/lib/useBoardFit";
import { play } from "@/lib/sound";
import { key, layout, type LoopBoard } from "./board";
import { WheelSvg, svgToClient, slotsForLetters, type TrailFeedback, type WheelLetter } from "./WheelSvg";
import { isSubmittable, selectionWord } from "./wheel";

const TAP_HINT_KEY = "Ordlek.loop.tapHint.v1";
const FLY_MS = 380;

interface Flyer {
  id: string;
  letter: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function Loop({
  lang,
  level,
  onFinish,
  onGiveUp,
  requestGiveUp,
}: GameProps) {
  const { t } = useApp();
  const router = useRouter();
  const cfg = useMemo(() => loopConfig(level), [level]);

  const [board, setBoard] = useState<LoopBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [solved, setSolved] = useState<string[]>([]);
  const [bonus, setBonus] = useState<string[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tapHint, setTapHint] = useState(false);
  const startedAt = useRef(Date.now());

  // The wheel keeps stable letter ids; a shuffle only moves them to new slots.
  const [letters, setLetters] = useState<WheelLetter[]>([]);
  const [slotOf, setSlotOf] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<TrailFeedback>(null);
  const [trail, setTrail] = useState<number[]>([]);
  const [flying, setFlying] = useState<Flyer[]>([]);
  const [flyPhase, setFlyPhase] = useState<"start" | "end">("start");

  const svgRef = useRef<SVGSVGElement | null>(null);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const feedbackTimer = useRef<number | null>(null);

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
        const ls = [...chosen.wheel].map((letter, id) => ({ id, letter }));
        setLetters(ls);
        setSlotOf(shuffle(ls.map((_, i) => i), rng));
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [lang, level]);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(TAP_HINT_KEY)) setTapHint(true);
    } catch {
      // Private mode. The hint is a nicety, not a requirement.
    }
  }, []);

  useEffect(
    () => () => {
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    },
    [],
  );

  const target = useMemo(
    () => (board ? board.words.map((w) => w.word) : []),
    [board],
  );
  const hintsLeft = cfg.hints - hintsUsed;

  const [boardRef, cellPx] = useBoardFit(board?.width ?? 1, board?.height ?? 1, {
    gap: 4,
    max: 30,
    // Level 10 boards run to 13 rows and the wheel takes a fixed slice of the
    // screen, so the floor has to be low enough for an iPhone SE.
    min: 10,
  });

  useEffect(() => {
    onGiveUp(() => ({
      cleared: false,
      score: solved.length * 30 + bonus.length * 8,
      timeMs: Date.now() - startedAt.current,
      reason: "gaveUp",
    }));
  }, [onGiveUp, solved.length, bonus.length]);

  const currentWord = selectionWord(
    selected,
    letters.map((l) => l.letter),
  );

  const runFeedback = useCallback((kind: Exclude<TrailFeedback, null>, ids: number[]) => {
    setTrail(ids);
    setFeedback(kind);
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => {
      setFeedback(null);
      setTrail([]);
    }, kind === "shake" ? 260 : 340);
  }, []);

  const complete = useCallback(
    (count: number) => {
      const timeMs = Date.now() - startedAt.current;
      window.setTimeout(
        () =>
          onFinish({
            cleared: true,
            score: Math.max(
              0,
              count * 50 +
                bonus.length * 10 +
                Math.max(0, 300 - Math.floor(timeMs / 1000)) * 2 -
                hintsUsed * 40,
            ),
            timeMs,
            reason: "solved",
            note: bonus.length > 0 ? t("bonusFound", { n: bonus.length }) : undefined,
          }),
        FLY_MS + 300,
      );
    },
    [bonus.length, hintsUsed, onFinish, t],
  );

  /** Send the letters from the wheel to the slots they just filled. */
  const flyIntoBoard = useCallback(
    (word: string, ids: number[]) => {
      const svg = svgRef.current;
      const placement = board?.words.find((w) => w.word === word);
      const positions = slotsForLetters(letters, slotOf);
      const byId = new Map(positions.map((p) => [p.index, p]));

      const flyers: Flyer[] = [];
      if (svg && placement) {
        ids.forEach((id, i) => {
          const from = byId.get(id);
          const x = placement.dir === "h" ? placement.x + i : placement.x;
          const y = placement.dir === "v" ? placement.y + i : placement.y;
          const cell = cellRefs.current.get(key(x, y));
          if (!from || !cell) return;
          const start = svgToClient(svg, from.cx, from.cy);
          const box = cell.getBoundingClientRect();
          if (!start) return;
          flyers.push({
            id: `${word}-${i}`,
            letter: letters.find((l) => l.id === id)?.letter ?? "",
            from: start,
            to: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
          });
        });
      }

      if (flyers.length === 0) {
        setSolved((s) => (s.includes(word) ? s : [...s, word]));
        return;
      }

      setFlying(flyers);
      setFlyPhase("start");
      requestAnimationFrame(() => setFlyPhase("end"));
      window.setTimeout(() => {
        setFlying([]);
        setSolved((s) => (s.includes(word) ? s : [...s, word]));
      }, FLY_MS);
    },
    [board, letters, slotOf],
  );

  const release = useCallback(
    (wasDrag: boolean) => {
      const ids = selected;
      if (!wasDrag) return;
      setSelected([]);
      if (!isSubmittable(ids)) return; // too short: no complaint, just gone

      const word = selectionWord(
        ids,
        letters.map((l) => l.letter),
      );

      if (target.includes(word)) {
        if (solved.includes(word)) {
          runFeedback("pulse", ids);
          return;
        }
        play("good");
        runFeedback("flash", ids);
        flyIntoBoard(word, ids);
        if (solved.length + 1 === target.length) complete(target.length);
        return;
      }

      if (isValidWord(word, lang)) {
        if (bonus.includes(word)) {
          runFeedback("pulse", ids);
          return;
        }
        setBonus((b) => [...b, word]);
        play("place");
        runFeedback("flash", ids);
        return;
      }

      play("bad");
      runFeedback("shake", ids);
    },
    [
      selected,
      letters,
      target,
      solved,
      bonus,
      lang,
      runFeedback,
      flyIntoBoard,
      complete,
    ],
  );

  const useHint = useCallback(() => {
    if (!board || hintsLeft <= 0) return;
    const missing = target.filter((w) => !solved.includes(w));
    if (missing.length === 0) return;
    const word = [...missing].sort((a, b) => a.length - b.length)[0]!;
    setSolved((s) => [...s, word]);
    setHintsUsed((n) => n + 1);
    play("good");
    if (solved.length + 1 === target.length) complete(target.length);
  }, [board, hintsLeft, target, solved, complete]);

  if (failed) return <PuzzleError onRetry={() => window.location.reload()} />;
  if (!board) return <Loading />;

  const cells = layout(board.words);
  const solvedCells = layout(board.words.filter((w) => solved.includes(w.word)));
  const gridW = board.width * cellPx + (board.width - 1) * 4;

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
            {t(GAMES.loop.nameKey)}
          </h1>
          <p className="truncate text-xs text-[var(--muted)]">
            {t("levelN", { n: level })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            {t("wordsOfTotal", { n: solved.length, m: target.length })}
          </span>
          {bonus.length > 0 ? (
            <span
              className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold"
              style={{ background: "var(--raised)", color: "var(--ink)" }}
            >
              {t("bonusN", { n: bonus.length })}
            </span>
          ) : null}
        </div>

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

      {/* Crossword ------------------------------------------------------- */}
      <div ref={boardRef} className="grid min-h-0 flex-1 place-items-center py-1">
        <div
          className="grid"
          style={{
            width: gridW,
            gridTemplateColumns: `repeat(${board.width}, 1fr)`,
            gap: 4,
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
                ref={(el) => {
                  if (el) cellRefs.current.set(k, el);
                  else cellRefs.current.delete(k);
                }}
                className="grid aspect-square place-items-center rounded-[3px]"
                style={{
                  background: shown ? "var(--ink)" : "var(--raised)",
                  color: shown ? "var(--paper)" : "transparent",
                  fontWeight: 700,
                  fontSize: Math.round(cellPx * 0.52),
                  lineHeight: 1,
                  textTransform: "uppercase",
                }}
              >
                {shown ?? letter}
              </div>
            );
          })}
        </div>
      </div>

      {/* The word being formed, slot always reserved ---------------------- */}
      <div className="flex h-[42px] shrink-0 items-center justify-center">
        {currentWord.length === 0 ? (
          <span className="text-sm text-[var(--muted)]">{t("dragToForm")}</span>
        ) : (
          <span className="font-display text-[1.5rem] leading-none font-bold tracking-[0.16em] uppercase">
            {currentWord}
          </span>
        )}
      </div>

      {/* Wheel ----------------------------------------------------------- */}
      <div className="w-full shrink-0">
        <WheelSvg
          svgRef={svgRef}
          letters={letters}
          slotOf={slotOf}
          selected={selected}
          onSelectionChange={setSelected}
          onRelease={release}
          feedback={feedback}
          trail={trail}
        />
      </div>

      {/* Controls, always below the wheel --------------------------------- */}
      <div className="flex shrink-0 items-center justify-center gap-3 pt-2">
        {cfg.hints > 0 ? (
          <button
            type="button"
            className="tap rounded-full px-5 text-sm font-semibold disabled:opacity-40"
            style={{
              height: 48,
              border: "1px solid var(--line)",
              color: hintsLeft > 0 ? "var(--ink)" : "var(--muted)",
            }}
            onClick={useHint}
            disabled={hintsLeft <= 0}
          >
            {hintsLeft > 0 ? `${t("hint")} · ${hintsLeft}` : t("noHintsLeft")}
          </button>
        ) : null}

        <button
          type="button"
          className="tap rounded-full px-5 text-sm font-semibold"
          style={{ height: 48, border: "1px solid var(--line)" }}
          onClick={() => {
            setSlotOf((s) => shuffle([...s], mulberry32(randomSeed())));
            setSelected([]);
            play("tap");
          }}
        >
          {t("shuffle")}
        </button>
      </div>

      {/* Letters in flight ------------------------------------------------
          Rendered at the wheel for one frame, then moved to the slot, so the
          transition has somewhere to travel from. */}
      {flying.map((f) => {
        const at = flyPhase === "start" ? f.from : f.to;
        return (
          <span
            key={f.id}
            className="pointer-events-none fixed top-0 left-0 z-40 font-bold uppercase"
            style={{
              transform: `translate3d(${at.x}px, ${at.y}px, 0) translate(-50%, -50%)`,
              transition:
                flyPhase === "start"
                  ? "none"
                  : `transform ${FLY_MS}ms var(--ease-soft)`,
              color: "var(--ink)",
              fontSize: 20,
            }}
            aria-hidden
          >
            {f.letter}
          </span>
        );
      })}

      {/* One time tap hint ------------------------------------------------ */}
      <Sheet
        open={tapHint}
        onClose={() => setTapHint(false)}
        title={t(GAMES.loop.nameKey)}
      >
        <p className="pb-4 text-sm text-[var(--muted)]">{t("tapHint")}</p>
        <div className="pb-2">
          <SheetButton
            variant="loud"
            onClick={() => {
              setTapHint(false);
              try {
                window.localStorage.setItem(TAP_HINT_KEY, "1");
              } catch {
                // ignore
              }
            }}
          >
            {t("gotIt")}
          </SheetButton>
        </div>
      </Sheet>

      {/* Overflow menu ---------------------------------------------------- */}
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
