import { describe, expect, it } from "vitest";
import {
  CARD_PAD_X_PX,
  PICKER_CELL_PX,
  PICKER_TILE_PX,
  SAFE_X_PX,
  cardContentWidth,
  fivePreviewWidth,
  miniPreviewWidth,
} from "@/lib/picker";
import { DIFFICULTIES, DIFFICULTY_LENGTH, type Difficulty } from "@/lib/difficulty";
import { MINI_SIZE } from "@/lib/mini";
import { LANGS, translator, type StringKey } from "@/lib/i18n";

const MINI_DESC_KEY: Record<Difficulty, StringKey> = {
  easy: "miniDiffEasyDesc",
  medium: "miniDiffMediumDesc",
  hard: "miniDiffHardDesc",
  extreme: "miniDiffExtremeDesc",
};

/**
 * The picker cards, measured.
 *
 * A card that renders one pixel wider than the viewport is clipped at the
 * right edge, and nothing in the type system or the test suite noticed the
 * last time it happened. Every fixed-width thing inside a card is checked
 * here against the narrowest screen we support.
 *
 * This tests the *intrinsic* widths — the ones that cannot shrink. Text can
 * wrap and does not appear below; a preview cannot, which is why it is the
 * thing that overflows.
 */

/** The three widths this app is designed against, narrowest first. */
const VIEWPORTS = [320, 375, 430] as const;

describe("difficulty card geometry", () => {
  it.each(VIEWPORTS)("Five's tile preview fits at %ipt", (viewport) => {
    const room = cardContentWidth(viewport);
    for (const d of DIFFICULTIES) {
      const width = fivePreviewWidth(DIFFICULTY_LENGTH[d]);
      expect(
        width,
        `${d}: ${DIFFICULTY_LENGTH[d]} tiles is ${width}px in ${room}px`,
      ).toBeLessThanOrEqual(room);
    }
  });

  it.each(VIEWPORTS)("Mini's grid preview fits at %ipt", (viewport) => {
    const room = cardContentWidth(viewport);
    for (const d of DIFFICULTIES) {
      const width = miniPreviewWidth(MINI_SIZE[d]);
      expect(
        width,
        `${d}: ${MINI_SIZE[d]}x${MINI_SIZE[d]} is ${width}px in ${room}px`,
      ).toBeLessThanOrEqual(room);
    }
  });

  it("leaves the narrowest screen real slack, not a rounding error", () => {
    const room = cardContentWidth(320);
    const widest = Math.max(
      ...DIFFICULTIES.map((d) => fivePreviewWidth(DIFFICULTY_LENGTH[d])),
      ...DIFFICULTIES.map((d) => miniPreviewWidth(MINI_SIZE[d])),
    );
    // The version that shipped clipped had 28px of slack here and still
    // overflowed on a real phone, so "it fits" is not the bar. Half the card.
    expect(widest, `widest preview ${widest}px in ${room}px`).toBeLessThan(
      room / 2,
    );
  });

  it("keeps the preview a supporting detail rather than the headline", () => {
    // 24px name against 15px tiles. If the tile ever grows past the name it
    // has stopped supporting it and started competing with it.
    expect(PICKER_TILE_PX).toBeLessThan(24);
    expect(PICKER_CELL_PX).toBeLessThan(PICKER_TILE_PX);
  });

  /**
   * Mini's descriptions have to hold one line at 320pt, because Mini's card
   * carries a 44px grid preview and a second line of text pushes four of them
   * past a 568pt screen. The budget is in characters rather than pixels: text
   * measurement needs the font, and a pessimistic 7px per character at 13px
   * puts 32 characters at 224px inside a 256px card.
   *
   * The rule this encodes is not really about width. A picker card exists to
   * let you choose; "5x5, varje bokstav kontrolleras två gånger" was teaching
   * the mechanic, which belongs in the how-to-play sheet.
   */
  it("keeps Mini's descriptions to one line at the narrowest screen", () => {
    const BUDGET = 32;
    for (const lang of LANGS) {
      const t = translator(lang);
      for (const d of DIFFICULTIES) {
        const text = t(MINI_DESC_KEY[d]);
        expect(
          text.length,
          `${lang} ${d}: "${text}" is ${text.length} chars`,
        ).toBeLessThanOrEqual(BUDGET);
      }
    }
  });

  it("computes the card box from the real insets", () => {
    // 320 - 32 safe area - 32 card padding.
    expect(cardContentWidth(320)).toBe(320 - 2 * SAFE_X_PX - 2 * CARD_PAD_X_PX);
    expect(cardContentWidth(320)).toBe(256);
    // Capped by the screen's max width, so a tablet does not get a 900px card.
    expect(cardContentWidth(1200)).toBe(cardContentWidth(560));
  });
});
