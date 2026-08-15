import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalise } from "../lib/alphabet";
import { decodeFrontCoded } from "../lib/dictionary";
import { DIFFICULTIES, type Difficulty } from "../lib/difficulty";
import { entriesOf, wordOf, wordsOf, sizeOf, BLACK } from "../lib/mini";
import { LANGS, type Lang } from "../lib/i18n";

/**
 * Reads the shipped Mini banks and reports what is actually in them.
 *
 * Inspection only: it writes nothing and generates nothing. The point is to
 * see the fill before paying to clue it, since an unsolvable grid is not worth
 * a clue however good the clue is.
 *
 *   npx tsx scripts/inspect-mini.ts
 */

const DATA = join(process.cwd(), "public", "data");
const CACHE = join(process.cwd(), "scripts", ".cache");

/** How many Extrem grids to print per language. */
const SAMPLES = 5;

/** How many rare words to list per bank. */
const RAREST = 20;

function bank(lang: Lang, difficulty: Difficulty): string[] {
  const path = join(DATA, lang, `mini-${difficulty}.txt`);
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
}

function answersOf(lang: Lang): string[] {
  return decodeFrontCoded(readFileSync(join(DATA, lang, "answers.txt"), "utf8"));
}

/**
 * Rank among answers, ordered by corpus frequency, 1-based.
 *
 * Rebuilt exactly as scripts/build-wordlists.ts builds it: walk the 50k
 * frequency list in order, keep what survived into answers.txt, number them as
 * they appear. Same source, same order, so these are the same ranks the
 * difficulty score was cut from.
 */
function ranksOf(lang: Lang): Map<string, number> {
  const path = join(CACHE, `${lang}_50k.txt`);
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Run \`npm run data:fetch\` first.`);
  }
  const answers = new Set(answersOf(lang));
  const out = new Map<string, number>();
  const seen = new Set<string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const raw = line.split(" ")[0];
    if (!raw) continue;
    const w = normalise(raw);
    if (seen.has(w)) continue;
    seen.add(w);
    if (!answers.has(w)) continue;
    out.set(w, out.size + 1);
  }
  return out;
}

function render(grid: string): string[] {
  const size = sizeOf(grid);
  const rows: string[] = [];
  for (let r = 0; r < size; r++) {
    const cells: string[] = [];
    for (let c = 0; c < size; c++) {
      const ch = grid[r * size + c]!;
      cells.push(ch === BLACK ? "#" : ch.toUpperCase());
    }
    rows.push(`    ${cells.join(" ")}`);
  }
  return rows;
}

function rankLabel(word: string, ranks: Map<string, number>): string {
  const r = ranks.get(word);
  return r === undefined ? "unranked" : String(r);
}

function main(): void {
  const ranks = new Map<Lang, Map<string, number>>();
  for (const lang of LANGS) ranks.set(lang, ranksOf(lang));

  // --- Extrem grids, in full ------------------------------------------------
  for (const lang of LANGS) {
    const puzzles = bank(lang, "extreme");
    const r = ranks.get(lang)!;
    console.log(`\n${"=".repeat(66)}`);
    console.log(`EXTREM GRIDS — ${lang.toUpperCase()}  (${puzzles.length} in bank)`);
    console.log("=".repeat(66));

    for (let i = 0; i < SAMPLES; i++) {
      const idx = Math.floor((i * puzzles.length) / SAMPLES);
      const grid = puzzles[idx]!;
      console.log(`\n  #${idx}`);
      for (const row of render(grid)) console.log(row);

      const entries = entriesOf(grid);
      console.log("");
      for (const dir of ["across", "down"] as const) {
        const label = dir === "across" ? "Across" : "Down";
        const list = entries.filter((e) => e.direction === dir);
        console.log(`    ${label}`);
        for (const e of list) {
          const w = wordOf(grid, e);
          console.log(
            `      ${String(e.number).padStart(2)}  ${w.toUpperCase().padEnd(8)} rank ${rankLabel(w, r)}`,
          );
        }
      }
    }
  }

  // --- Rarest fill per bank -------------------------------------------------
  console.log(`\n${"=".repeat(66)}`);
  console.log("RAREST WORDS PER BANK");
  console.log("=".repeat(66));

  const everyWord = new Set<string>();
  for (const lang of LANGS) {
    const r = ranks.get(lang)!;
    for (const difficulty of DIFFICULTIES) {
      const puzzles = bank(lang, difficulty);
      const words = new Set<string>();
      for (const grid of puzzles) for (const w of wordsOf(grid)) words.add(w);
      for (const w of words) everyWord.add(`${lang}:${w}`);

      const sorted = [...words].sort(
        (a, b) => (r.get(b) ?? Infinity) - (r.get(a) ?? Infinity),
      );
      console.log(
        `\n  ${lang} ${difficulty}  —  ${puzzles.length} puzzles, ${words.size} distinct words`,
      );
      const worst = sorted.slice(0, RAREST);
      for (let i = 0; i < worst.length; i += 4) {
        const row = worst
          .slice(i, i + 4)
          .map((w) => `${w} (${rankLabel(w, r)})`.padEnd(24))
          .join("");
        console.log(`    ${row.trimEnd()}`);
      }
    }
  }

  // --- What a clue run would have to cover ----------------------------------
  console.log(`\n${"=".repeat(66)}`);
  const perLang = LANGS.map((lang) => {
    const n = [...everyWord].filter((k) => k.startsWith(`${lang}:`)).length;
    return `${lang} ${n}`;
  }).join(", ");
  console.log(`DISTINCT WORDS ACROSS ALL BANKS: ${everyWord.size}  (${perLang})`);
  console.log("=".repeat(66));
}

main();
