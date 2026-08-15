import { compareWords } from "./alphabet";
import {
  DIFFICULTIES,
  difficultyScore,
  neighbourCounts,
  passesEasyFilter,
  type Difficulty,
  type Scored,
} from "./difficulty";
import type { Lang } from "./i18n";

/**
 * The fill pool: the words Mini is allowed to build a grid out of.
 *
 * Every letter in a mini crossword is checked twice, once across and once
 * down, so one obscure word poisons two entries and the player has no way to
 * recover. Fill therefore comes from the frequency-ranked answer pool, never
 * from the full guess list. Guessing stays permissive; fill stays conservative.
 *
 * This is deliberately separate from Five's `answer-difficulty.bin`. Five bands
 * one length into two difficulties (5 -> Lätt/Medel, 6 -> Svår/Extrem). Mini
 * needs all four bands available at each of 3, 4 and 5 letters, because a
 * single grid mixes lengths. Reusing Five's file would mean either changing
 * Five's data or misreading it.
 */

export const FILL_LENGTHS = [3, 4, 5] as const;
export type FillLength = (typeof FILL_LENGTHS)[number];

export function isFillLength(n: number): n is FillLength {
  return (FILL_LENGTHS as readonly number[]).includes(n);
}

/**
 * Three letter words are where crosswords go bad: the pool is small, and its
 * tail is abbreviations, interjections and fragments that are technically
 * words and useless as clues. Only the commonest N at that length may enter a
 * grid; everything else stays perfectly guessable and never appears.
 *
 * The brief said 1,500. That is a no-op: there are only 670 three letter
 * Swedish answers and 602 English ones in total, so a cap of 1,500 admits the
 * whole tail, including `gps dvd usb abc tbc etc psi`, `sch aha oja åhå voj`
 * and `ssh duh yer moi ifs git guv`. 250 cuts at roughly corpus rank 5,000 in
 * both languages, which is where that tail starts.
 *
 * This is the one number to move if Mini's three letter entries feel wrong.
 */
export const THREE_LETTER_RANK_CAP = 250;

/**
 * No fill word may be rarer than this corpus rank, at any length or band.
 *
 * Measured, not guessed: the first banks drew Svår and Extrem from the bottom
 * 0.2% of the answer pool — rank 25,106 of 25,149 in Swedish, 24,437 of 24,487
 * in English — which is ISTER, AKTRE, GOLAR, BULOR on one side and CROUP,
 * YENS, LOUTS, TULLE on the other. Every one of those is checked twice in a
 * grid, so a single one of them takes two entries with it.
 *
 * Applied **after banding, to every band**, and the order is the whole point.
 *
 * Capping the pool first and banding the survivors looks equivalent and is not:
 * the shares are proportional, so removing the rarest 15% shrinks all four
 * bands by 15%, including the two that never held a word this rare. Measured,
 * that cost Swedish Medel 500 puzzles down to 266 — a bank ruined by a rule
 * aimed at a different bank. Banding first leaves easy and medium exactly as
 * they were and takes the tail out of hard and extreme, where it lives.
 *
 * Every band is filtered, not just hard and extreme, because bands are cut by
 * difficulty score rather than by rank: a rare word with gentle structure can
 * land mid-table, and Svår and Extrem both draw the `medium` band. Filtering
 * all four is what makes "no fill word is rarer than this" actually true.
 */
export const FILL_RANK_CAP = 20_000;

/**
 * Three letter fill drops interjections and abbreviations as a category, not a
 * frequency band. `hmm`, `shh`, `aha`, `pst`, `dvd` and `sms` are common enough
 * to survive any rank cut and useless as crossword entries: an interjection has
 * no definition to clue and an abbreviation has no letters to deduce.
 *
 * They stay perfectly guessable everywhere else. This gate applies to length 3
 * only, where the pool is small enough that a handful of them is a large share
 * of every grid.
 */
