import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  answerPool,
  loadLanguage,
  setFetcher,
  wordsFromLetters,
} from "../lib/dictionary";
import { getLanguage } from "../lib/dictionary";
import { LANGS, type Lang } from "../lib/i18n";
import { LEVELS, type Level } from "../lib/games";
import { gridConfig, loopConfig } from "../lib/levels";
import { hashSeed, mulberry32, shuffle, type Rng } from "../lib/rng";
import { findWordSquare } from "./lib/wordsquare";
import {
  canPlace,
  layout,
  measure,
  normalise,
  type Dir,
  type LoopBoard,
  type Placement,
} from "../games/loop/board";

/**
 * Generates the puzzles that are too expensive to build on a phone:
 *
 *   Grid levels 9 and 10  5x5 squares where the columns are words too.
 *   Loop, every level     at least 20 crossword boards per language.
 *
 * Output lands in public/data/<lang>/ as static JSON.
 */

setFetcher(async (path) => {
  const buf = readFileSync(join(process.cwd(), "public", path));
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
});

const OUT = join(process.cwd(), "public", "data");
const LOOP_BOARDS_PER_LEVEL = 20;
const GRID_SQUARES = 24;

// ---------------------------------------------------------------------------
// Grid: word squares for levels 9 and 10
// ---------------------------------------------------------------------------

function buildSquares(lang: Lang, rng: Rng): string[][] {
  const dawg = getLanguage(lang).dawg;
  // Rows come from the answer pool so the words are ones a player knows;
  // the columns only have to be real, which the dictionary decides.
  const pool = answerPool(lang, 5, gridConfig(9).band);
  const squares: string[][] = [];
  const seen = new Set<string>();

  let attempts = 0;
  while (squares.length < GRID_SQUARES && attempts < GRID_SQUARES * 8) {
    attempts++;
    const square = findWordSquare(pool, dawg, rng, 5, 4000);
    if (!square) continue;
    const key = square.join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    squares.push(square);
    process.stdout.write(`\r  ${lang} squares: ${squares.length}/${GRID_SQUARES}`);
  }
  process.stdout.write("\n");
  return squares;
}

// ---------------------------------------------------------------------------
// Loop: crossword boards
// ---------------------------------------------------------------------------

const commonCache = new Map<Lang, Set<string>>();

/** Every reasonably common word of a length Loop can use. */
function commonWords(lang: Lang): Set<string> {
  const cached = commonCache.get(lang);
  if (cached) return cached;
  const set = new Set<string>();
  for (let len = 3; len <= 8; len++) {
    for (const w of answerPool(lang, len, "top20k")) set.add(w);
  }
  commonCache.set(lang, set);
  return set;
}

