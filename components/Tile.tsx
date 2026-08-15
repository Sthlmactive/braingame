"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { FLIP_MS, SETTLE_MS } from "@/lib/reveal";

/**
 * The five variants the redesigned screens use, plus the legacy names the six
 * unmigrated games still pass. `filled`/`correct`/`present`/`absent` are the
 * old spellings of `typed`/`hit`/`near`/`miss` and render identically.
 */
export type TileState =
  | "empty" // no letter yet
  | "typed" // letter typed, not judged
  | "hit" // right letter, right place
  | "near" // in the word, wrong place
  | "miss" // not in the word
  | "black" // a crossword's black square: not a cell, no letter, no press
  // Legacy, still used by Hive, Grid, Loop, Ordoku, Rush and Tiles.
  | "filled"
  | "correct"
  | "present"
  | "absent"
  | "accent"
  | "locked"
  | "muted";

export type TileSize = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<TileSize, number> = { xs: 30, sm: 38, md: 52, lg: 62 };
const FONT_EM: Record<TileSize, string> = {
  xs: "0.95rem",
  sm: "1.15rem",
  md: "1.6rem",
  lg: "1.95rem",
};

interface Palette {
  bg: string;
  fg: string;
  border: string;
}

const EMPTY: Palette = {
  bg: "transparent",
  fg: "var(--ink)",
  border: "var(--line)",
};
const TYPED: Palette = {
  bg: "var(--paper)",
  fg: "var(--ink)",
  border: "var(--ink)",
};
const HIT: Palette = {
  bg: "var(--hit)",
  fg: "var(--on-state)",
  border: "var(--hit)",
};
const NEAR: Palette = {
  bg: "var(--near)",
  fg: "var(--on-state)",
  border: "var(--near)",
};
// `miss` is a light neutral, so white on it is only 3.4:1. Ink is 5.2:1 and
// still reads as spent. See docs/design.md.
const MISS: Palette = {
  bg: "var(--miss)",
  fg: "var(--on-miss)",
  border: "var(--miss)",
};

/** A black square is chrome, not state: it is the grid's own ink. */
const BLACK: Palette = {
  bg: "var(--ink)",
  fg: "var(--ink)",
  border: "var(--ink)",
};

const PALETTES: Record<TileState, Palette> = {
  empty: EMPTY,
  typed: TYPED,
  hit: HIT,
  near: NEAR,
  miss: MISS,
  black: BLACK,
  filled: TYPED,
  correct: HIT,
  present: NEAR,
  absent: MISS,
  accent: { bg: "var(--accent)", fg: "var(--on-state)", border: "var(--accent)" },
  locked: { bg: "var(--raised)", fg: "var(--muted)", border: "var(--line)" },
  muted: { bg: "transparent", fg: "var(--muted)", border: "var(--line)" },
};

export interface TileProps {
  letter?: string;
  state?: TileState;
  size?: TileSize;
  /** Exact pixel size, overriding `size`. Used by boards that must fit a width. */
  px?: number;
  /** Flip reveal. The colour swaps at the halfway point of the rotation. */
  flip?: boolean;
  /** Delay in ms before the flip starts, for staggered row reveals. */
  flipDelay?: number;
  /**
   * Length of one flip. Defaults to the full cascade timing; pass the reduced
   * motion value to swap the rotation for a plain crossfade.
   */
  flipMs?: number;
  /** Bounce as it lands. Fired once per change of the value passed. */
  settleKey?: string | number;
  onPress?: () => void;
  disabled?: boolean;
  label?: string;
  /** Small superscript, used for letter values on the Scrabble board. */
  badge?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Rendered under the letter, e.g. a premium square label. */
  sub?: ReactNode;
  selected?: boolean;
  /** Marks a cell the player is currently pointing at during a drag. */
  target?: boolean;
  /**
   * Crossword highlighting, in neutrals only. Nothing on a Mini board reports
   * a result mid solve, so neither of these may use a state colour: `entry`
   * tints every cell of the entry being typed, `cell` tints the one cell the
   * cursor is in, more strongly.
   */
  activeEntry?: boolean;
  activeCell?: boolean;
  /** The small clue number a crossword prints in the corner of a cell. */
  corner?: ReactNode;
}

/**
 * The one tile used by all seven games. It owns the press, flip and settle
 * feel so every board inherits the same physicality.
 */
