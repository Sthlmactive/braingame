import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareWords } from "../lib/alphabet";
import { DIFFICULTIES, type Difficulty } from "../lib/difficulty";
import {
  BLACK,
  MINI_BLACKS,
  MINI_SIZE,
  patternsFor,
  wordsOf,
  entriesOf,
} from "../lib/mini";
import { MINI_FILL_BANDS, type FillPool } from "../lib/fill";
import type { Lang } from "../lib/i18n";
import { mulberry32 } from "../lib/rng";
import { LetterIndex, solveGrid } from "./lib/mini-solve";

/**
 * Generates Mini's puzzle banks.
 *
 * Grids are built here, at build time, never on the phone: a backtracking fill
 * can take seconds or fail outright, and neither is acceptable mid game. The
 * bank ships as data and the existing bag in lib/bag.ts serves it without
 * repeats, exactly as Five serves its answer buckets.
 *
 *   npm run data:mini
 */

const FILL_DIR = join(process.cwd(), "data", "fill");
const OUT = join(process.cwd(), "public", "data");

/** Aim for this many per language per difficulty. */
const TARGET = 500;
/**
 * Under this, the bank is too thin to ship and the build fails.
 *
 * One floor for every difficulty, Extrem included. A lower floor for Extrem was
 * written and then reverted: with the rank cap and the ambiguity check it came
 * out at 128 and 36 puzzles, which looked like it needed one, and widening
 * Extrem to every fill band took it to 473 and 354 instead. The floor never had
 * to move. See docs/mini-spec.md for why the other three ways of making that
 * bank bigger are all refused.
 */
const MIN_BANK = 200;

/**
 * No single word may carry more than this share of a bank.
 *
 * The first banks put `area` in 120 of 500 English Lätt puzzles and `arena` in
 * 84 of 500 Swedish Extrem. A word that fits everywhere is exactly the word the
 * solver reaches for first, and the tenth puzzle in a sitting is where that
 * shows. The cap is absolute rather than a share of the finished bank, because
 * the finished size is not known while the bank is being built; it is 3% of the
 * target, and the report states the worst offender as a share of what actually
 * shipped.
 */
const REPEAT_SHARE = 0.03;
const WORD_CAP = Math.max(1, Math.round(TARGET * REPEAT_SHARE));

/**
 * Which difficulties must be unambiguous: every entry pinned by its crossings,
 * and no two entries sharing a stem. One word to add Lätt, if its bank is ever
 * allowed to be smaller than the 200 floor.
 */
const UNIQUE_DIFFICULTIES = new Set<Difficulty>(["extreme"]);

/** Seeds are per language and difficulty, so one bank never shifts another. */
const SEED_BASE = 0x5eed;

function seedFor(lang: Lang, difficulty: Difficulty): number {
  const l = lang === "sv" ? 1 : 2;
  const d = DIFFICULTIES.indexOf(difficulty) + 1;
  return (SEED_BASE + l * 7919 + d * 104729) >>> 0;
}

