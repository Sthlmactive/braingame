import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useLanguage } from "./helpers";
import { setPuzzleLoader, loadGridSquares, loadLoopBoards } from "@/lib/puzzles";
import { difficultyPool, getLanguage, poolSize } from "@/lib/dictionary";
import { answerPool } from "@/lib/dictionary";
import { LANGS, type Lang } from "@/lib/i18n";
import { LEVELS } from "@/lib/games";
import { DIFFICULTIES } from "@/lib/difficulty";
import {
  fiveConfig,
  gridConfig,
  hiveConfig,
  loopConfig,
  ordokuConfig,
  rushConfig,
  tilesConfig,
} from "@/lib/levels";
import { mulberry32 } from "@/lib/rng";
import { generateHive } from "@/games/hive/engine";
import { generateOrdoku, hasUniqueSolution } from "@/games/ordoku/engine";
import { drawTiles } from "@/games/rush/engine";
import { generateMoves, emptyBoard, emptyBlanks } from "@/games/tiles/engine";
import { layout } from "@/games/loop/board";

/**
 * The definition of done says all seven games are playable in both languages
 * at all ten levels. This is that claim, checked rather than asserted.
 */

setPuzzleLoader(async (path) => {
  return JSON.parse(readFileSync(join(process.cwd(), "public", path), "utf8"));
});

beforeAll(async () => {
  await useLanguage("en");
  await useLanguage("sv");
});

