import { ALPHABETS } from "@/lib/alphabet";
import type { Lang } from "@/lib/i18n";
import { shuffle, type Rng } from "@/lib/rng";

/**
 * Rush: a pool of tiles and your own connected crossword. Every word must be
 * valid, everything must connect, and every tile must be used.
 */

export const cellKey = (x: number, y: number): string => `${x},${y}`;

export function parseKey(key: string): [number, number] {
  const [x, y] = key.split(",");
  return [Number(x), Number(y)];
}

/** Placed letters, keyed by "x,y". */
export type Cells = Map<string, string>;

export interface Run {
  word: string;
  cells: string[];
  dir: "h" | "v";
}

/** Every horizontal and vertical run of two or more letters. */
export function runs(cells: Cells): Run[] {
  const out: Run[] = [];
  const seenH = new Set<string>();
  const seenV = new Set<string>();

  for (const key of cells.keys()) {
    const [x, y] = parseKey(key);

    if (!seenH.has(key) && !cells.has(cellKey(x - 1, y))) {
      const run: string[] = [];
      let cx = x;
      while (cells.has(cellKey(cx, y))) {
        run.push(cellKey(cx, y));
        seenH.add(cellKey(cx, y));
        cx++;
      }
      if (run.length > 1) {
        out.push({
          word: run.map((k) => cells.get(k)!).join(""),
          cells: run,
          dir: "h",
        });
      }
    }

    if (!seenV.has(key) && !cells.has(cellKey(x, y - 1))) {
      const run: string[] = [];
      let cy = y;
      while (cells.has(cellKey(x, cy))) {
        run.push(cellKey(x, cy));
        seenV.add(cellKey(x, cy));
        cy++;
      }
      if (run.length > 1) {
        out.push({
          word: run.map((k) => cells.get(k)!).join(""),
          cells: run,
          dir: "v",
        });
      }
    }
  }

  return out;
}

/** True when every placed tile is reachable from every other. */
export function isConnected(cells: Cells): boolean {
  if (cells.size <= 1) return true;
  const start = cells.keys().next().value!;
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const key = queue.pop()!;
    const [x, y] = parseKey(key);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as Array<[number, number]>) {
      const nk = cellKey(nx, ny);
      if (cells.has(nk) && !seen.has(nk)) {
        seen.add(nk);
        queue.push(nk);
      }
    }
  }
  return seen.size === cells.size;
}

export interface Validation {
  ok: boolean;
  allPlaced: boolean;
  connected: boolean;
  /** Runs that are not words, plus any lone tile that touches nothing. */
  invalidRuns: Run[];
  /** Single tiles that are not part of any run. */
  strayCells: string[];
}

export function validate(
  cells: Cells,
  totalTiles: number,
  isWord: (w: string) => boolean,
): Validation {
  const allPlaced = cells.size === totalTiles;
  const connected = isConnected(cells);
  const found = runs(cells);
  const invalidRuns = found.filter((r) => !isWord(r.word));

  const inRun = new Set<string>();
  for (const r of found) for (const k of r.cells) inRun.add(k);
  // A lone tile is only a problem once more than one tile is on the board.
  const strayCells =
    cells.size > 1 ? [...cells.keys()].filter((k) => !inRun.has(k)) : [];

  return {
    ok:
      allPlaced &&
      connected &&
      invalidRuns.length === 0 &&
      strayCells.length === 0 &&
      cells.size > 1,
    allPlaced,
    connected,
    invalidRuns,
    strayCells,
  };
}

// ---------------------------------------------------------------------------
// The tile bag
// ---------------------------------------------------------------------------

const VOWELS: Record<Lang, string[]> = {
  en: ["a", "e", "i", "o", "u"],
  // Swedish has nine, and leaving Å Ä Ö out of the bag would be wrong.
  sv: ["a", "e", "i", "o", "u", "y", "å", "ä", "ö"],
};

/** Rough letter frequencies, used to weight the bag towards playable tiles. */
const WEIGHTS: Record<Lang, Record<string, number>> = {
  en: {
    a: 82, b: 15, c: 28, d: 43, e: 127, f: 22, g: 20, h: 61, i: 70, j: 2,
    k: 8, l: 40, m: 24, n: 67, o: 75, p: 19, q: 1, r: 60, s: 63, t: 91,
    u: 28, v: 10, w: 24, x: 2, y: 20, z: 1,
  },
  sv: {
    a: 93, b: 13, c: 15, d: 47, e: 101, f: 20, g: 29, h: 21, i: 52, j: 6,
    k: 32, l: 52, m: 35, n: 88, o: 41, p: 18, q: 1, r: 84, s: 66, t: 77,
    u: 18, v: 24, w: 1, x: 2, y: 7, z: 1, å: 13, ä: 18, ö: 13,
  },
};

/**
 * Draw a bag. Low levels lean hard on vowels, because a consonant-heavy rack
 * is what makes a beginner give up.
 */
export function drawTiles(
  lang: Lang,
  count: number,
  vowelBias: number,
  rng: Rng,
): string[] {
  const weights = WEIGHTS[lang];
  const vowels = new Set(VOWELS[lang]);
  const pool: Array<{ letter: string; weight: number }> = [];
  for (const letter of ALPHABETS[lang]) {
    const base = weights[letter] ?? 1;
    pool.push({
      letter,
      weight: vowels.has(letter) ? base * vowelBias : base,
    });
  }
  const total = pool.reduce((s, p) => s + p.weight, 0);

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let r = rng() * total;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) {
        out.push(p.letter);
        break;
      }
    }
    if (out.length <= i) out.push(pool[0]!.letter);
  }

  // Guarantee a workable ratio rather than trusting the dice.
  const minVowels = Math.max(2, Math.floor(count * 0.3));
  let have = out.filter((l) => vowels.has(l)).length;
  const vowelList = [...vowels];
  for (let i = 0; i < out.length && have < minVowels; i++) {
    if (!vowels.has(out[i]!)) {
      out[i] = vowelList[Math.floor(rng() * vowelList.length)]!;
      have++;
    }
  }

  return shuffle(out, rng);
}

export function scoreRush({
  solved,
  tiles,
  timeMs,
  placed,
}: {
  solved: boolean;
  tiles: number;
  timeMs: number;
  placed: number;
}): number {
  // Partial credit for tiles that made it into valid words.
  if (!solved) return placed * 8;
  const speed = Math.max(0, 420 - Math.floor(timeMs / 1000)) * 2;
  return tiles * 30 + speed;
}