export interface ThreeLetterGate {
  /** Words the source tags as an interjection. Swedish only: SALDO's `in`. */
  interjections?: ReadonlySet<string>;
  /** Words the source tags as an abbreviation. */
  abbreviations?: ReadonlySet<string>;
  /**
   * English only, and the closest thing English has to an interjection tag.
   * SCOWL has no part of speech, but its size bands separate the two cleanly
   * at three letters: ordinary words sit at 10 to 35 (dog 10, cat 10, sea 20,
   * fox 35) and interjections at 40 to 55 (yep 40, duh 50, psst 50, ooh 55,
   * shh 55, nah 55, moi 55). Requiring band 35 or lower takes the category out.
   */
  bandOf?: ReadonlyMap<string, number>;
  maxBand?: number;
}

const VOWELS = "aeiouyåäö";

/**
 * A word with no vowel at all is an interjection or an abbreviation in both
 * languages, without exception at three letters: shh, hmm, pst, brr, tsk, tv.
 * This is the only interjection signal English has, since SCOWL carries no
 * part of speech.
 */
export function hasNoVowel(word: string): boolean {
  return ![...word].some((c) => VOWELS.includes(c));
}

export interface GateCounts {
  interjection: number;
  abbreviation: number;
  novowel: number;
  band: number;
}

/** Split a three letter list into what may be filled and what each rule took. */
export function applyThreeLetterGate(
  words: readonly string[],
  gate: ThreeLetterGate,
): { kept: string[]; removed: Map<string, string>; counts: GateCounts } {
  const kept: string[] = [];
  const removed = new Map<string, string>();
  const counts: GateCounts = {
    interjection: 0,
    abbreviation: 0,
    novowel: 0,
    band: 0,
  };

  for (const w of words) {
    const band = gate.bandOf?.get(w);
    if (gate.interjections?.has(w)) {
      removed.set(w, "interjection");
      counts.interjection++;
    } else if (gate.abbreviations?.has(w)) {
      removed.set(w, "abbreviation");
      counts.abbreviation++;
    } else if (hasNoVowel(w)) {
      removed.set(w, "no-vowel");
      counts.novowel++;
    } else if (
      gate.maxBand !== undefined &&
      (band === undefined || band > gate.maxBand)
    ) {
      removed.set(w, "band");
      counts.band++;
    } else {
      kept.push(w);
    }
  }
  return { kept, removed, counts };
}

/**
 * Share of each length's pool per band, easiest first. Extreme takes the rest.
 * Bands are cut inside one length, so a 3 letter "hard" is hard among three
 * letter words rather than hard against the whole language.
 */
export const FILL_SHARES: Record<Exclude<Difficulty, "extreme">, number> = {
  easy: 0.2,
  medium: 0.3,
  hard: 0.3,
};

/** A fill pool for one language: band members per length, each sorted. */
export type FillPool = Record<number, Record<Difficulty, string[]>>;

/**
 * Cut one length's scored pool into all four bands.
 *
 * Easy additionally requires the structural filter Five uses, so a common but
 * awkward word drops to medium rather than turning up in a beginner's grid.
 * Ties break on the word, so the result never depends on input order.
 */
export function bandPool(
  scored: readonly Scored[],
  lang: Lang,
): Map<string, Difficulty> {
  const sorted = [...scored].sort(
    (a, b) => a.score - b.score || (a.word < b.word ? -1 : 1),
  );

  const easyTarget = Math.round(sorted.length * FILL_SHARES.easy);
  const out = new Map<string, Difficulty>();
  const rest: string[] = [];

  let taken = 0;
  for (const s of sorted) {
    if (taken < easyTarget && passesEasyFilter(s.word, lang)) {
      out.set(s.word, "easy");
      taken++;
    } else {
      rest.push(s.word);
    }
  }

  const mediumTarget = Math.round(sorted.length * FILL_SHARES.medium);
  const hardTarget = Math.round(sorted.length * FILL_SHARES.hard);
  rest.forEach((word, i) => {
    if (i < mediumTarget) out.set(word, "medium");
    else if (i < mediumTarget + hardTarget) out.set(word, "hard");
    else out.set(word, "extreme");
  });

  return out;
}

