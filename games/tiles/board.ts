import type { Lang } from "@/lib/i18n";

/** Tiles: a 15 by 15 board, premium squares, and a distribution per language. */

export const SIZE = 15;
export const RACK_SIZE = 7;
export const CENTRE = 7;
export const BINGO_BONUS = 50;

export type Premium = "." | "d" | "t" | "D" | "T";

/**
 * The standard layout. Lower case doubles or triples a letter, upper case does
 * the same to the whole word. The centre star is a double word square.
 */
const LAYOUT = [
  "T..d...T...d..T",
  ".D...t...t...D.",
  "..D...d.d...D..",
  "d..D...d...D..d",
  "....D.....D....",
  ".t...t...t...t.",
  "..d...d.d...d..",
  "T..d...D...d..T",
  "..d...d.d...d..",
  ".t...t...t...t.",
  "....D.....D....",
  "d..D...d...D..d",
  "..D...d.d...D..",
  ".D...t...t...D.",
  "T..d...T...d..T",
];

export function premiumAt(r: number, c: number): Premium {
  return (LAYOUT[r]?.[c] ?? ".") as Premium;
}

export interface Distribution {
  /** Letter to how many tiles are in the bag. */
  counts: Record<string, number>;
  /** Letter to points. A blank is always worth nothing. */
  values: Record<string, number>;
  blanks: number;
}

/**
 * English: the standard 100 tile set.
 */
const EN: Distribution = {
  counts: {
    a: 9, b: 2, c: 2, d: 4, e: 12, f: 2, g: 3, h: 2, i: 9, j: 1,
    k: 1, l: 4, m: 2, n: 6, o: 8, p: 2, q: 1, r: 6, s: 4, t: 6,
    u: 4, v: 2, w: 2, x: 1, y: 2, z: 1,
  },
  values: {
    a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8,
    k: 5, l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1,
    u: 1, v: 4, w: 4, x: 8, y: 4, z: 10,
  },
  blanks: 2,
};

/**
 * Swedish: its own 100 tile set, not the English one with three letters bolted
 * on. Å, Ä and Ö are real tiles; there is no W and no Q, because Swedish
 * Scrabble has neither, and the values follow Swedish letter frequency (U and
 * Ö are expensive, K and M are not).
 */
const SV: Distribution = {
  counts: {
    a: 8, b: 2, c: 1, d: 5, e: 7, f: 2, g: 3, h: 2, i: 5, j: 1,
    k: 3, l: 5, m: 3, n: 6, o: 5, p: 2, r: 8, s: 8, t: 8, u: 3,
    v: 2, x: 1, y: 1, z: 1, å: 2, ä: 2, ö: 2,
  },
  values: {
    a: 1, b: 4, c: 10, d: 1, e: 1, f: 4, g: 2, h: 3, i: 1, j: 8,
    k: 3, l: 1, m: 3, n: 1, o: 2, p: 4, r: 1, s: 1, t: 1, u: 4,
    v: 3, x: 8, y: 7, z: 10, å: 4, ä: 4, ö: 4,
  },
  blanks: 2,
};

export const DISTRIBUTIONS: Record<Lang, Distribution> = { en: EN, sv: SV };

export const BLANK = "?";

export function letterValue(letter: string, lang: Lang): number {
  if (letter === BLANK) return 0;
  return DISTRIBUTIONS[lang].values[letter] ?? 0;
}

/** The full bag for a language, unshuffled. */
export function buildBag(lang: Lang): string[] {
  const d = DISTRIBUTIONS[lang];
  const bag: string[] = [];
  for (const [letter, n] of Object.entries(d.counts)) {
    for (let i = 0; i < n; i++) bag.push(letter);
  }
  for (let i = 0; i < d.blanks; i++) bag.push(BLANK);
  return bag;
}

export function bagSize(lang: Lang): number {
  return buildBag(lang).length;
}
