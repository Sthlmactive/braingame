/**
 * Loop's wheel: geometry and selection, with no React and no DOM, so the two
 * things that decide whether the drag feels right can be tested directly.
 */

export const WHEEL_VIEW = 320;
export const WHEEL_CENTRE = 160;
export const HUB_RADIUS = 96;
export const ORBIT_RADIUS = 110;

/** How forgiving the hit test is, as a multiple of the letter radius. */
export const HIT_TOLERANCE = 1.15;

export interface WheelSlot {
  index: number;
  cx: number;
  cy: number;
}

/**
 * Letters shrink as the wheel fills up so the ring never overlaps itself.
 * The largest case, 34 at the 110 orbit, reaches 304 of the 320 viewBox, so
 * nothing is ever clipped.
 */
export function letterRadius(n: number): number {
  if (n <= 5) return 34;
  if (n === 6) return 32;
  if (n === 7) return 30;
  return 28;
}

/** Evenly spaced around the orbit, starting at the top and going clockwise. */
export function wheelSlots(n: number): WheelSlot[] {
  const out: WheelSlot[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    out.push({
      index: i,
      cx: WHEEL_CENTRE + ORBIT_RADIUS * Math.cos(a),
      cy: WHEEL_CENTRE + ORBIT_RADIUS * Math.sin(a),
    });
  }
  return out;
}

/**
 * Which letter, if any, the pointer is over. Distance based rather than
 * relying on pointerenter, because capturing the pointer on the wheel stops
 * enter and over ever firing on the children.
 */
export function hitTest(
  x: number,
  y: number,
  slots: readonly WheelSlot[],
  radius: number,
): number | null {
  const limit = radius * HIT_TOLERANCE;
  let best: number | null = null;
  let bestDist = Infinity;
  for (const slot of slots) {
    const d = Math.hypot(x - slot.cx, y - slot.cy);
    if (d <= limit && d < bestDist) {
      bestDist = d;
      best = slot.index;
    }
  }
  return best;
}

/**
 * Fold a hit into the current selection.
 *
 * Dragging back onto the letter before the last one undoes the last step, so
 * a mis-swipe is corrected by reversing along the trail rather than by lifting
 * and starting again. Any other letter already in the selection is ignored,
 * because a letter can only be used once.
 */
export function extendSelection(
  selected: readonly number[],
  hit: number | null,
): number[] {
  if (hit === null) return selected as number[];

  const last = selected[selected.length - 1];
  if (hit === last) return selected as number[];

  // Backtrack: the pointer has returned to the previous letter.
  if (selected.length >= 2 && hit === selected[selected.length - 2]) {
    return selected.slice(0, -1);
  }

  if (selected.includes(hit)) return selected as number[];
  return [...selected, hit];
}

/** The word a selection spells. */
export function selectionWord(
  selected: readonly number[],
  letters: readonly string[],
): string {
  return selected.map((i) => letters[i] ?? "").join("");
}

export const MIN_WORD = 3;

/** A selection shorter than this is dropped silently rather than rejected. */
export function isSubmittable(selected: readonly number[]): boolean {
  return selected.length >= MIN_WORD;
}
