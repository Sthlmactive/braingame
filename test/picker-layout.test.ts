import { describe, expect, it } from "vitest";
import {
  CARD_PAD_PX,
  MIN_CARD_PX,
  PICKER_CELL_PX,
  PICKER_TILE_PX,
  SAFE_X_PX,
  SCREEN_MAX_PX,
  VIEWPORTS,
  cardContentWidth,
  difficultyCardHeight,
  fivePreviewWidth,
  miniPreviewWidth,
} from "@/lib/picker";
import { DIFFICULTIES, DIFFICULTY_LENGTH, type Difficulty } from "@/lib/difficulty";
import { MINI_SIZE } from "@/lib/mini";
import { LANGS, translator, type StringKey } from "@/lib/i18n";

/**
 * The picker cards, measured.
 *
 * A card that renders one pixel wider than the viewport is clipped at the
 * right edge, and nothing in the type system or the test suite noticed the
 * last time it happened. Every fixed-width thing inside a card is checked
 * here against every screen we support.
 *
 * This tests the *intrinsic* widths — the ones that cannot shrink. Text wraps
 * and so does not appear below; a preview cannot, which is why it is the
 * thing that overflows.
 *
 * **There is deliberately no height assertion.** Whether four cards fit
 * without scrolling depends on the browser's dynamic viewport, which is the
 * device height minus whatever chrome the browser is showing at that moment —
 * a number no test here can know. Asserting against a guessed height would be
 * a threshold tuned until whatever ships passes it, which tests nothing. The
 * height model below is used only for the comfortable-target floor.
 */

const MINI_DESC_KEY: Record<Difficulty, StringKey> = {
  easy: "miniDiffEasyDesc",
  medium: "miniDiffMediumDesc",
  hard: "miniDiffHardDesc",
  extreme: "miniDiffExtremeDesc",
};

describe("difficulty card geometry", () => {
  it("checks Android widths, not only iPhone ones", () => {
    // The layout "passed" at 320, 375 and 430 and still looked wrong on a
    // Samsung, because every number checked was an iPhone number. 360 is the
    // most common Android width in the world.
    for (const w of [360, 384, 393, 412]) {
      expect(VIEWPORTS, `${w} is not covered`).toContain(w);
    }
  });

  it.each(VIEWPORTS)("Five's tile preview fits at %ipx", (viewport) => {
    const room = cardContentWidth(viewport);
    for (const d of DIFFICULTIES) {
      const width = fivePreviewWidth(DIFFICULTY_LENGTH[d]);
      expect(
        width,
        `${d}: ${DIFFICULTY_LENGTH[d]} tiles is ${width}px in ${room}px`,
      ).toBeLessThanOrEqual(room);
    }
  });

  it.each(VIEWPORTS)("Mini's grid preview fits at %ipx", (viewport) => {
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
    const room = cardContentWidth(VIEWPORTS[0]);
    const widest = Math.max(
      ...DIFFICULTIES.map((d) => fivePreviewWidth(DIFFICULTY_LENGTH[d])),
      ...DIFFICULTIES.map((d) => miniPreviewWidth(MINI_SIZE[d])),
    );
    // The version that shipped clipped had 28px of slack here and still
    // looked wrong on a real phone, so "it fits" is not the bar. Half the card.
    expect(widest, `widest preview ${widest}px in ${room}px`).toBeLessThan(
      room / 2,
    );
  });

  it("keeps the page off the screen edge", () => {
    // The cards sit inside `.safe-x`, so this is the gutter either side of
    // them. 16px is the floor at every width, notch or no notch.
    expect(SAFE_X_PX).toBeGreaterThanOrEqual(16);
    for (const viewport of VIEWPORTS) {
      const cardWidth = Math.min(viewport, SCREEN_MAX_PX) - 2 * SAFE_X_PX;
      expect(viewport - cardWidth, `gutter at ${viewport}px`).toBeGreaterThanOrEqual(
        32,
      );
    }
  });

  it("clears the comfortable-target floor from its content alone", () => {
    // The card sets no `min-height`: an explicit one replaces the flex item's
    // automatic minimum, and with `overflow-hidden` a short screen would then
    // crop the preview instead of scrolling. So the floor has to be met by
    // the content, and this is what checks it.
    const five = difficultyCardHeight(PICKER_TILE_PX);
    const mini = difficultyCardHeight(miniPreviewWidth(5));
    expect(five, `Five's card is ${five}px`).toBeGreaterThanOrEqual(MIN_CARD_PX);
    expect(mini, `Mini's card is ${mini}px`).toBeGreaterThanOrEqual(MIN_CARD_PX);
  });

  it("keeps the preview a supporting detail rather than the headline", () => {
    // 24px name against 15px tiles. If the tile ever grows past the name it
    // has stopped supporting it and started competing with it.
    expect(PICKER_TILE_PX).toBeLessThan(24);
    expect(PICKER_CELL_PX).toBeLessThan(PICKER_TILE_PX);
  });

  it("computes the card box from the real insets", () => {
    expect(cardContentWidth(360)).toBe(360 - 2 * SAFE_X_PX - 2 * CARD_PAD_PX);
    expect(cardContentWidth(360)).toBe(284);
    // Capped by the screen's max width, so a tablet does not get a 900px card.
    expect(cardContentWidth(1200)).toBe(cardContentWidth(SCREEN_MAX_PX));
  });

  /**
   * Mini's descriptions have to hold one line, because Mini's card carries a
   * grid preview and a second line of text is what pushed four of them off a
   * short screen. The budget is in characters rather than pixels: measuring
   * text needs the font, and a pessimistic 7px per character at 13px puts 32
   * characters at 224px inside the 244px card at the narrowest width.
   *
   * The rule this encodes is not really about width. A picker card exists to
   * let you choose; "5x5, varje bokstav kontrolleras två gånger" was teaching
   * the mechanic, which belongs in the how-to-play sheet.
   */
  it("keeps Mini's descriptions to one line at the narrowest screen", () => {
    const BUDGET = 32;
    const room = cardContentWidth(VIEWPORTS[0]);
    expect(BUDGET * 7, `budget exceeds the ${room}px card`).toBeLessThanOrEqual(
      room,
    );
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
});