describe.each(LANGS)("%s", (lang: Lang) => {
  describe("Five", () => {
    // Five has difficulties instead of levels, and every one of them is a five
    // letter word. The pool itself is covered in difficulty.test.ts.
    it.each(DIFFICULTIES)("%s serves words of its own length", (difficulty) => {
      const cfg = fiveConfig(difficulty);
      const pool = difficultyPool(lang, difficulty);
      expect(pool.length).toBeGreaterThan(300);
      for (const w of pool) expect(w).toHaveLength(cfg.length);
    });

    // The agreed table, pinned. Lätt and Medel are five letters, Svår and
    // Extrem are six, every difficulty gets six guesses, and there is no hard
    // mode anywhere: Svår and Extrem differ only by the keyboard colours.
    it.each(DIFFICULTIES)("%s matches the agreed rule table", (difficulty) => {
      const cfg = fiveConfig(difficulty);
      const expected = {
        easy: {
          length: 5,
          guesses: 6,
          hints: 2,
          keyboardColours: true,
        },
        medium: {
          length: 5,
          guesses: 6,
          hints: 1,
          keyboardColours: true,
        },
        hard: {
          length: 6,
          guesses: 6,
          hints: 0,
          keyboardColours: true,
        },
        extreme: {
          length: 6,
          guesses: 6,
          hints: 0,
          keyboardColours: false,
        },
      }[difficulty];
      expect(cfg).toEqual(expected);
    });
  });

  describe("Hive", () => {
    it.each(LEVELS)(
      "level %i builds a puzzle with a pangram and 20+ words",
      (level) => {
        const cfg = hiveConfig(level);
        const p = generateHive(lang, cfg, mulberry32(level * 977), 60);
        expect(p, `${lang} hive ${level}`).not.toBeNull();
        expect(p!.pangrams.length).toBeGreaterThan(0);
        expect(p!.answers.length).toBeGreaterThanOrEqual(20);
        // Every answer really is playable from the seven letters.
        const allowed = new Set(p!.letters);
        for (const w of p!.answers) {
          expect(w).toContain(p!.centre);
          expect(w.length).toBeGreaterThanOrEqual(cfg.minLength);
          for (const ch of w) expect(allowed.has(ch), `${w}:${ch}`).toBe(true);
        }
        // The clear threshold has to be reachable.
        const needed = Math.ceil((p!.maxScore * cfg.scoreToClear) / 100);
        expect(needed).toBeLessThanOrEqual(p!.maxScore);
      },
      20000,
    );
  });

  describe("Grid", () => {
    it.each(LEVELS)("level %i can fill five rows", async (level) => {
      const cfg = gridConfig(level);
      if (cfg.columnsToo) {
        const squares = await loadGridSquares(lang);
        expect(squares.length).toBeGreaterThan(0);
        const dawg = getLanguage(lang).dawg;
        for (const square of squares) {
          expect(square).toHaveLength(5);
          for (const row of square) expect(dawg.has(row), row).toBe(true);
          for (let c = 0; c < 5; c++) {
            const col = square.map((r) => r[c]).join("");
            expect(dawg.has(col), `column ${col}`).toBe(true);
          }
        }
      } else {
        expect(poolSize(lang, 5, cfg.band)).toBeGreaterThan(50);
      }
    });
  });

  describe("Loop", () => {
    it.each(LEVELS)("level %i has boards that fit its config", async (level) => {
      const cfg = loopConfig(level);
      const all = await loadLoopBoards(lang);
      const boards = all[level] ?? [];
      expect(boards.length, `${lang} loop ${level}`).toBeGreaterThanOrEqual(20);

      const dawg = getLanguage(lang).dawg;
      for (const b of boards) {
        expect(b.wheel.length).toBe(cfg.wheelLetters);
        expect(b.words.length).toBeGreaterThanOrEqual(cfg.slots);
        // Every slot word is real and spellable from the wheel.
        for (const p of b.words) {
          expect(dawg.has(p.word), p.word).toBe(true);
          const pool = [...b.wheel];
          for (const ch of p.word) {
            const at = pool.indexOf(ch);
            expect(at, `${p.word} needs ${ch} from ${b.wheel}`).toBeGreaterThanOrEqual(0);
            pool.splice(at, 1);
          }
        }
        // The layout must be consistent: no cell claimed by two letters.
        const cells = layout(b.words);
        for (const p of b.words) {
          for (let i = 0; i < p.word.length; i++) {
            const x = p.dir === "h" ? p.x + i : p.x;
            const y = p.dir === "v" ? p.y + i : p.y;
            expect(cells.get(`${x},${y}`)).toBe(p.word[i]);
          }
        }
        expect(b.width).toBeLessThanOrEqual(13);
        expect(b.height).toBeLessThanOrEqual(13);
      }
    });
  });

  describe("Ordoku", () => {
    it.each(LEVELS)(
      "level %i generates a unique puzzle from a real word",
      (level) => {
        const cfg = ordokuConfig(level);
        const rng = mulberry32(level * 613 + (lang === "sv" ? 1 : 2));
        const candidates = answerPool(lang, cfg.size, "top20k").filter(
          (w) => new Set(w).size === cfg.size,
        );
        expect(
          candidates.length,
          `${lang} needs ${cfg.size}-letter words with distinct letters`,
        ).toBeGreaterThan(0);

        const word = candidates[Math.floor(rng() * candidates.length)]!;
        const p = generateOrdoku(word, cfg.size, cfg.givens, rng);
        expect(p, `${lang} ordoku ${level}`).not.toBeNull();
        expect(hasUniqueSolution(p!.puzzle, cfg.size)).toBe(true);
        expect(p!.word).toBe(word);
        // The diagonal of the solution spells the word.
        const diagonal = Array.from({ length: cfg.size }, (_, i) =>
          p!.letters[p!.solution[i * cfg.size + i]!],
        ).join("");
        expect(diagonal).toBe(word);
      },
      30000,
    );
  });

  describe("Rush", () => {
    it.each(LEVELS)("level %i draws a usable bag", (level) => {
      const cfg = rushConfig(level);
      const tiles = drawTiles(lang, cfg.tiles, cfg.vowelBias, mulberry32(level * 17));
      expect(tiles).toHaveLength(cfg.tiles);
      const vowels = new Set(
        lang === "sv"
          ? ["a", "e", "i", "o", "u", "y", "å", "ä", "ö"]
          : ["a", "e", "i", "o", "u"],
      );
      const n = tiles.filter((l) => vowels.has(l)).length;
      expect(n, `${lang} rush ${level}`).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Tiles", () => {
    it.each(LEVELS)(
      "level %i lets the opponent find an opening move",
      (level) => {
        const cfg = tilesConfig(level);
        const dawg = getLanguage(lang).dawg;
        const rack =
          lang === "sv"
            ? ["h", "ä", "s", "t", "a", "r", "n"]
            : ["c", "a", "t", "s", "e", "r", "n"];
        const moves = generateMoves(emptyBoard(), emptyBlanks(), rack, lang, dawg, {
          maxWordLength: cfg.aiMaxWordLength,
          premiumWeight: cfg.aiPremiumWeight,
          budgetMs: 4000,
        });
        expect(moves.length, `${lang} tiles ${level}`).toBeGreaterThan(0);
        for (const m of moves) {
          expect(m.word.length).toBeLessThanOrEqual(cfg.aiMaxWordLength);
        }
      },
      20000,
    );
  });
});
