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

export type TileState =
  | "empty" // no letter yet
  | "filled" // letter typed, not judged
  | "correct" // right letter, right place
  | "present" // right letter, wrong place
  | "absent" // not in the word
  | "accent" // lit with the game's accent
  | "locked" // fixed by the puzzle, not editable
  | "muted"; // present but de-emphasised

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

const PALETTES: Record<TileState, Palette> = {
  empty: { bg: "transparent", fg: "var(--text)", border: "var(--line)" },
  filled: { bg: "var(--surface)", fg: "var(--text)", border: "var(--muted)" },
  correct: { bg: "var(--correct)", fg: "var(--ink)", border: "var(--correct)" },
  present: { bg: "var(--present)", fg: "var(--ink)", border: "var(--present)" },
  absent: { bg: "var(--absent)", fg: "var(--muted)", border: "var(--absent)" },
  accent: { bg: "var(--accent)", fg: "var(--ink)", border: "var(--accent)" },
  locked: { bg: "var(--surface)", fg: "var(--muted)", border: "var(--line)" },
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
      const mid = window.setTimeout(() => setShown(state), 160);
      const end = window.setTimeout(() => setFlipping(false), 320);
      timers.current.push(mid, end);
    }, flipDelay);
    timers.current.push(start);
  }, [state, flip, flipDelay]);

  // Settle bounce whenever the caller bumps settleKey.
  useEffect(() => {
    if (settleKey === undefined || settleKey === prevSettle.current) return;
    prevSettle.current = settleKey;
    setSettling(true);
    const id = window.setTimeout(() => setSettling(false), 260);
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

  const styles: CSSProperties = {
    width: side,
    height: side,
    fontSize: px ? `${Math.round(px * 0.44)}px` : FONT_EM[size],
    backgroundColor: pal.bg,
    color: pal.fg,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: selected || target ? "var(--accent)" : pal.border,
    boxShadow: selected ? "0 0 0 2px var(--accent) inset" : undefined,
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
