"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tile } from "@/components/Tile";
import { Sheet } from "@/components/Sheet";
import type { GameProps } from "@/components/GameShell";
import { useApp } from "@/components/AppProvider";
import { ALPHABETS } from "@/lib/alphabet";
import { getLanguage } from "@/lib/dictionary";
import { tilesConfig } from "@/lib/levels";
import { formatTime } from "@/lib/i18n";
import { mulberry32, randomSeed, shuffle } from "@/lib/rng";
import { play } from "@/lib/sound";
import { useCountdown } from "@/lib/useCountdown";
import {
  BLANK,
  CENTRE,
  RACK_SIZE,
  SIZE,
  buildBag,
  letterValue,
  premiumAt,
} from "./board";
import {
  applyMove,
  chooseMove,
  colOf,
  emptyBlanks,
  emptyBoard,
  evaluatePlacement,
  generateMoves,
  rowOf,
  type Board,
  type BlankMask,
  type PlacedTile,
} from "./engine";

const PREMIUM_STYLE: Record<string, { bg: string; label: string }> = {
  d: { bg: "rgba(91,124,255,0.22)", label: "2L" },
  t: { bg: "rgba(63,187,209,0.24)", label: "3L" },
  D: { bg: "rgba(226,169,62,0.22)", label: "2W" },
  T: { bg: "rgba(242,102,75,0.26)", label: "3W" },
};

interface RackTile {
  id: number;
  letter: string;
}

