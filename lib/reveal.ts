/**
 * The reveal cascade.
 *
 * The flip is the most satisfying moment in the game, so it is specified here
 * rather than left to whatever each board happens to pass. These numbers are
 * mirrored as CSS custom properties in globals.css; this module is the source
 * of truth for the JavaScript side, and is pure so the timing can be tested.
 */

/** One tile's rotation. Colour swaps at the halfway point. */
export const FLIP_MS = 220;

/** Delay added per column, so a row reveals left to right. */
export const STAGGER_MS = 160;

/** Reduced motion swaps the flip for a plain crossfade. */
export const FADE_MS = 120;

/** The winning row's landing bounce. */
export const SETTLE_MS = 320;

export interface RevealTiming {
  /** Length of one tile's reveal. */
  flipMs: number;
  /** Delay per column. Zero when motion is reduced. */
  staggerMs: number;
  /** True when the tile should rotate rather than crossfade. */
  flip: boolean;
  /** True when a win may bounce the winning row. */
  settle: boolean;
  /** Delay before column `index` starts. */
  delayFor: (index: number) => number;
  /** How long a whole row of `columns` takes, end to end. */
  rowMs: (columns: number) => number;
}

/**
 * Timing for the current motion preference.
 *
 * Reduced motion is not merely a shorter flip: there is no rotation, no
 * stagger and no bounce, and the colour arrives in a single short fade. A
 * staggered cascade is exactly the kind of sweeping movement the preference
 * exists to remove, so shortening it would miss the point.
 */
export function revealTiming(reducedMotion: boolean): RevealTiming {
  const flipMs = reducedMotion ? FADE_MS : FLIP_MS;
  const staggerMs = reducedMotion ? 0 : STAGGER_MS;
  return {
    flipMs,
    staggerMs,
    flip: !reducedMotion,
    settle: !reducedMotion,
    delayFor: (index) => Math.max(0, index) * staggerMs,
    // The keyboard may only recolour once the last tile has finished, so the
    // board never disagrees with the keys about what is known.
    rowMs: (columns) => Math.max(0, columns - 1) * staggerMs + flipMs,
  };
}