function buildBoard(
  lang: Lang,
  wheelSize: number,
  slots: number,
  rng: Rng,
): LoopBoard | null {
  // The wheel is the letters of one real word, so a full-length answer always
  // exists on the board. A repeated letter is fine, and at eight letters it is
  // close to unavoidable.
  const seeds = answerPool(lang, wheelSize, "full").filter(
    (w) => new Set(w).size >= Math.min(wheelSize, 5),
  );
  if (seeds.length === 0) return null;
  const seed = seeds[Math.floor(rng() * seeds.length)]!;
  const wheel = [...seed];

  // Board slots must be words a player will actually think of, so they come
  // from the common answer pool. Anything else valid still counts as a bonus
  // word at runtime, which is where the obscure ones belong.
  const common = commonWords(lang);
  const candidates = wordsFromLetters(wheel.join(""), lang, {
    minLength: 3,
    maxLength: wheelSize,
  }).filter((w) => common.has(w));
  if (candidates.length < slots) return null;

  // Longest first: a long spine gives the shorter words somewhere to cross.
  const ordered = shuffle([...candidates], rng).sort((a, b) => b.length - a.length);

  const placed: Placement[] = [];
  const cells = new Map<string, string>();

  const first = ordered[0]!;
  placed.push({ word: first, x: 0, y: 0, dir: "h" });
  for (let i = 0; i < first.length; i++) cells.set(`${i},0`, first[i]!);

  for (const word of ordered.slice(1)) {
    if (placed.length >= slots) break;
    if (placed.some((p) => p.word === word)) continue;

    let done = false;
    // Try to hang the word off every letter already on the board.
    for (const anchor of shuffle([...placed], rng)) {
      if (done) break;
      const dir: Dir = anchor.dir === "h" ? "v" : "h";
      for (let ai = 0; ai < anchor.word.length && !done; ai++) {
        const ax = anchor.dir === "h" ? anchor.x + ai : anchor.x;
        const ay = anchor.dir === "v" ? anchor.y + ai : anchor.y;
        for (let wi = 0; wi < word.length && !done; wi++) {
          if (word[wi] !== anchor.word[ai]) continue;
          const x = dir === "h" ? ax - wi : ax;
          const y = dir === "v" ? ay - wi : ay;
          if (!canPlace(cells, word, x, y, dir, true)) continue;
          placed.push({ word, x, y, dir });
          for (let i = 0; i < word.length; i++) {
            const cx = dir === "h" ? x + i : x;
            const cy = dir === "v" ? y + i : y;
            cells.set(`${cx},${cy}`, word[i]!);
          }
          done = true;
        }
      }
    }
  }

  if (placed.length < slots) return null;

  const words = normalise(placed);
  const { width, height } = measure(words);
  // A board wider than this needs pinch zoom on an iPhone SE, which the whole
  // app is meant to avoid.
  if (width > 13 || height > 13) return null;
  // Sanity: the layout must not have lost a letter to a collision.
  if (layout(words).size === 0) return null;

  return { wheel: wheel.join(""), words, width, height };
}

function buildLoopLevel(lang: Lang, level: Level, rng: Rng): LoopBoard[] {
  const cfg = loopConfig(level);
  const boards: LoopBoard[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  const maxAttempts = LOOP_BOARDS_PER_LEVEL * 400;

  while (boards.length < LOOP_BOARDS_PER_LEVEL && attempts < maxAttempts) {
    attempts++;
    const b = buildBoard(lang, cfg.wheelLetters, cfg.slots, rng);
    if (!b) continue;
    const key = b.words
      .map((w) => `${w.word}${w.x},${w.y}${w.dir}`)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    boards.push(b);
  }
  return boards;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  for (const lang of LANGS) {
    await loadLanguage(lang);
    const dir = join(OUT, lang);
    mkdirSync(dir, { recursive: true });

    console.log(`\n${lang}: word squares for Grid 9 and 10`);
    const squares = buildSquares(lang, mulberry32(hashSeed(`grid-${lang}`)));
    if (squares.length === 0) {
      throw new Error(`No word squares found for ${lang}; Grid 9 and 10 would be unplayable.`);
    }
    writeFileSync(
      join(dir, "grid-squares.json"),
      JSON.stringify({ lang, squares }),
    );
    console.log(`  wrote ${squares.length} squares`);

    console.log(`${lang}: Loop boards`);
    const loop: Record<number, LoopBoard[]> = {};
    for (const level of LEVELS) {
      const boards = buildLoopLevel(
        lang,
        level,
        mulberry32(hashSeed(`loop-${lang}-${level}`)),
      );
      loop[level] = boards;
      const cfg = loopConfig(level);
      process.stdout.write(
        `\r  level ${String(level).padStart(2)}: ${String(boards.length).padStart(2)} boards ` +
          `(${cfg.wheelLetters} letters, ${cfg.slots} slots)   `,
      );
      if (boards.length < LOOP_BOARDS_PER_LEVEL) {
        console.log(
          `\n  ! only ${boards.length} boards for ${lang} level ${level}, wanted ${LOOP_BOARDS_PER_LEVEL}`,
        );
      }
    }
    process.stdout.write("\n");
    writeFileSync(join(dir, "loop-boards.json"), JSON.stringify({ lang, loop }));
  }
  console.log("\nDone.");
}

void main();
