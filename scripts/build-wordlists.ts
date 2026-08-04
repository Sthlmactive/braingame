import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { join } from "node:path";
import { buildDawg } from "./lib/dawg-build";
import { ALPHABETS, compareWords, isAlphabetic, normalise } from "../lib/alphabet";
import type { Lang } from "../lib/i18n";
import { BAND_NAMES, BAND_LIMITS } from "../lib/bands";

/**
 * Turns the two verified upstream sources into the data the app ships.
 *
 *   English validity  SCOWL, via the `wordlist-english` package.
 *                     Kevin Atkinson's permissive SCOWL licence.
 *   Swedish validity  SALDO morphology (Språkbanken, Göteborgs universitet),
 *                     CC BY 4.0. Full inflected word forms with POS tags.
 *   Frequency, both   OpenSubtitles 2018 counts from hermitdave/FrequencyWords,
 *                     MIT. Used only to rank words into difficulty bands.
 *
 * Run `npm run data:fetch` first; the raw sources live in scripts/.cache and
 * are never committed.
 */

const CACHE = join(process.cwd(), "scripts", ".cache");
const OUT = join(process.cwd(), "public", "data");

/** Swedish compounds are effectively infinite, so they are capped here. */
const MAX_LEN: Record<Lang, number> = { en: 15, sv: 9 };
const MIN_LEN = 2;

/**
 * Games only ever ask for answers between these lengths. Nine is the top
 * because Ordoku's 9x9 board needs a nine letter word for its diagonal.
 */
const ANSWER_MIN = 3;
const ANSWER_MAX = 9;

// ---------------------------------------------------------------------------
// English: SCOWL size bands 10 to 70, British and American spellings together.
// ---------------------------------------------------------------------------

const SCOWL_SIZES = [10, 20, 35, 40, 50, 55, 60, 70] as const;

