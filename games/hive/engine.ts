import { answerPool, wordsFromLetters } from "@/lib/dictionary";
import type { Lang } from "@/lib/i18n";
import type { HiveConfig } from "@/lib/levels";
import { compareWords } from "@/lib/alphabet";
import { shuffle, type Rng } from "@/lib/rng";

/**
 * Hive: seven letters in a honeycomb, the centre one required in every word.
 * A pangram uses all seven.
 */

export interface HivePuzzle {
  centre: string;
  /** The six outer letters, already shuffled. */
  outer: string[];
  /** All seven, centre first. */
  letters: string[];
  /** Every valid word, sorted. */
  answers: string[];
  pangrams: string[];
  maxScore: number;
  minLength: number;
}

/** Spelling Bee scoring: the shortest allowed word is one point, then length. */
export function wordScore(word: string, minLength: number, letters: string[]): number {
  const base = word.length === minLength ? 1 : word.length;
  return base + (isPangram(word, letters) ? 7 : 0);
}

export function isPangram(word: string, letters: string[]): boolean {
  const used = new Set(word);
  return letters.every((l) => used.has(l));
}

export function totalScore(
  words: string[],
  minLength: number,
  letters: string[],
): number {
  return words.reduce((sum, w) => sum + wordScore(w, minLength, letters), 0);
}

const MAX_WORD = 12;

/**
 * Build a puzzle that is guaranteed to be playable: at least one pangram
 * exists and at least twenty valid words do, checked before it is served.
 */
export function generateHive(
  lang: Lang,
  cfg: HiveConfig,
  rng: Rng,
  attempts = 220,
): HivePuzzle | null {
  const seeds = pangramSeeds(lang);
  if (seeds.length === 0) return null;
  shuffle(seeds, rng);

  let best: HivePuzzle | null = null;

  for (let i = 0; i < Math.min(attempts, seeds.length); i++) {
    const letters = seeds[i]!;
    // Try each of the seven as the centre; a bad centre can starve a good set.
    const order = shuffle([...letters], rng);
    for (const centre of order) {
      const answers = wordsFromLetters(letters.join(""), lang, {
        minLength: cfg.minLength,
        maxLength: MAX_WORD,
        required: centre,
        allowRepeats: true,
      }).sort((a, b) => compareWords(a, b, lang));

      const pangrams = answers.filter((w) => isPangram(w, letters));
      // The two guarantees the game promises.
      if (pangrams.length === 0 || answers.length < 20) continue;

      const puzzle: HivePuzzle = {
        centre,
        outer: shuffle(
          letters.filter((l) => l !== centre),
          rng,
        ),
        letters,
        answers,
        pangrams,
        maxScore: totalScore(answers, cfg.minLength, letters),
        minLength: cfg.minLength,
      };

      // Prefer a set close to the level's target size rather than the first
      // one that merely qualifies.
      if (
        best === null ||
        Math.abs(answers.length - cfg.targetAnswers) <
          Math.abs(best.answers.length - cfg.targetAnswers)
      ) {
        best = puzzle;
      }
      if (Math.abs(answers.length - cfg.targetAnswers) <= 5) return puzzle;
    }
  }

  return best;
}

const seedCache = new Map<Lang, string[][]>();

/**
 * Every answer-pool word with exactly seven distinct letters. These are the
 * only letter sets that can contain a pangram, so they are the only sets worth
 * trying.
 */
export function pangramSeeds(lang: Lang): string[][] {
  const cached = seedCache.get(lang);
  if (cached) return cached.map((s) => [...s]);

  const seen = new Set<string>();
  const out: string[][] = [];
  for (let len = 7; len <= 8; len++) {
    for (const word of answerPool(lang, len, "top20k")) {
      const distinct = new Set(word);
      if (distinct.size !== 7) continue;
      const letters = [...distinct].sort();
      const key = letters.join("");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(letters);
    }
  }
  seedCache.set(lang, out);
  return out.map((s) => [...s]);
}

export function clearHiveSeedCache(): void {
  seedCache.clear();
}

export type SubmitResult =
  | { ok: true; word: string; score: number; pangram: boolean }
  | { ok: false; reason: "tooShort" | "missingCentre" | "notAWord" | "alreadyFound" };

export function submitWord(
  raw: string,
  puzzle: HivePuzzle,
  found: ReadonlySet<string>,
): SubmitResult {
  const word = raw.toLowerCase();
  if (word.length < puzzle.minLength) return { ok: false, reason: "tooShort" };
  if (!word.includes(puzzle.centre)) return { ok: false, reason: "missingCentre" };
  if (found.has(word)) return { ok: false, reason: "alreadyFound" };
  if (!puzzle.answers.includes(word)) return { ok: false, reason: "notAWord" };
  return {
    ok: true,
    word,
    score: wordScore(word, puzzle.minLength, puzzle.letters),
    pangram: isPangram(word, puzzle.letters),
  };
}

export function hasCleared(
  score: number,
  puzzle: HivePuzzle,
  cfg: HiveConfig,
  foundPangram: boolean,
): boolean {
  const needed = Math.ceil((puzzle.maxScore * cfg.scoreToClear) / 100);
  if (cfg.requirePangram && !foundPangram) return false;
  return score >= needed;
}
