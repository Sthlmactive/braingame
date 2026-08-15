import type { Difficulty } from "./difficulty";
import type { Lang } from "./i18n";

/**
 * The clue bank, on the phone.
 *
 * One file per language and difficulty, fetched the first time that difficulty
 * is played and kept for the session. The format is one line per word, tab
 * separated: `word\tclue\tclue`.
 */

export interface CluePair {
  a: string;
  b: string;
}

export type ClueBank = Map<string, CluePair>;

const cache = new Map<string, Promise<ClueBank>>();

/** Overridable for tests, the same seam `lib/dictionary.ts` uses. */
let fetcher = async (path: string): Promise<string> => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`clues: ${path} returned ${response.status}`);
  return response.text();
};

export function setClueFetcher(fn: (path: string) => Promise<string>): void {
  fetcher = fn;
  cache.clear();
}

export function parseClues(text: string): ClueBank {
  const out: ClueBank = new Map();
  for (const line of text.split("\n")) {
    if (!line) continue;
    const [word, a, b] = line.split("\t");
    if (!word || !a) continue;
    out.set(word, { a, b: b || a });
  }
  return out;
}

export function loadClues(lang: Lang, difficulty: Difficulty): Promise<ClueBank> {
  const key = `${lang}:${difficulty}`;
  const found = cache.get(key);
  if (found) return found;
  const task = fetcher(`/data/${lang}/clues-${difficulty}.txt`).then(parseClues);
  cache.set(key, task);
  return task;
}

/**
 * Which of a word's two clues this puzzle uses.
 *
 * Chosen by the puzzle, not at random, so the same puzzle always reads the
 * same way — and so two entries in one grid can differ while a word met again
 * in a later puzzle reads differently.
 */
export function clueFor(bank: ClueBank, word: string, puzzleIndex: number): string {
  const pair = bank.get(word);
  if (!pair) return "";
  let hash = puzzleIndex;
  for (const ch of word) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 2 === 0 ? pair.a : pair.b;
}

export function clearClueCache(): void {
  cache.clear();
}