function loadEnglish(): Set<string> {
  const out = new Set<string>();
  for (const size of SCOWL_SIZES) {
    for (const variant of ["english", "american", "british"]) {
      const path = join(
        process.cwd(),
        "node_modules",
        "wordlist-english",
        `${variant}-words-${size}.json`,
      );
      if (!existsSync(path)) continue;
      const words = JSON.parse(readFileSync(path, "utf8")) as string[];
      for (const raw of words) {
        // Proper nouns keep their capital in SCOWL, so this drops them, and
        // abbreviations and possessives are dropped by the alphabetic test.
        if (raw !== raw.toLowerCase()) continue;
        const w = normalise(raw);
        if (!isAlphabetic(w, "en")) continue;
        if (w.length < MIN_LEN || w.length > MAX_LEN.en) continue;
        out.add(w);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Swedish: SALDO morphology. Streamed, because the XML is 254 MB.
// ---------------------------------------------------------------------------

/**
 * SALDO part of speech tags we refuse. `pm` and `pmm` are proper nouns, and
 * the compound-segment tags are word fragments rather than words.
 */
const SV_POS_BLOCK = new Set(["pm", "pmm", "mxc", "sxc", "mxs", "ssm"]);

/**
 * Morphosyntactic descriptors that mark a fragment rather than a usable word:
 * `c` and `sms` are compounding forms such as "fort-".
 */
const SV_MSD_BLOCK = new Set(["c", "sms", "ci", "cm"]);

async function loadSwedish(): Promise<Set<string>> {
  const path = join(CACHE, "saldom.xml");
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}. Run \`npm run data:fetch\` to download the sources.`,
    );
  }

  const out = new Set<string>();
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let pos = "";
  let inLemma = false;
  let pendingForm: string | null = null;
  // SALDO writes writtenForm *before* partOfSpeech inside a Lemma, so the
  // lemma has to be held back until its tag is known or proper nouns slip in.
  let pendingLemma: string | null = null;

  const feat = /<feat att="(\w+)" val="([^"]*)"\s*\/>/;

  const accept = (form: string): void => {
    // Swedish does not capitalise common nouns, so a capital here means a
    // proper noun. This catches the ones whose POS tag says otherwise.
    if (form !== form.toLowerCase()) return;
    const w = normalise(form);
    if (!isAlphabetic(w, "sv")) return;
    if (w.length < MIN_LEN || w.length > MAX_LEN.sv) return;
    out.add(w);
  };

  for await (const line of rl) {
    if (line.includes("<LexicalEntry>")) {
      pos = "";
      pendingForm = null;
      pendingLemma = null;
      continue;
    }
    if (line.includes("<Lemma>")) {
      inLemma = true;
      continue;
    }
    if (line.includes("</Lemma>")) {
      inLemma = false;
      pendingLemma = null;
      continue;
    }
    if (line.includes("<WordForm>")) {
      pendingForm = null;
      continue;
    }

    const m = feat.exec(line);
    if (!m) continue;
    const att = m[1]!;
    const val = m[2]!;

    if (att === "partOfSpeech") {
      pos = val;
      // Now the held-back lemma can be judged.
      if (pendingLemma !== null) {
        if (!SV_POS_BLOCK.has(pos)) accept(pendingLemma);
        pendingLemma = null;
      }
      continue;
    }
    if (att === "writtenForm") {
      if (inLemma) {
        pendingForm = null;
        pendingLemma = val;
      } else {
        pendingForm = val;
      }
      continue;
    }
    if (att === "msd" && pendingForm !== null) {
      if (!SV_POS_BLOCK.has(pos) && !SV_MSD_BLOCK.has(val)) accept(pendingForm);
      pendingForm = null;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Frequency ranking
// ---------------------------------------------------------------------------

function loadFrequency(lang: Lang): string[] {
  const path = join(CACHE, `${lang}_50k.txt`);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}. Run \`npm run data:fetch\` to download the sources.`,
    );
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const word = line.split(" ")[0];
    if (!word) continue;
    const w = normalise(word);
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * Front coded word list: each line is a shared-prefix length followed by the
 * new suffix. Sorted input plus gzip makes this very small, and decoding is a
 * single pass with no parser.
 */
function frontCode(words: string[]): string {
  const parts: string[] = [];
  let prev = "";
  for (const w of words) {
    let shared = 0;
    const max = Math.min(prev.length, w.length, 35);
    while (shared < max && prev[shared] === w[shared]) shared++;
    // Base 36 keeps the prefix length to one character.
    parts.push(shared.toString(36) + w.slice(shared));
    prev = w;
  }
  return parts.join("\n");
}

interface LangReport {
  lang: Lang;
  dictWords: number;
  dictBytes: number;
  dictGzip: number;
  answerWords: number;
  answersBytes: number;
  answersGzip: number;
  totalGzip: number;
}

function emit(
  lang: Lang,
  validity: Set<string>,
  frequency: string[],
): LangReport {
  const dir = join(OUT, lang);
  mkdirSync(dir, { recursive: true });
  const alphabet = ALPHABETS[lang];

  // --- Validity dictionary ------------------------------------------------
  const dict = buildDawg(validity, alphabet);
  writeFileSync(join(dir, "dict.bin"), dict.buffer);

  // --- Answer pool --------------------------------------------------------
  // Ranked by real corpus frequency, then intersected with the dictionary so
  // corpus noise (names, typos, foreign words) never becomes a puzzle answer.
  const answers: string[] = [];
  const rankOf = new Map<string, number>();
  for (const w of frequency) {
    if (!validity.has(w)) continue;
    if (w.length < ANSWER_MIN || w.length > ANSWER_MAX) continue;
    if (rankOf.has(w)) continue;
    rankOf.set(w, answers.length);
    answers.push(w);
  }

  // Each answer carries the narrowest band it belongs to, as a single byte.
  // That is all the runtime needs: band "top10k" is every word whose band id
  // is at or below top10k's. A whole rank permutation would cost far more and
  // buy nothing, and a run of small repeated integers gzips to almost nothing.
  const bandIdOf = (rank: number): number => {
    for (let i = 0; i < BAND_NAMES.length; i++) {
      const limit = BAND_LIMITS[BAND_NAMES[i]!];
      if (limit === null || rank < limit) return i;
    }
    return BAND_NAMES.length - 1;
  };

  // Sorted alphabetically so front coding has long shared prefixes to strip.
  const sortedAnswers = [...answers].sort((a, b) => compareWords(a, b, lang));
  const answersBuf = Buffer.from(frontCode(sortedAnswers), "utf8");
  writeFileSync(join(dir, "answers.txt"), answersBuf);

  const bands = Buffer.alloc(sortedAnswers.length);
  sortedAnswers.forEach((w, i) => {
    bands[i] = bandIdOf(rankOf.get(w)!);
  });
  writeFileSync(join(dir, "answer-bands.bin"), bands);

  // Counts per length and band, so the app can tell up front whether a level
  // is servable rather than discovering it mid game.
  const counts: Record<number, Record<string, number>> = {};
  for (let len = ANSWER_MIN; len <= ANSWER_MAX; len++) {
    counts[len] = {};
    for (let b = 0; b < BAND_NAMES.length; b++) {
      counts[len]![BAND_NAMES[b]!] = sortedAnswers.filter(
        (w, i) => w.length === len && bands[i]! <= b,
      ).length;
    }
  }
  const indexBuf = bands;
  const bandCut = counts;

  const meta = {
    lang,
    generated: new Date().toISOString().slice(0, 10),
    dictWords: dict.wordCount,
    dictNodes: dict.nodeCount,
    dictEdges: dict.edgeCount,
    answerWords: answers.length,
    minAnswerLength: ANSWER_MIN,
    maxAnswerLength: ANSWER_MAX,
    maxWordLength: MAX_LEN[lang],
    bandNames: BAND_NAMES,
    counts: bandCut,
    sources:
      lang === "en"
        ? [
            "SCOWL by Kevin Atkinson, via wordlist-english (permissive SCOWL licence)",
            "OpenSubtitles 2018 frequencies, hermitdave/FrequencyWords (MIT)",
          ]
        : [
            "SALDO morphology, Språkbanken, Göteborgs universitet (CC BY 4.0)",
            "OpenSubtitles 2018 frequencies, hermitdave/FrequencyWords (MIT)",
          ],
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));

  // Vercel serves brotli for static assets, so that is the honest number.
  const dictGzip = brotliSync(dict.buffer);
  const answersGzip = brotliSync(answersBuf) + brotliSync(indexBuf);

  return {
    lang,
    dictWords: dict.wordCount,
    dictBytes: dict.buffer.length,
    dictGzip,
    answerWords: answers.length,
    answersBytes: answersBuf.length + indexBuf.length,
    answersGzip,
    totalGzip: dictGzip + answersGzip,
  };
}

