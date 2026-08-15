/**
 * Picker geometry.
 *
 * The difficulty cards once shipped a preview 236px wide, which fitted a
 * 320pt screen by 28px — and looked wrong on the phone it was actually used
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

/**
 * Every viewport width the layout is checked against, narrowest first.
 *
 * The iPhone numbers were the only ones here for a while, which is how a
 * layout that had "passed" at 320, 375 and 430 still looked wrong on a
 * Samsung. 360 is the most common Android width in the world.
 */
export const VIEWPORTS = [320, 360, 375, 384, 393, 412, 430] as const;

/** `.safe-x` — `max(env(safe-area-inset-*), 16px)`, so 16 in portrait. */
export const SAFE_X_PX = 16;

/** The `max-w-[560px]` on every `Screen`. */
export const SCREEN_MAX_PX = 560;

/**
 * Card padding, all four sides. 16 put the name on the corner.
 *
 * It is one number rather than an x and a y because a card this size reads as
 * a panel, and a panel with different horizontal and vertical insets looks
 * like a mistake at 22px even when it was deliberate.
 */
export const CARD_PAD_PX = 22;

/** Between cards. */
export const CARD_GAP_PX = 10;

/** Inside a difficulty card: name to description, description to preview. */
export const NAME_GAP_PX = 8;
export const PREVIEW_GAP_PX = 16;

/**
 * A comfortable target. Not enforced in CSS — see the note in
 * `DifficultyPicker` on why the cards take their minimum from their content —
 * so the layout test asserts the content clears it instead.
 */
export const MIN_CARD_PX = 88;

/** `--gap-tile`. */
export const TILE_GAP_PX = 4;

/** Five's preview tile. A supporting detail, not the headline. */
export const PICKER_TILE_PX = 15;

/** Mini's preview cell, and the hairline gap between cells. */
export const PICKER_CELL_PX = 8;
export const PICKER_CELL_GAP_PX = 1;

/** Line box heights, mirroring the type scale in globals.css. */
export const LINE_OPTION_PX = 24 * 1.25;
export const LINE_BODY_PX = 13 * 1.45;

/** Usable width inside a card, at a given viewport width. */
export function cardContentWidth(viewport: number): number {
  return Math.min(viewport, SCREEN_MAX_PX) - 2 * SAFE_X_PX - 2 * CARD_PAD_PX;
}

/** How wide a row of `letters` empty tiles renders. */
export function fivePreviewWidth(letters: number): number {
  return letters * PICKER_TILE_PX + Math.max(0, letters - 1) * TILE_GAP_PX;
}

/** How wide (and tall) a `size` x `size` grid preview renders. */
export function miniPreviewWidth(size: number): number {
  return size * PICKER_CELL_PX + Math.max(0, size - 1) * PICKER_CELL_GAP_PX;
}

/**
 * A difficulty card's height at its natural size, padding included.
 *
 * An estimate, not a measurement — it assumes the CSS line boxes above. Good
 * enough for the one thing it is used for: checking the card clears the
 * comfortable-target floor.
 */
export function difficultyCardHeight(
  previewPx: number,
  descriptionLines = 1,
): number {
  return (
    2 * CARD_PAD_PX +
    LINE_OPTION_PX +
    NAME_GAP_PX +
    LINE_BODY_PX * descriptionLines +
    PREVIEW_GAP_PX +
    previewPx
  );
}
