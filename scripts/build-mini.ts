import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareWords } from "../lib/alphabet";
import { DIFFICULTIES, type Difficulty } from "../lib/difficulty";
import { MINI_BLACKS, MINI_SIZE, patternsFor, wordsOf, entriesOf } from "../lib/mini";
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
/** Under this, the bank is too thin to ship and the build fails. */
const MIN_BANK = 200;

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

  // Round robin over the patterns, so one easy pattern cannot fill the whole
  // bank while a harder one contributes nothing.
  // A bank with one pattern gets the same patience as a bank with several:
  // the cap exists to stop a hang, not to cut a bank short.
  const patience = Math.max(400, patterns.length * 60);
  let sinceProgress = 0;
  while (puzzles.length < TARGET && sinceProgress < patience) {
    const pattern = patterns[attempts % patterns.length]!;
    attempts++;
    const { grid } = solveGrid(pattern, pools, rng, 200_000);
    if (!grid || seen.has(grid)) {
      sinceProgress++;
      continue;
    }
    seen.add(grid);
    puzzles.push(grid);
    sinceProgress = 0;
  }

  // Sorted, so the bank is byte stable whatever order the search found them.
  puzzles.sort((a, b) => compareWords(a, b, lang));
  return {
    lang,
    difficulty,
    puzzles,
    patterns: patterns.length,
    attempts,
    ms: Date.now() - started,
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
      console.log(
        `  ${lang} ${difficulty.padEnd(8)} ${String(report.puzzles.length).padStart(4)} puzzles ` +
          `from ${report.patterns} pattern(s), ${report.attempts} attempts, ` +
          `${(report.ms / 1000).toFixed(1)}s`,
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