/**
 * Build one language's fill pool from the answer list.
 *
 * `answers` must already have passed the answer-pool gate, so proper nouns,
 * multiword fragments, genitive-only forms, SCOWL obscurities and the crude
 * and name lists are gone before anything gets here. `rankOf` is the 0-based
 * position in the frequency-ordered answer list.
 */
export function buildFillPool(
  answers: readonly string[],
  rankOf: ReadonlyMap<string, number>,
  lang: Lang,
  gate: ThreeLetterGate = {},
): { pool: FillPool; gated: Map<string, string>; counts: GateCounts } {
  const pool: FillPool = {};
  let gated = new Map<string, string>();
  let counts: GateCounts = {
    interjection: 0,
    abbreviation: 0,
    novowel: 0,
    band: 0,
  };

  for (const length of FILL_LENGTHS) {
    // Frequency order first, so the three letter cap means "the commonest N
    // of this length" rather than an arbitrary slice.
    let words = answers
      .filter((w) => w.length === length)
      .sort((a, b) => rankOf.get(a)! - rankOf.get(b)!);

    if (length === 3) {
      // Category gate before the cap, so removing junk promotes real words
      // into the pool rather than shrinking it.
      const g = applyThreeLetterGate(words, gate);
      gated = g.removed;
      counts = g.counts;
      words = g.kept.slice(0, THREE_LETTER_RANK_CAP);
    }

    const neighbours = neighbourCounts(words);
    let maxRank = 1;
    for (const w of words) maxRank = Math.max(maxRank, rankOf.get(w)! + 1);

    const scored: Scored[] = words.map((word) => {
      const rank = rankOf.get(word)! + 1;
      const n = neighbours.get(word) ?? 0;
      return {
        word,
        rank,
        neighbours: n,
        score: difficultyScore({ word, lang, rank, maxRank, neighbours: n }),
      };
    });

    const bands = bandPool(scored, lang);
    const byBand: Record<Difficulty, string[]> = {
      easy: [],
      medium: [],
      hard: [],
      extreme: [],
    };
    for (const [word, band] of bands) {
      // The rank cap, applied to the banded result so the boundaries above are
      // the ones the full pool produced.
      if (rankOf.get(word)! + 1 > FILL_RANK_CAP) continue;
      byBand[band].push(word);
    }
    for (const band of DIFFICULTIES) {
      byBand[band].sort((a, b) => compareWords(a, b, lang));
    }
    pool[length] = byBand;
  }

  return { pool, gated, counts };
}

/** Every word a difficulty may use, across all three lengths. */
export function fillWords(
  pool: FillPool,
  bands: readonly Difficulty[],
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const length of FILL_LENGTHS) {
    const words: string[] = [];
    for (const band of bands) words.push(...(pool[length]?.[band] ?? []));
    out.set(length, words);
  }
  return out;
}

/**
 * Which bands each Mini difficulty draws from, so the step between
 * difficulties is a shift rather than a jump.
 *
 * Extrem takes every band, and that is a measured decision rather than a
 * preference. Its grid is a fully checked 5x5 — a double word square, every one
 * of the ten entries crossing every other — and those are rare. Yield of
 * distinct grids per attempt, English, before the rank cap existed:
 *
 *   hard + extreme          1,688 words    27%    42s per 120 attempts
 *   medium + hard + extreme 2,701 words    98%     8s
 *   all four bands          3,376 words    99%     4s
 *
 * It was widened to three bands for that reason. The rank cap and the
 * ambiguity check then took English Extrem to 36 puzzles at three bands, so it
 * is widened again, to all four.
 *
 * Extrem's difficulty is that every letter is checked twice and every entry has
 * to be pinned by its crossings, not that its words are rare — so drawing from
 * the gentle band costs it nothing it was selling. Svår keeps its black squares
 * to tell the two apart.
 */
export const MINI_FILL_BANDS: Record<Difficulty, readonly Difficulty[]> = {
  easy: ["easy", "medium"],
  medium: ["easy", "medium"],
  hard: ["medium", "hard"],
  extreme: ["easy", "medium", "hard", "extreme"],
};
