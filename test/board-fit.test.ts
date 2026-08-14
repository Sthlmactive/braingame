import { describe, expect, it } from "vitest";
import { fitTile, rowWidth } from "@/lib/useBoardFit";
import { DIFFICULTIES, DIFFICULTY_LENGTH } from "@/lib/difficulty";
import { fiveConfig } from "@/lib/levels";

/**
 * Board geometry on real phones.
 *
 * 320pt is an iPhone SE 1st generation, 375 an SE 2nd/3rd generation and a 13
 * mini, 430 a 15 Pro Max. The page reserves 16pt of padding a side, so the
 * board gets the width minus 32.
 */
const PHONES = [
  { name: "iPhone SE 320pt", width: 320, height: 568 },
  { name: "iPhone SE/13 mini 375pt", width: 375, height: 667 },
  { name: "iPhone 15 Pro Max 430pt", width: 430, height: 932 },
] as const;

const SIDE_PADDING = 32;
/** Header, hint row and keyboard all come off the height before the board. */
const CHROME_HEIGHT = 300;
const GAP = 6;

describe("board fits every phone at both word lengths", () => {
  const cases = PHONES.flatMap((p) =>
    [5, 6].map((cols) => ({ ...p, cols }) as const),
  );

  it.each(cases)("$name, $cols columns", ({ width, height, cols }) => {
    const available = width - SIDE_PADDING;
    const px = fitTile({
      width: available,
      height: height - CHROME_HEIGHT,
      cols,
      rows: 6,
      gap: GAP,
    });

    // The row must fit the width it was measured against. This is the check
    // that a six column board would fail if the size came from a fixed number
    // rather than the column count.
    expect(rowWidth(px, cols, GAP), `${cols} cols at ${width}pt`).toBeLessThanOrEqual(
      available,
    );
    // And the tiles have to stay big enough to read and to tap.
    expect(px).toBeGreaterThanOrEqual(24);
  });

  it("gives six columns smaller tiles than five in the same space", () => {
    for (const { width, height } of PHONES) {
      const args = { width: width - SIDE_PADDING, height: height - CHROME_HEIGHT, rows: 6 };
      const five = fitTile({ ...args, cols: 5 });
      const six = fitTile({ ...args, cols: 6 });
      // Unless both are already pinned to the maximum on a large screen.
      expect(six).toBeLessThanOrEqual(five);
    }
  });

  it("derives the size from the column count, not a constant", () => {
    // `max` is lifted so width is what binds; otherwise the cap flattens the
    // first few counts and hides the relationship being tested.
    const args = { width: 343, height: 2000, rows: 6, max: 500 };
    const sizes = [4, 5, 6, 7].map((cols) => fitTile({ ...args, cols }));
    // Strictly decreasing: more columns, smaller tiles.
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!).toBeLessThan(sizes[i - 1]!);
    }
  });

  it("lets height win when the board is tall and narrow", () => {
    // Eight rows in a short box: the height, not the width, sets the size.
    const px = fitTile({ width: 1000, height: 300, cols: 5, rows: 8 });
    expect(px).toBe(Math.floor((300 - 7 * 6) / 8));
  });

  it("never returns less than the readable minimum", () => {
    expect(fitTile({ width: 10, height: 10, cols: 6, rows: 6, min: 18 })).toBe(18);
  });

  it("honours a reserved column, which is how Grid keeps its board square", () => {
    const plain = fitTile({ width: 343, height: 400, cols: 5, rows: 5 });
    const reserved = fitTile({
      width: 343,
      height: 400,
      cols: 5,
      rows: 5,
      reserveWidth: 54,
    });
    expect(reserved).toBeLessThan(plain);
  });
});

describe("every Five difficulty fits", () => {
  it.each(DIFFICULTIES)("%s fits an iPhone SE", (difficulty) => {
    const cfg = fiveConfig(difficulty);
    expect(cfg.length).toBe(DIFFICULTY_LENGTH[difficulty]);
    const available = 320 - SIDE_PADDING;
    const px = fitTile({
      width: available,
      height: 568 - CHROME_HEIGHT,
      cols: cfg.length,
      rows: cfg.guesses,
      gap: GAP,
    });
    expect(rowWidth(px, cfg.length, GAP)).toBeLessThanOrEqual(available);
    expect(px).toBeGreaterThanOrEqual(24);
  });
});