export const Tile = forwardRef<HTMLDivElement, TileProps>(function Tile(
  {
    letter,
    state = "empty",
    size = "md",
    px,
    flip = false,
    flipDelay = 0,
    flipMs = FLIP_MS,
    settleKey,
    onPress,
    disabled = false,
    label,
    badge,
    className = "",
    style,
    sub,
    selected = false,
    target = false,
    activeEntry = false,
    activeCell = false,
    corner,
  },
  ref,
) {
  const [pressed, setPressed] = useState(false);
  const [settling, setSettling] = useState(false);
  // During a flip the tile shows its previous palette until the halfway point.
  const [shown, setShown] = useState(state);
  const prevSettle = useRef(settleKey);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // Flip: hold the old colour, swap it at 50% of the rotation.
  const [flipping, setFlipping] = useState(false);
  const prevState = useRef(state);
  useEffect(() => {
    if (!flip || state === prevState.current) {
      prevState.current = state;
      setShown(state);
      return;
    }
    prevState.current = state;
    setFlipping(false);
    const start = window.setTimeout(() => {
      setFlipping(true);
      // The colour swaps at the halfway point, while the tile is edge on.
      const mid = window.setTimeout(() => setShown(state), flipMs / 2);
      const end = window.setTimeout(() => setFlipping(false), flipMs);
      timers.current.push(mid, end);
    }, flipDelay);
    timers.current.push(start);
  }, [state, flip, flipDelay, flipMs]);

  // Settle bounce whenever the caller bumps settleKey.
  useEffect(() => {
    if (settleKey === undefined || settleKey === prevSettle.current) return;
    prevSettle.current = settleKey;
    setSettling(true);
    const id = window.setTimeout(() => setSettling(false), SETTLE_MS);
    timers.current.push(id);
  }, [settleKey]);

  const interactive = Boolean(onPress) && !disabled;

  const down = (e: ReactPointerEvent) => {
    if (!interactive) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPressed(true);
  };
  const up = () => {
    if (!interactive) return;
    setPressed(false);
  };
  const activate = () => {
    if (!interactive) return;
    onPress?.();
  };

  const side = px ?? SIZE_PX[size];
  const pal = PALETTES[shown];

  // Neutral tints. Mixed from --ink so they track the theme in both modes,
  // and deliberately not --hit/--near: colour only ever means game state.
  const highlight = activeCell
    ? "color-mix(in srgb, var(--ink) 16%, var(--paper))"
    : activeEntry
      ? "color-mix(in srgb, var(--ink) 7%, var(--paper))"
      : null;

  const styles: CSSProperties = {
    width: side,
    height: side,
      fontSize: px ? `${Math.round(px * 0.44)}px` : FONT_EM[size],
    backgroundColor: highlight ?? pal.bg,
    color: pal.fg,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: selected || target ? "var(--ink)" : pal.border,
    boxShadow: selected ? "0 0 0 2px var(--ink) inset" : undefined,
    animationDuration: flipping ? `${flipMs}ms` : undefined,
    cursor: interactive ? "pointer" : undefined,
    ...style,
  };

  const Component = interactive ? "button" : "div";

  return (
    <Component
      // The ref is only ever read for measurement, so a loose cast is fine.
      ref={ref as never}
      type={interactive ? "button" : undefined}
      className={`tile ${className}`}
      style={styles}
      data-pressed={pressed || undefined}
      data-flip={flipping || undefined}
      data-settle={settling || undefined}
      data-state={shown}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
      onClick={activate}
      disabled={interactive ? disabled : undefined}
      aria-label={label ?? letter}
      aria-disabled={disabled || undefined}
    >
      {corner != null ? (
        <span
          className="absolute top-[2px] left-[3px] font-medium leading-none opacity-70"
          style={{ fontSize: Math.max(8, Math.round(side * 0.26)) }}
        >
          {corner}
        </span>
      ) : null}
      {letter ? <span className="tile-glyph">{letter}</span> : null}
      {badge != null ? (
        <span
          className="absolute right-[3px] bottom-[1px] font-normal leading-none opacity-70"
          style={{ fontSize: Math.max(8, Math.round(side * 0.2)) }}
        >
          {badge}
        </span>
      ) : null}
      {sub != null && !letter ? (
        <span
          className="absolute inset-0 grid place-items-center font-medium tracking-tight opacity-60"
          style={{ fontSize: Math.max(7, Math.round(side * 0.2)) }}
        >
          {sub}
        </span>
      ) : null}
    </Component>
  );
});
