import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareWords } from "../lib/alphabet";
import { DIFFICULTIES, type Difficulty } from "../lib/difficulty";
import { LANGS, type Lang } from "../lib/i18n";
import { wordsOf } from "../lib/mini";
import type { CachedClue } from "./generate-clues";

/**
 * Ship the clue bank to the phone, split by difficulty.
 *
 * The whole cache is 363 kB in Swedish and 328 kB in English, which is more
 * than the dictionary and the answer pool combined. A player only ever solves
 * one difficulty at a time, so each bank gets its own file and Lätt downloads
 * its ~680 words rather than all 5,200.
 *
 * The format is one line per word, tab separated: word, clue, clue. Not JSON —
 * the keys would be a third of the payload.
 *
 *   npx tsx scripts/ship-clues.ts
 */

const CLUE_DIR = join(process.cwd(), "data", "clues");
const OUT = join(process.cwd(), "public", "data");

function bankWords(lang: Lang, difficulty: Difficulty): Set<string> {
  const path = join(OUT, lang, `mini-${difficulty}.txt`);
  const out = new Set<string>();
  for (const grid of readFileSync(path, "utf8").split("\n").filter((l) => l.length)) {
    for (const w of wordsOf(grid)) out.add(w);
  }
  return out;
}

function main(): void {
  let missing = 0;

  for (const lang of LANGS) {
    const cachePath = join(CLUE_DIR, `${lang}.json`);
    if (!existsSync(cachePath)) throw new Error(`No clue cache at ${cachePath}`);
    const cache = JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, CachedClue>;

    for (const difficulty of DIFFICULTIES) {
      const words = [...bankWords(lang, difficulty)].sort((a, b) => compareWords(a, b, lang));
      const lines: string[] = [];
      const absent: string[] = [];

      for (const word of words) {
        const entry = cache[word];
        if (!entry || !entry.clue1) {
          absent.push(word);
          continue;
        }
        // Tabs and newlines would break the format; a clue containing one is a
        // generation bug, not something to escape around.
        const clean = (s: string): string => s.replace(/[\t\n\r]+/gu, " ").trim();
        lines.push(`${word}\t${clean(entry.clue1)}\t${clean(entry.clue2 || entry.clue1)}`);
      }

      const path = join(OUT, lang, `clues-${difficulty}.txt`);
      writeFileSync(path, `${lines.join("\n")}\n`);
      const kb = (Buffer.byteLength(lines.join("\n")) / 1024).toFixed(1);
      missing += absent.length;
      console.log(
        `  ${lang} ${difficulty.padEnd(8)} ${String(lines.length).padStart(4)} words  ${kb.padStart(6)} kB` +
          (absent.length ? `  MISSING ${absent.length}: ${absent.slice(0, 6).join(" ")}` : ""),
      );
    }
  }

  if (missing > 0) {
    throw new Error(
      `${missing} words in the banks have no clue. Run scripts/generate-clues.ts first.`,
    );
  }
}

main();