export function Tiles({ lang, level, onFinish, setStatus, onGiveUp }: GameProps) {
  const { t } = useApp();
  const cfg = useMemo(() => tilesConfig(level), [level]);
  const dawg = useMemo(() => getLanguage(lang).dawg, [lang]);
  const rng = useRef(mulberry32(randomSeed()));

  const [board, setBoard] = useState<Board>(emptyBoard);
  const [blanks, setBlanks] = useState<BlankMask>(emptyBlanks);
  const [bag, setBag] = useState<string[]>(() =>
    shuffle(buildBag(lang), rng.current),
  );
  const [rack, setRack] = useState<RackTile[]>([]);
  const [pending, setPending] = useState<PlacedTile[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [scores, setScores] = useState({ you: 0, ai: 0 });
  const [turn, setTurn] = useState<"you" | "ai">("you");
  const [message, setMessage] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [passes, setPasses] = useState(0);
  const [aiRack, setAiRack] = useState<string[]>([]);
  const startedAt = useRef(Date.now());
  const nextId = useRef(0);
  const finishedRef = useRef(false);

  const hintsLeft = cfg.hints - hintsUsed;

  // Opening draw for both sides.
  useEffect(() => {
    setBag((current) => {
      const mine = current.slice(0, RACK_SIZE);
      const theirs = current.slice(RACK_SIZE, RACK_SIZE * 2);
      setRack(mine.map((letter) => ({ id: nextId.current++, letter })));
      setAiRack(theirs);
      return current.slice(RACK_SIZE * 2);
    });
  }, []);

  const flash = useCallback((msg: string) => {
    setMessage(msg);
    window.setTimeout(() => setMessage((m) => (m === msg ? null : m)), 2000);
  }, []);

  const endGame = useCallback(
    (reason: "solved" | "notCleared" | "timeUp") => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const won = scores.you > scores.ai;
      onFinish({
        cleared: won,
        score: scores.you,
        timeMs: Date.now() - startedAt.current,
        reason: won ? "solved" : reason,
        note: `${t("you")} ${scores.you} · ${t("opponent")} ${scores.ai}`,
      });
    },
    [scores, onFinish, t],
  );

  useEffect(() => {
    onGiveUp(() => ({
      cleared: false,
      score: scores.you,
      timeMs: Date.now() - startedAt.current,
      reason: "gaveUp",
      note: `${t("you")} ${scores.you} · ${t("opponent")} ${scores.ai}`,
    }));
  }, [onGiveUp, scores, t]);

  const boardWithPending = useMemo(() => {
    const next = board.slice();
    for (const p of pending) next[p.index] = p.letter;
    return next;
  }, [board, pending]);

  // --- the opponent -------------------------------------------------------
  const takeAiTurn = useCallback(() => {
    const moves = generateMoves(board, blanks, aiRack, lang, dawg, {
      maxWordLength: cfg.aiMaxWordLength,
      premiumWeight: cfg.aiPremiumWeight,
      budgetMs: 700,
    });
    const move = chooseMove(moves, cfg.aiSkill, rng.current);

    if (!move) {
      setPasses((p) => p + 1);
      flash(t("ordlekPassed"));
      setTurn("you");
      return;
    }

    const after = applyMove(board, blanks, move);
    setBoard(after.board);
    setBlanks(after.blanks);
    setScores((s) => ({ ...s, ai: s.ai + move.score }));
    setPasses(0);
    flash(t("ordlekPlayed", { w: move.word.toUpperCase(), n: move.score }));

    // Spend the tiles it used and refill from the bag.
    setAiRack((current) => {
      const left = [...current];
      for (const tile of move.tiles) {
        const want = tile.blank ? BLANK : tile.letter;
        const at = left.indexOf(want);
        if (at >= 0) left.splice(at, 1);
      }
      setBag((b) => {
        const need = RACK_SIZE - left.length;
        left.push(...b.slice(0, need));
        return b.slice(need);
      });
      return left;
    });
    setTurn("you");
  }, [board, blanks, aiRack, lang, dawg, cfg, flash, t]);

  useEffect(() => {
    if (turn !== "ai" || finishedRef.current) return;
    // A beat of thinking time, so the move does not appear instantly.
    const id = window.setTimeout(takeAiTurn, 550);
    return () => window.clearTimeout(id);
  }, [turn, takeAiTurn]);

  // --- turn timer ---------------------------------------------------------
  const onTurnTimeout = useCallback(() => {
    if (turn !== "you") return;
    setPending([]);
    setSelected(null);
    setPasses((p) => p + 1);
    setTurn("ai");
  }, [turn]);

  const turnRemaining = useCountdown(
    cfg.turnSeconds > 0 && turn === "you" ? cfg.turnSeconds : 0,
    onTurnTimeout,
  );

  useEffect(() => {
    setStatus(
      <span className="flex items-center gap-2 text-xs">
        <span style={{ color: "var(--text)" }}>{scores.you}</span>
        <span className="text-[var(--muted)]">·</span>
        <span className="text-[var(--muted)]">{scores.ai}</span>
        {cfg.turnSeconds > 0 && turn === "you" ? (
          <span
            className="font-display font-bold"
            style={{ color: turnRemaining <= 15 ? "var(--present)" : "var(--muted)" }}
          >
            {formatTime(turnRemaining * 1000)}
          </span>
        ) : null}
      </span>,
    );
  }, [scores, cfg.turnSeconds, turn, turnRemaining, setStatus]);

  // The game is over when the bag and a rack empty out, or both sides stall.
  useEffect(() => {
    if (finishedRef.current) return;
    if (passes >= 4) endGame("notCleared");
    else if (bag.length === 0 && (rack.length === 0 || aiRack.length === 0)) {
      endGame("notCleared");
    }
  }, [passes, bag.length, rack.length, aiRack.length, endGame]);

  // --- placing ------------------------------------------------------------
  const tapCell = useCallback(
    (index: number) => {
      if (turn !== "you") return;
      const already = pending.find((p) => p.index === index);
      if (already) {
        setPending((p) => p.filter((x) => x.index !== index));
        setRack((r) => [...r, { id: nextId.current++, letter: already.blank ? BLANK : already.letter }]);
        play("tap");
        return;
      }
      if (selected === null || board[index] !== null) return;
      const tile = rack.find((r) => r.id === selected);
      if (!tile) return;

      // A blank has to be told which letter it is. That happens in a sheet of
      // letter tiles, never a native prompt, so the iOS keyboard stays away.
      if (tile.letter === BLANK) {
        setBlankAt({ index, rackId: tile.id });
        return;
      }

      setPending((p) => [...p, { index, letter: tile.letter, blank: false }]);
      setRack((r) => r.filter((x) => x.id !== selected));
      setSelected(null);
      play("place");
    },
    [turn, pending, selected, board, rack],
  );

  const [blankAt, setBlankAt] = useState<{ index: number; rackId: number } | null>(
    null,
  );

  const assignBlank = useCallback(
    (letter: string) => {
      if (!blankAt) return;
      setPending((p) => [...p, { index: blankAt.index, letter, blank: true }]);
      setRack((r) => r.filter((x) => x.id !== blankAt.rackId));
      setSelected(null);
      setBlankAt(null);
      play("place");
    },
    [blankAt],
  );

  const recall = useCallback(() => {
    setRack((r) => [
      ...r,
      ...pending.map((p) => ({
        id: nextId.current++,
        letter: p.blank ? BLANK : p.letter,
      })),
    ]);
    setPending([]);
    setSelected(null);
    play("tap");
  }, [pending]);

  const submit = useCallback(() => {
    if (pending.length === 0) return;
    const res = evaluatePlacement(board, blanks, pending, lang, dawg);
    if (!res.ok || !res.move) {
      flash(
        res.error === "mustCoverCentre"
          ? t("mustCoverCentre")
          : res.error === "mustTouch"
            ? t("mustTouch")
            : res.error === "notInLine" || res.error === "notContiguous"
              ? t("invalidPlacement")
              : t("notAWord"),
      );
      play("bad");
      return;
    }

    const after = applyMove(board, blanks, res.move);
    setBoard(after.board);
    setBlanks(after.blanks);
    setScores((s) => ({ ...s, you: s.you + res.move!.score }));
    setPending([]);
    setPasses(0);
    play("good");

    setBag((b) => {
      const need = RACK_SIZE - rack.length;
      setRack((r) => [
        ...r,
        ...b.slice(0, need).map((letter) => ({ id: nextId.current++, letter })),
      ]);
      return b.slice(need);
    });
    setTurn("ai");
  }, [pending, board, blanks, lang, dawg, rack.length, flash, t]);

  const useHint = useCallback(() => {
    if (hintsLeft <= 0 || turn !== "you") return;
    const moves = generateMoves(
      board,
      blanks,
      rack.map((r) => r.letter),
      lang,
      dawg,
      { maxWordLength: 8, premiumWeight: 1, budgetMs: 700 },
    );
    setHintsUsed((n) => n + 1);
    if (moves.length === 0) {
      flash(t("pass"));
      return;
    }
    flash(moves[0]!.word.toUpperCase());
    play("good");
  }, [hintsLeft, turn, board, blanks, rack, lang, dawg, flash, t]);

  // --- pan and zoom -------------------------------------------------------
  // The board is 15 wide and an iPhone is not, so it opens zoomed to fit and
  // can be panned from there. Nothing here uses native pinch zoom, which would
  // break the fixed layout.
  const viewport = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoomed, setZoomed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panning = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = viewport.current;
      if (!el) return;
      setFitScale(Math.min(1, el.clientWidth / (SIZE * 30)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const scale = zoomed ? 1 : fitScale;

  useEffect(() => {
    if (!zoomed) setPan({ x: 0, y: 0 });
  }, [zoomed]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={viewport}
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (!zoomed) return;
          panning.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }}
        onPointerMove={(e) => {
          if (!panning.current) return;
          setPan({
            x: e.clientX - panning.current.x,
            y: e.clientY - panning.current.y,
          });
        }}
        onPointerUp={() => {
          panning.current = null;
        }}
        onPointerCancel={() => {
          panning.current = null;
        }}
      >
        {message ? (
          <div
            className="fade-enter absolute top-1 z-10 max-w-[92%] rounded-lg px-3 py-1.5 text-center text-xs font-semibold"
            style={{ background: "var(--text)", color: "var(--ink)" }}
            role="status"
          >
            {message}
          </div>
        ) : null}

        <div
          className="grid shrink-0"
          style={{
            gridTemplateColumns: `repeat(${SIZE}, 30px)`,
            gap: 1,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "center",
          }}
        >
          {Array.from({ length: SIZE * SIZE }, (_, i) => {
            const r = rowOf(i);
            const c = colOf(i);
            const letter = boardWithPending[i];
            const isPending = pending.some((p) => p.index === i);
            const prem = premiumAt(r, c);
            const style = PREMIUM_STYLE[prem];
            const isCentre = r === CENTRE && c === CENTRE;
            return (
              <button
                key={i}
                type="button"
                className="tile"
                style={{
                  width: 30,
                  height: 30,
                  fontSize: 15,
                  borderRadius: 3,
                  border: "none",
                  background: letter
                    ? isPending
                      ? "var(--accent)"
                      : "var(--surface)"
                    : (style?.bg ?? "rgba(255,255,255,0.04)"),
                  color: letter
                    ? isPending
                      ? "var(--ink)"
                      : "var(--text)"
                    : "var(--muted)",
                }}
                onClick={() => tapCell(i)}
                aria-label={letter ?? `${r + 1},${c + 1}`}
              >
                {letter ? (
                  <>
                    <span className="tile-glyph">{letter}</span>
                    <span
                      className="absolute right-[2px] bottom-0 leading-none opacity-70"
                      style={{ fontSize: 7 }}
                    >
                      {blanks[i] || pending.find((p) => p.index === i)?.blank
                        ? ""
                        : letterValue(letter, lang) || ""}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 7, letterSpacing: "0.02em" }}>
                    {isCentre ? "★" : (style?.label ?? "")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="tap absolute right-1 bottom-1 rounded-full px-3 py-2 text-[0.7rem] font-semibold"
          style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
          onClick={() => setZoomed((z) => !z)}
        >
          {zoomed ? t("zoomFit") : "1:1"}
        </button>
      </div>

      {/* The rack is docked above the safe area and never moves. */}
      <div className="safe-bottom shrink-0 pt-2">
        <div className="flex min-h-[46px] flex-wrap justify-center gap-1.5 pb-2">
          {rack.map((tile) => (
            <Tile
              key={tile.id}
              letter={tile.letter === BLANK ? " " : tile.letter}
              size="sm"
              state={selected === tile.id ? "accent" : "filled"}
              selected={selected === tile.id}
              badge={
                tile.letter === BLANK ? undefined : letterValue(tile.letter, lang) || undefined
              }
              onPress={() => {
                if (turn !== "you") return;
                play("tap");
                setSelected((s) => (s === tile.id ? null : tile.id));
              }}
              disabled={turn !== "you"}
            />
          ))}
        </div>

        <div className="flex gap-1.5">
          <SmallButton label={t("recall")} onPress={recall} disabled={pending.length === 0} />
          <SmallButton
            label={t("shuffle")}
            onPress={() => {
              setRack((r) => shuffle([...r], rng.current));
              play("tap");
            }}
          />
          {cfg.hints > 0 ? (
            <SmallButton
              label={hintsLeft > 0 ? `${t("hint")} ${hintsLeft}` : t("hint")}
              onPress={useHint}
              disabled={hintsLeft <= 0 || turn !== "you"}
            />
          ) : null}
          <SmallButton
            label={t("pass")}
            onPress={() => {
              recall();
              setPasses((p) => p + 1);
              setTurn("ai");
            }}
            disabled={turn !== "you"}
          />
          <SmallButton
            label={t("play")}
            onPress={submit}
            disabled={pending.length === 0 || turn !== "you"}
            loud
          />
        </div>

        <p className="pt-1.5 text-center text-[0.7rem] text-[var(--muted)]">
          {turn === "you" ? t("yourTurn") : t("ordleksTurn")} ·{" "}
          {t("tilesLeft", { n: bag.length })}
        </p>
      </div>

      <Sheet
        open={blankAt !== null}
        onClose={() => setBlankAt(null)}
        title={t("hint")}
      >
        <div className="flex flex-wrap justify-center gap-1.5 pb-4">
          {ALPHABETS[lang].map((letter) => (
            <Tile
              key={letter}
              letter={letter}
              size="sm"
              state="filled"
              onPress={() => assignBlank(letter)}
            />
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function SmallButton({
  label,
  onPress,
  disabled = false,
  loud = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loud?: boolean;
}) {
  return (
    <button
      type="button"
      className="tap flex-1 rounded-lg px-1 text-[0.7rem] font-semibold disabled:opacity-35"
      style={{
        background: loud ? "var(--accent)" : "transparent",
        color: loud ? "var(--ink)" : "var(--text)",
        border: loud ? "none" : "1px solid var(--line)",
      }}
      onClick={onPress}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