function loadFill(lang: Lang): FillPool {
  const path = join(FILL_DIR, `${lang}.json`);
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Run \`npm run data:words\` first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as FillPool;
}

/** The word list a difficulty may fill from, indexed per entry length. */
function poolsFor(fill: FillPool, difficulty: Difficulty): Map<number, LetterIndex> {
  const bands = MINI_FILL_BANDS[difficulty];
  const out = new Map<number, LetterIndex>();
  for (const length of [3, 4, 5]) {
    const words = bands.flatMap((b) => fill[length]?.[b] ?? []);
    if (words.length > 0) out.set(length, new LetterIndex(words, length));
  }
  return out;
}

interface BankReport {
  lang: Lang;
  difficulty: Difficulty;
  puzzles: string[];
  patterns: number;
  attempts: number;
  ms: number;
  /** Whether every grid in this bank had to be unambiguous. */
  checked: boolean;
  /** The most repeated word in the finished bank. */
  worst: { word: string; count: number } | null;
}

function generate(lang: Lang, difficulty: Difficulty, fill: FillPool): BankReport {
  const size = MINI_SIZE[difficulty];
  const patterns = MINI_BLACKS[difficulty].flatMap((n) => patternsFor(size, n));
  if (patterns.length === 0) {
    throw new Error(`mini: no usable pattern for ${difficulty} at ${size}x${size}`);
  }

  const pools = poolsFor(fill, difficulty);
  const rng = mulberry32(seedFor(lang, difficulty));
  const seen = new Set<string>();
  const puzzles: string[] = [];
  const started = Date.now();
  let attempts = 0;

  /**
   * A grid with no black square is fully checked: every letter sits in both an
   * across and a down entry, and nothing but the crossings can tell one
   * inflection from another. Two difficulties are built that way, Lätt at 4x4
   * and Extrem at 5x5, and only Extrem is held to the rule.
   *
   * Lätt is measured, not assumed safe: with the same rule applied its bank
   * comes out at **179 puzzles**, under the 200 minimum, so it cannot ship
   * unambiguous at 4x4 without either a lower floor or a wider pool. A 4x4
   * leaves less room for the crossings to pin an entry than a 5x5 does, and
   * the fill pool at four letters is the smaller of the two.
   */
  const checked = UNIQUE_DIFFICULTIES.has(difficulty) && patterns.every((p) => !p.includes(BLACK));

  // Words that have taken their share of this bank already.
  const usage = new Map<string, number>();
  const banned = new Set<string>();

  // Round robin over the patterns, so one easy pattern cannot fill the whole
  // bank while a harder one contributes nothing.
  // A bank with one pattern gets the same patience as a bank with several:
  // the cap exists to stop a hang, not to cut a bank short.
  const patience = Math.max(400, patterns.length * 60);
  let sinceProgress = 0;
  while (puzzles.length < TARGET && sinceProgress < patience) {
    const pattern = patterns[attempts % patterns.length]!;
    attempts++;
    const { grid } = solveGrid(pattern, pools, rng, {
      maxSteps: 200_000,
      requireUnique: checked,
      banned,
    });
    if (!grid || seen.has(grid)) {
      sinceProgress++;
      continue;
    }
    seen.add(grid);
    puzzles.push(grid);
    for (const word of new Set(wordsOf(grid))) {
      const n = (usage.get(word) ?? 0) + 1;
      usage.set(word, n);
      if (n >= WORD_CAP) banned.add(word);
    }
    sinceProgress = 0;
  }

  const worstEntry = [...usage].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  const worst = worstEntry ? { word: worstEntry[0], count: worstEntry[1] } : null;

  // Sorted, so the bank is byte stable whatever order the search found them.
  puzzles.sort((a, b) => compareWords(a, b, lang));
  return {
    lang,
    difficulty,
    puzzles,
    patterns: patterns.length,
    attempts,
    ms: Date.now() - started,
    checked,
    worst,
  };
}

function write(report: BankReport): void {
  const dir = join(OUT, report.lang);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `mini-${report.difficulty}.txt`),
    `${report.puzzles.join("\n")}\n`,
  );
}

function render(grid: string): string[] {
  const size = Math.round(Math.sqrt(grid.length));
  const rows: string[] = [];
  for (let r = 0; r < size; r++) {
    rows.push(
      [...grid.slice(r * size, r * size + size)]
        .map((c) => (c === "#" ? "■" : c.toUpperCase()))
        .join(" "),
    );
  }
  return rows;
}

function main(): void {
  const reports: BankReport[] = [];

  for (const lang of ["sv", "en"] as const) {
    const fill = loadFill(lang);
    for (const difficulty of DIFFICULTIES) {
      const report = generate(lang, difficulty, fill);
      write(report);
      reports.push(report);
      const share = report.worst
        ? ((report.worst.count / Math.max(1, report.puzzles.length)) * 100).toFixed(1)
        : "0.0";
      console.log(
        `  ${lang} ${difficulty.padEnd(8)} ${String(report.puzzles.length).padStart(4)} puzzles ` +
          `from ${report.patterns} pattern(s), ${report.attempts} attempts, ` +
          `${(report.ms / 1000).toFixed(1)}s` +
          `${report.checked ? ", unambiguous" : ""}` +
          `, most repeated ${report.worst?.word ?? "-"} x${report.worst?.count ?? 0} (${share}%)`,
      );
    }
  }

  // Three grids per bank, for a human to read.
  for (const r of reports) {
    console.log(`\n  ${r.lang} ${r.difficulty} — 3 of ${r.puzzles.length}`);
    const step = Math.max(1, Math.floor(r.puzzles.length / 3));
    for (let k = 0; k < 3; k++) {
      const grid = r.puzzles[Math.min(k * step, r.puzzles.length - 1)];
      if (!grid) continue;
      const words = wordsOf(grid);
      const numbers = entriesOf(grid).map(
        (e, i) => `${e.number}${e.direction === "across" ? "a" : "d"} ${words[i]}`,
      );
      for (const row of render(grid)) console.log(`      ${row}`);
      console.log(`      ${numbers.join("   ")}\n`);
    }
  }

  const thin = reports.filter((r) => r.puzzles.length < MIN_BANK);
  if (thin.length > 0) {
    throw new Error(
      `Refusing to ship thin banks: ${thin
        .map((r) => `${r.lang}/${r.difficulty} has ${r.puzzles.length}`)
        .join(", ")}. Minimum is ${MIN_BANK}.`,
    );
  }
}

main();
