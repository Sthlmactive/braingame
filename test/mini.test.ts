import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { useLanguage } from "./helpers";
import { isValidWord } from "@/lib/dictionary";
import { DIFFICULTIES, type Difficulty } from "@/lib/difficulty";
import {
  BLACK,
  MIN_RUN,
  MINI_BLACKS,
  MINI_SIZE,
  entriesOf,
  isConnected,
  isSymmetric,
  isUsablePattern,
  patternsFor,
  runs,
  sizeOf,
  wordOf,
  wordsOf,
} from "@/lib/mini";
import { LANGS, type Lang } from "@/lib/i18n";

/**
 * Mini's puzzle banks. Every letter in a mini is checked twice, so a single
 * bad entry ruins two clues at once and the player cannot recover. These are
 * the guarantees that make that impossible.
 */

beforeAll(async () => {
  await useLanguage("sv");
  await useLanguage("en");
});

function bank(lang: Lang, difficulty: Difficulty): string[] {
  const path = join(process.cwd(), "public", "data", lang, `mini-${difficulty}.txt`);
  return readFileSync(path, "utf8").trim().split("\n");
}

const cases = LANGS.flatMap((lang) =>
  DIFFICULTIES.map((difficulty) => ({ lang, difficulty })),
);

describe("grid model", () => {
  it("numbers entries the way a crossword does", () => {
    // A 3x3 with no blacks: three across, three down, numbered 1 2 3 across
    // the top row and 1 4 ... hmm, standard numbering walks reading order.
    const entries = entriesOf("abcdefghi");
    expect(entries.map((e) => `${e.number}${e.direction[0]}`)).toEqual([
      "1a",
      "1d",
      "2d",
      "3d",
      "4a",
      "5a",
    ]);
  });

  it("reads the word an entry spells", () => {
    const grid = "abcdefghi";
    const across = entriesOf(grid).find((e) => e.direction === "across")!;
    expect(wordOf(grid, across)).toBe("abc");
    expect(wordsOf(grid)).toContain("adg");
  });

  it("rejects a run shorter than three", () => {
    // A black square at index 1 leaves a run of one in the top row.
    expect(isUsablePattern("a#cdefghi")).toBe(false);
  });

  it("rejects an asymmetric mask", () => {
    expect(isSymmetric("#........")).toBe(false);
    expect(isSymmetric("#.......#")).toBe(true);
  });

  it("rejects a disconnected grid", () => {
    // Two white regions separated by a full black row.
    expect(isConnected("abc###ghi")).toBe(false);
    expect(isConnected("abcdefghi")).toBe(true);
  });

  it("enumerates only usable patterns", () => {
    for (const n of [0, 2, 3, 4, 5]) {
      for (const p of patternsFor(5, n)) {
        expect(isUsablePattern(p), p).toBe(true);
        expect([...p].filter((c) => c === BLACK)).toHaveLength(n);
      }
    }
  });

  it("throws on a grid that is not square", () => {
    expect(() => sizeOf("abcde")).toThrow(/not square/);
  });
});

describe.each(cases)("$lang $difficulty bank", ({ lang, difficulty }) => {
  const puzzles = bank(lang, difficulty);
  const size = MINI_SIZE[difficulty];

  it("is big enough to ship", () => {
    expect(puzzles.length).toBeGreaterThanOrEqual(200);
  });

  it("holds no duplicate puzzles", () => {
    expect(new Set(puzzles).size).toBe(puzzles.length);
  });

  it("is the right size with the agreed number of black squares", () => {
    for (const grid of puzzles) {
      expect(grid).toHaveLength(size * size);
      const blacks = [...grid].filter((c) => c === BLACK).length;
      expect(MINI_BLACKS[difficulty], `${grid} has ${blacks}`).toContain(blacks);
    }
  });

  it("is symmetric, connected, and free of short runs", () => {
    for (const grid of puzzles) {
      expect(isSymmetric(grid), grid).toBe(true);
      expect(isConnected(grid), grid).toBe(true);
      for (const run of runs(grid)) {
        expect(run.length, `${grid} has a run of ${run.length}`).toBeGreaterThanOrEqual(
          MIN_RUN,
        );
      }
    }
  });

  it("spells a real word in every entry, across and down", () => {
    for (const grid of puzzles) {
      for (const word of wordsOf(grid)) {
        expect(word.length).toBeGreaterThanOrEqual(MIN_RUN);
        expect(isValidWord(word, lang), `${lang}: ${word} in ${grid}`).toBe(true);
      }
    }
  });

  it("never repeats a word inside one grid", () => {
    for (const grid of puzzles) {
      const words = wordsOf(grid);
      expect(new Set(words).size, `repeat in ${grid}`).toBe(words.length);
    }
  });

  it("draws three letter entries only from the capped fill pool", () => {
    const fill = JSON.parse(
      readFileSync(join(process.cwd(), "data", "fill", `${lang}.json`), "utf8"),
    ) as Record<string, Record<string, string[]>>;
    const allowed = new Set(DIFFICULTIES.flatMap((b) => fill["3"]![b]!));
    for (const grid of puzzles) {
      for (const word of wordsOf(grid)) {
        if (word.length !== 3) continue;
        expect(allowed.has(word), `${lang}: ${word} is not capped fill`).toBe(true);
      }
    }
  });
});

describe("extreme is fully checked", () => {
  it.each(LANGS)("%s has no black squares and ten valid entries", (lang) => {
    for (const grid of bank(lang, "extreme")) {
      expect(grid).not.toContain(BLACK);
      const words = wordsOf(grid);
      expect(words).toHaveLength(10);
      for (const w of words) expect(w).toHaveLength(5);
    }
  });
});

describe("easy is a 4x4 with no black squares", () => {
  it.each(LANGS)("%s has eight four letter entries", (lang) => {
    for (const grid of bank(lang, "easy")) {
      expect(grid).not.toContain(BLACK);
      const words = wordsOf(grid);
      expect(words).toHaveLength(8);
      for (const w of words) expect(w).toHaveLength(4);
    }
  });
});
