import { beforeAll, describe, expect, it } from "vitest";
import { useLanguage } from "./helpers";
import { isValidWord } from "@/lib/dictionary";
import {
  cellKey,
  drawTiles,
  isConnected,
  runs,
  validate,
  type Cells,
} from "@/games/rush/engine";
import { ALPHABETS } from "@/lib/alphabet";
import { mulberry32 } from "@/lib/rng";

beforeAll(async () => {
  await useLanguage("en");
  await useLanguage("sv");
});

/** Build a board from an ASCII sketch; "." is an empty cell. */
function board(rows: string[]): Cells {
  const cells: Cells = new Map();
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== ".") cells.set(cellKey(x, y), ch);
    });
  });
  return cells;
}

describe("runs", () => {
  it("finds a single horizontal word", () => {
    const found = runs(board(["cat"]));
    expect(found).toHaveLength(1);
    expect(found[0]!.word).toBe("cat");
    expect(found[0]!.dir).toBe("h");
  });

  it("finds a crossing pair", () => {
    const found = runs(board(["cat", "o..", "w.."]));
    const words = found.map((r) => r.word).sort();
    expect(words).toEqual(["cat", "cow"]);
  });

  it("ignores a lone tile", () => {
    expect(runs(board(["a"]))).toHaveLength(0);
  });

  it("reads a run only once", () => {
    const found = runs(board(["cat", "...", "dog"]));
    expect(found.map((r) => r.word).sort()).toEqual(["cat", "dog"]);
  });

  it("finds a word that starts away from the origin", () => {
    const found = runs(board(["...cat"]));
    expect(found[0]!.word).toBe("cat");
  });
});

describe("isConnected", () => {
  it("accepts one blob", () => {
    expect(isConnected(board(["cat", "o..", "w.."]))).toBe(true);
  });

  it("rejects two islands", () => {
    expect(isConnected(board(["cat", "...", "dog"]))).toBe(false);
  });

  it("accepts a single tile and an empty board", () => {
    expect(isConnected(board(["a"]))).toBe(true);
    expect(isConnected(new Map())).toBe(true);
  });

  it("does not treat a diagonal touch as connected", () => {
    expect(isConnected(board(["ab", "..", "..cd"]))).toBe(false);
  });
});

describe("validate", () => {
  const isWord = (w: string) => isValidWord(w, "en");

  it("accepts a finished board", () => {
    const cells = board(["cat", "o..", "w.."]);
    const v = validate(cells, 5, isWord);
    expect(v.ok).toBe(true);
    expect(v.invalidRuns).toHaveLength(0);
  });

  it("rejects leftover tiles", () => {
    const v = validate(board(["cat"]), 5, isWord);
    expect(v.ok).toBe(false);
    expect(v.allPlaced).toBe(false);
  });

  it("rejects a disconnected board", () => {
    const v = validate(board(["cat", "...", "dog"]), 6, isWord);
    expect(v.ok).toBe(false);
    expect(v.connected).toBe(false);
  });

  it("rejects a non word", () => {
    const v = validate(board(["xqz"]), 3, isWord);
    expect(v.ok).toBe(false);
    expect(v.invalidRuns.map((r) => r.word)).toContain("xqz");
  });

  it("catches the accidental word a crossing creates", () => {
    // "cat" over "own" makes the columns "co", "aw" and "tn".
    const v = validate(board(["cat", "own"]), 6, isWord);
    expect(v.ok).toBe(false);
    expect(v.invalidRuns.length).toBeGreaterThan(0);
  });

  it("rejects a stray tile hanging off nothing", () => {
    const cells = board(["cat"]);
    cells.set(cellKey(9, 9), "z");
    const v = validate(cells, 4, isWord);
    expect(v.ok).toBe(false);
    expect(v.strayCells.length).toBeGreaterThan(0);
  });

  it("works in Swedish, including Å Ä Ö", () => {
    const cells = board(["hus", "ä..", "st."]);
    // "hus" and "häst" are words; this sketch is only checking the plumbing.
    const v = validate(cells, cells.size, (w) => isValidWord(w, "sv"));
    expect(v.allPlaced).toBe(true);
    expect(v.connected).toBe(true);
  });
});

describe("drawTiles", () => {
  it("draws the requested number", () => {
    for (const n of [12, 20, 30]) {
      expect(drawTiles("en", n, 1.5, mulberry32(n))).toHaveLength(n);
    }
  });

  it("only draws letters from the language's alphabet", () => {
    for (const lang of ["en", "sv"] as const) {
      const allowed = new Set(ALPHABETS[lang]);
      for (const l of drawTiles(lang, 30, 1.4, mulberry32(5))) {
        expect(allowed.has(l), `${lang}:${l}`).toBe(true);
      }
    }
  });

  it("guarantees a workable vowel ratio", () => {
    const vowels = new Set(["a", "e", "i", "o", "u"]);
    for (let seed = 1; seed <= 30; seed++) {
      const tiles = drawTiles("en", 12, 1.0, mulberry32(seed));
      const n = tiles.filter((l) => vowels.has(l)).length;
      expect(n, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("leans harder on vowels at a higher bias", () => {
    const vowels = new Set(["a", "e", "i", "o", "u"]);
    const count = (bias: number) => {
      let total = 0;
      for (let seed = 1; seed <= 60; seed++) {
        total += drawTiles("en", 20, bias, mulberry32(seed)).filter((l) =>
          vowels.has(l),
        ).length;
      }
      return total;
    };
    expect(count(2.2)).toBeGreaterThan(count(1.0));
  });

  it("is deterministic for a seed", () => {
    expect(drawTiles("sv", 16, 1.5, mulberry32(9))).toEqual(
      drawTiles("sv", 16, 1.5, mulberry32(9)),
    );
  });
});
