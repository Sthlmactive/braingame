/**
 * Picker geometry.
 *
 * The difficulty cards once shipped a preview 236px wide, which fitted a
 * 320pt screen by 28px — and did not fit the phone it was actually looked at
 * on. The widths were spread across two route files as bare literals, so
 * nothing could check them.
 *
 * They live here instead, and `test/picker-layout.test.ts` walks every
 * viewport we support and asserts each fixed-width element still fits inside
 * the card. Same reasoning as lib/reveal.ts: pure numbers, so they can be
 * tested rather than eyeballed.
 *
 * These mirror CSS. If a padding changes in the component, change it here.
 */

/** `.safe-x` — `max(env(safe-area-inset-*), 16px)`, so 16 in portrait. */
export const SAFE_X_PX = 16;

/** The `max-w-[560px]` on every `Screen`. */
export const SCREEN_MAX_PX = 560;

/** The card's `px-4`. */
export const CARD_PAD_X_PX = 16;

/** `--gap-tile`. */
export const TILE_GAP_PX = 4;

/** Five's preview tile. A supporting detail, not the headline. */
export const PICKER_TILE_PX = 15;

/** Mini's preview cell, and the hairline gap between cells. */
export const PICKER_CELL_PX = 8;
export const PICKER_CELL_GAP_PX = 1;

/** Usable width inside a card, at a given viewport width. */
export function cardContentWidth(viewport: number): number {
  return Math.min(viewport, SCREEN_MAX_PX) - 2 * SAFE_X_PX - 2 * CARD_PAD_X_PX;
}

/** How wide a row of `letters` empty tiles renders. */
export function fivePreviewWidth(letters: number): number {
  return letters * PICKER_TILE_PX + Math.max(0, letters - 1) * TILE_GAP_PX;
}

/** How wide (and tall) a `size` x `size` grid preview renders. */
export function miniPreviewWidth(size: number): number {
  return size * PICKER_CELL_PX + Math.max(0, size - 1) * PICKER_CELL_GAP_PX;
}
