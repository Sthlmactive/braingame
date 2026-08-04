import { Dawg, type SearchOptions } from "./dawg";
import { ALPHABETS, normalise } from "./alphabet";
import { BAND_NAMES, type Band } from "./bands";
import type { Lang } from "./i18n";
import { mulberry32, randomSeed, type Rng } from "./rng";

/**
 * The single door to the word data. Nothing else in the app reads
 * public/data directly.
 *
 * A language is three files: a packed DAWG for validity and letter searches,
 * a front coded answer pool, and one band byte per answer. Loading is lazy and
 * per language, so choosing Swedish never downloads English.
 */

export interface LangMeta {
  lang: Lang;
  dictWords: number;
  answerWords: number;
  minAnswerLength: number;
  maxAnswerLength: number;
  maxWordLength: number;
  counts: Record<string, Record<Band, number>>;
  sources: string[];
}

export interface LanguageData {
  lang: Lang;
  dawg: Dawg;
  /** Alphabetical. Position matches `bands`. */
  answers: string[];
  bands: Uint8Array;
  meta: LangMeta;
  /** answers positions grouped by length, built once at load. */
  byLength: Map<number, number[]>;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export type Fetcher = (path: string) => Promise<ArrayBuffer>;

let fetcher: Fetcher = async (path) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`dictionary: ${res.status} for ${path}`);
  return res.arrayBuffer();
};

/** Tests and build scripts read from disk instead of the network. */
export function setFetcher(fn: Fetcher): void {
  fetcher = fn;
}

const cache = new Map<Lang, LanguageData>();
const inflight = new Map<Lang, Promise<LanguageData>>();

/** Undo the front coding written by scripts/build-wordlists.ts. */
export function decodeFrontCoded(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  const out: string[] = new Array(lines.length);
  let prev = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const shared = parseInt(line[0]!, 36);
    const word = prev.slice(0, shared) + line.slice(1);
    out[i] = word;
    prev = word;
  }
  return out;
}

export async function loadLanguage(lang: Lang): Promise<LanguageData> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const pending = inflight.get(lang);
  if (pending) return pending;

  const task = (async (): Promise<LanguageData> => {
    const base = `/data/${lang}`;
    const [dictBuf, answersBuf, bandsBuf, metaBuf] = await Promise.all([
      fetcher(`${base}/dict.bin`),
      fetcher(`${base}/answers.txt`),
      fetcher(`${base}/answer-bands.bin`),
      fetcher(`${base}/meta.json`),
    ]);

    const dawg = Dawg.fromBuffer(dictBuf);
    const answers = decodeFrontCoded(new TextDecoder().decode(answersBuf));
    const bands = new Uint8Array(bandsBuf);
    const meta = JSON.parse(new TextDecoder().decode(metaBuf)) as LangMeta;

    if (answers.length !== bands.length) {
      throw new Error(
        `dictionary: ${lang} has ${answers.length} answers but ${bands.length} band bytes`,
      );
    }

    const byLength = new Map<number, number[]>();
    answers.forEach((w, i) => {
      const list = byLength.get(w.length);
      if (list) list.push(i);
      else byLength.set(w.length, [i]);
    });

    const data: LanguageData = { lang, dawg, answers, bands, meta, byLength };
    cache.set(lang, data);
    inflight.delete(lang);
    return data;
  })();

  inflight.set(lang, task);
  try {
    return await task;
  } catch (err) {
    inflight.delete(lang);
    throw err;
  }
}

/** Synchronous accessor for code that already awaited `loadLanguage`. */
export function getLanguage(lang: Lang): LanguageData {
  const data = cache.get(lang);
  if (!data) throw new Error(`dictionary: ${lang} is not loaded yet`);
  return data;
}

export function isLoaded(lang: Lang): boolean {
  return cache.has(lang);
}

/** Test and hot-reload hook. */
export function clearCache(): void {
  cache.clear();
  inflight.clear();
}

// ---------------------------------------------------------------------------
// The API everything else in the app uses
// ---------------------------------------------------------------------------

/** Lookup is on the normalised form; Å Ä Ö are never folded to A and O. */
export function isValidWord(word: string, lang: Lang): boolean {
  const data = cache.get(lang);
  if (!data) return false;
  return data.dawg.has(normalise(word));
}

const BAND_INDEX: Record<Band, number> = Object.fromEntries(
  BAND_NAMES.map((b, i) => [b, i]),
) as Record<Band, number>;

/** Every answer of a given length inside a band. */
export function answerPool(lang: Lang, length: number, band: Band): string[] {
  const data = getLanguage(lang);
  const positions = data.byLength.get(length);
  if (!positions) return [];
  const cutoff = BAND_INDEX[band];
  const out: string[] = [];
  for (const i of positions) {
    if (data.bands[i]! <= cutoff) out.push(data.answers[i]!);
  }
  return out;
}

export function poolSize(lang: Lang, length: number, band: Band): number {
  const data = cache.get(lang);
  if (!data) return 0;
  const positions = data.byLength.get(length);
  if (!positions) return 0;
  const cutoff = BAND_INDEX[band];
  let n = 0;
  for (const i of positions) if (data.bands[i]! <= cutoff) n++;
  return n;
}

/**
 * A random answer. Returns null rather than throwing when a band and length
 * combination is empty, so callers can widen the band instead of crashing.
 */
export function randomWord(
  lang: Lang,
  length: number,
  band: Band,
  rng: Rng = mulberry32(randomSeed()),
): string | null {
  const data = cache.get(lang);
  if (!data) return null;
  const positions = data.byLength.get(length);
  if (!positions || positions.length === 0) return null;
  const cutoff = BAND_INDEX[band];

  // Reservoir sample so no intermediate array is built for the common case.
  let chosen: string | null = null;
  let seen = 0;
  for (const i of positions) {
    if (data.bands[i]! > cutoff) continue;
    seen++;
    if (rng() < 1 / seen) chosen = data.answers[i]!;
  }
  return chosen;
}

/** Every dictionary word that can be spelled from `letters`. */
export function wordsFromLetters(
  letters: string,
  lang: Lang,
  opts: SearchOptions = {},
): string[] {
  const data = cache.get(lang);
  if (!data) return [];
  return data.dawg.wordsFromLetters(normalise(letters), opts);
}

/** Words matching a template where `.` stands for any letter. */
export function wordsMatching(
  pattern: string,
  lang: Lang,
  limit?: number,
): string[] {
  const data = cache.get(lang);
  if (!data) return [];
  return data.dawg.matchPattern(normalise(pattern), limit);
}

/** True when at least one word starts with this prefix. Used by generators. */
export function hasPrefix(prefix: string, lang: Lang): boolean {
  const data = cache.get(lang);
  if (!data) return false;
  return data.dawg.hasPrefix(normalise(prefix));
}

export function alphabet(lang: Lang): readonly string[] {
  return ALPHABETS[lang];
}

export function languageMeta(lang: Lang): LangMeta {
  return getLanguage(lang).meta;
}