function kb(n: number): string {
  return `${(n / 1024).toFixed(1)} kB`;
}

function brotliSync(buf: Buffer): number {
  return brotliCompressSync(buf, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: buf.length,
    },
  }).length;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const reports: LangReport[] = [];

  console.log("English: reading SCOWL bands…");
  const en = loadEnglish();
  console.log(`  ${en.size.toLocaleString()} valid words`);
  reports.push(emit("en", en, loadFrequency("en")));

  console.log("Swedish: streaming SALDO morphology…");
  const sv = await loadSwedish();
  console.log(`  ${sv.size.toLocaleString()} valid word forms`);
  reports.push(emit("sv", sv, loadFrequency("sv")));

  console.log("\n  lang  dictionary            answers            transferred");
  for (const r of reports) {
    console.log(
      `  ${r.lang}    ${r.dictWords.toLocaleString().padStart(8)} words ` +
        `${kb(r.dictGzip).padStart(9)}  ` +
        `${r.answerWords.toLocaleString().padStart(6)} words ${kb(r.answersGzip).padStart(9)}  ` +
        `${kb(r.totalGzip).padStart(9)}`,
    );
    if (r.totalGzip > 400 * 1024) {
      console.warn(
        `  ! ${r.lang} is over the 400 kB per language budget by ${kb(r.totalGzip - 400 * 1024)}`,
      );
    }
  }
}

void main();
