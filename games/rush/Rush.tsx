"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tile } from "@/components/Tile";
import type { GameProps } from "@/components/GameShell";
import { useApp } from "@/components/AppProvider";
import { isValidWord } from "@/lib/dictionary";
import { rushConfig } from "@/lib/levels";
import { formatTime } from "@/lib/i18n";
import { mulberry32, randomSeed } from "@/lib/rng";
import { play } from "@/lib/sound";
import { useCountdown } from "@/lib/useCountdown";
import { cellKey, drawTiles, scoreRush, validate, type Cells } from "./engine";

const BOARD = 11; // columns and rows on the play area

interface TileItem {
  id: number;
  letter: string;
  /** null while the tile is still in the tray. */
  at: string | null;
}

export function Rush({ lang, level, onFinish, setStatus, onGiveUp }: GameProps) {
  const { t } = useApp();
  const cfg = useMemo(() => rushConfig(level), [level]);
  const rng = useRef(mulberry32(randomSeed()));

  const [tiles, setTiles] = useState<TileItem[]>(() =>
    drawTiles(lang, cfg.tiles, cfg.vowelBias, rng.current).map((letter, id) => ({
      id,
      letter,
      at: null,
    })),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const nextId = useRef(cfg.tiles);

  const cells = useMemo<Cells>(() => {
    const m: Cells = new Map();
    for (const tile of tiles) if (tile.at) m.set(tile.at, tile.letter);
    return m;
  }, [tiles]);

  const check = useCallback(
    () => validate(cells, tiles.length, (w) => isValidWord(w, lang)),
    [cells, tiles.length, lang],
  );

  const finish = useCallback(
    (reason: "solved" | "timeUp" | "notCleared") => {
      const v = check();
      const timeMs = Date.now() - startedAt.current;
      onFinish({
        cleared: v.ok,
        score: scoreRush({
          solved: v.ok,
          tiles: tiles.length,
          timeMs,
          placed: cells.size,
        }),
        timeMs,
        reason: v.ok ? "solved" : reason,
        note: v.ok
          ? undefined
          : !v.allPlaced
            ? t("useAllTiles")
            : !v.connected
              ? t("notConnected")
              : v.invalidRuns.length > 0
                ? t("tilesInvalid", { n: v.invalidRuns.length })
                : undefined,
      });
    },
    [check, tiles.length, cells.size, onFinish, t],
  );

  const remaining = useCountdown(cfg.seconds, () => finish("timeUp"));

  useEffect(() => {
    onGiveUp(() => {
      const timeMs = Date.now() - startedAt.current;
      return {
        cleared: false,
        score: scoreRush({
          solved: false,
          tiles: tiles.length,
          timeMs,
          placed: cells.size,
        }),
        timeMs,
        reason: "gaveUp",
      };
    });
  }, [onGiveUp, tiles.length, cells.size]);

  // Levels 7 and up drop a new tile into the tray every 45 seconds.
  useEffect(() => {
    if (cfg.peelEvery <= 0) return;
    const id = window.setInterval(() => {
      const letter = drawTiles(lang, 1, cfg.vowelBias, rng.current)[0]!;
      setTiles((prev) => [
        ...prev,
        { id: nextId.current++, letter, at: null },
      ]);
      play("place");
      setMessage(t("newTile"));
      window.setTimeout(() => setMessage(null), 1200);
    }, cfg.peelEvery * 1000);
    return () => window.clearInterval(id);
  }, [cfg.peelEvery, cfg.vowelBias, lang, t]);

  const tray = tiles.filter((tile) => tile.at === null);
  const validation = check();

  useEffect(() => {
    setStatus(
      <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
        {cfg.seconds > 0 ? (
          <span
            className="font-display font-bold"
            style={{ color: remaining <= 30 ? "var(--danger)" : undefined }}
          >
            {formatTime(remaining * 1000)}
          </span>
        ) : null}
        <span>{t("tilesLeft", { n: tray.length })}</span>
      </span>,
    );
  }, [cfg.seconds, remaining, tray.length, setStatus, t]);

  /** Tap a tile, then tap a cell. The fallback that always works on a phone. */
  const tapCell = useCallback(
    (x: number, y: number) => {
      const key = cellKey(x, y);
      const occupant = tiles.find((tile) => tile.at === key);

      if (selected === null) {
        // Tapping a placed tile lifts it back to the tray.
        if (occupant) {
          setTiles((prev) =>
            prev.map((tile) =>
              tile.id === occupant.id ? { ...tile, at: null } : tile,
            ),
          );
          play("tap");
        }
        return;
      }
      if (occupant) return;
      setTiles((prev) =>
        prev.map((tile) => (tile.id === selected ? { ...tile, at: key } : tile)),
      );
      setSelected(null);
      play("place");
    },
    [selected, tiles],
  );

  // Drag and drop, driven by pointer events so touch and mouse behave alike.
  // The tap-a-tile-then-tap-a-cell path above stays as the fallback.
  const [drag, setDrag] = useState<{
    id: number;
    letter: string;
    x: number;
    y: number;
  } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const startDrag = useCallback(
    (tile: TileItem, e: React.PointerEvent) => {
      setSelected(null);
      setDrag({ id: tile.id, letter: tile.letter, x: e.clientX, y: e.clientY });
      play("tap");
    },
    [],
  );

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    };
    const up = (e: PointerEvent) => {
      const current = dragRef.current;
      setDrag(null);
      if (!current) return;
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-cell]");
      const key = el?.getAttribute("data-cell");
      if (!key) return;
      // Never drop onto an occupied cell.
      if (tiles.some((tile) => tile.at === key && tile.id !== current.id)) return;
      setTiles((prev) =>
        prev.map((tile) => (tile.id === current.id ? { ...tile, at: key } : tile)),
      );
      play("place");
    };
    const cancel = () => setDrag(null);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [drag, tiles]);

  const invalidCells = useMemo(() => {
    const bad = new Set<string>();
    for (const r of validation.invalidRuns) for (const k of r.cells) bad.add(k);
    for (const k of validation.strayCells) bad.add(k);
    return bad;
  }, [validation]);

  const cellPx = Math.floor(Math.min(30, 340 / BOARD));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex flex-1 items-center justify-center overflow-auto">
        {message ? (
          <div
            className="fade-enter absolute top-1 z-10 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
            role="status"
          >
            {message}
          </div>
        ) : null}

        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${BOARD}, ${cellPx}px)`,
            gap: 1,
          }}
        >
          {Array.from({ length: BOARD * BOARD }, (_, i) => {
            const x = i % BOARD;
            const y = Math.floor(i / BOARD);
            const key = cellKey(x, y);
            const letter = cells.get(key);
            const bad = letter !== undefined && invalidCells.has(key);
            return (
              <button
                key={i}
                type="button"
                className="tile"
                data-cell={key}
                style={{
                  width: cellPx,
                  height: cellPx,
                  fontSize: Math.round(cellPx * 0.5),
                  borderRadius: 4,
                  border: `1px solid ${
                    letter ? (bad ? "var(--danger)" : "var(--ink)") : "var(--line)"
                  }`,
                  background: letter
                    ? bad
                      ? "color-mix(in srgb, var(--danger) 22%, transparent)"
                      : "var(--raised)"
                    : "transparent",
                  color: bad ? "var(--danger)" : "var(--ink)",
                  textDecoration: bad ? "line-through" : undefined,
                  textDecorationThickness: bad ? 2 : undefined,
                  opacity: letter ? 1 : selected !== null ? 0.9 : 0.35,
                }}
                onClick={() => tapCell(x, y)}
                aria-label={letter ?? `${x + 1},${y + 1}`}
              >
                <span className="tile-glyph">{letter ?? ""}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2">
        <div className="no-scrollbar flex flex-wrap justify-center gap-1.5 pb-2">
          {tray.map((tile) => (
            <div
              key={tile.id}
              onPointerDown={(e) => startDrag(tile, e)}
              style={{ opacity: drag?.id === tile.id ? 0.25 : 1 }}
            >
              <Tile
                letter={tile.letter}
                size="sm"
                state={selected === tile.id ? "accent" : "filled"}
                selected={selected === tile.id}
                onPress={() => {
                  play("tap");
                  setSelected((s) => (s === tile.id ? null : tile.id));
                }}
              />
            </div>
          ))}
          {tray.length === 0 ? (
            <span className="py-2 text-xs text-[var(--muted)]">
              {validation.ok ? t("solved") : (validation.connected ? "" : t("notConnected"))}
            </span>
          ) : null}
        </div>

        <div className="flex gap-2 pb-2">
          <button
            type="button"
            className="tap flex-1 rounded-xl py-3 text-sm font-semibold"
            style={{ border: "1px solid var(--line)" }}
            onClick={() => {
              setTiles((prev) => prev.map((tile) => ({ ...tile, at: null })));
              setSelected(null);
              play("tap");
            }}
          >
            {t("recall")}
          </button>
          <button
            type="button"
            className="tap flex-1 rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
            onClick={() => finish("notCleared")}
            disabled={cells.size === 0}
          >
            {t("submit")}
          </button>
        </div>
      </div>

      {drag ? (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: drag.x,
            top: drag.y,
            transform: "translate(-50%, -50%) scale(1.15)",
          }}
          aria-hidden
        >
          <Tile letter={drag.letter} size="sm" state="accent" />
        </div>
      ) : null}
    </div>
  );
}
