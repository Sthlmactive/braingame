import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { join } from "node:path";
import { buildDawg } from "./lib/dawg-build";
import { ALPHABETS, compareWords, isAlphabetic, normalise } from "../lib/alphabet";
import type { Lang } from "../lib/i18n";
import { BAND_NAMES, BAND_LIMITS } from "../lib/bands";
import {
  BUCKETED_LENGTHS,
  DIFFICULTIES,
  LENGTH_SPLIT,
  NO_BUCKET,
  VALID_BUCKET_BYTES,
  difficultyScore,
  neighbourCounts,
  splitPool,
  type Difficulty,
  type Scored,
} from "../lib/difficulty";
import { answerBlockReason, isEasyBlocked } from "../lib/curation";
import {
  FILL_LENGTHS,
  THREE_LETTER_RANK_CAP,
  buildFillPool,
  type FillPool,
  type GateCounts,
} from "../lib/fill";
import { mulberry32 } from "../lib/rng";

/**
 * Turns the two verified upstream sources into the data the app ships.
 *
 *   English validity  SCOWL, via the `wordlist-english` package.
 *                     Kevin Atkinson's permissive SCOWL licence.
 *   Swedish validity  SALDO morphology (Språkbanken, Göteborgs universitet),
 *                     CC BY 4.0. Full inflected word forms with POS tags.
 *   Frequency, both   OpenSubtitles 2018 counts from hermitdave/FrequencyWords.
 *                     That repo is MIT for its code but CC BY-SA 4.0 for the
 *                     word list data, and the data is what we use.
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

/**
 * Answers stop here, guesses do not.
 *
 * SCOWL's larger bands are where the obscurities live: "ariel", "merle",
 * "dexter", "bilbo" and "tesla" all first appear at 70. Capping the answer
 * pool at 55 is the English counterpart of refusing SALDO's `pm` tag, and it
 * costs the pool very little: 3,439 five letter and 4,704 six letter words
 * remain, against 3,653 and 4,899 uncapped.
 */
const SCOWL_ANSWER_MAX_SIZE = 55;

/** Smallest SCOWL band each word appears in, used to gate the answer pool. */
function scowlSizes(): Map<string, number> {
  const out = new Map<string, number>();
  for (const size of SCOWL_SIZES) {
    for (const variant of ["english", "american", "british"]) {
      const path = join(
        process.cwd(),
        "node_modules",
        "wordlist-english",
        `${variant}-words-${size}.json`,
      );
      if (!existsSync(path)) continue;
      for (const raw of JSON.parse(readFileSync(path, "utf8")) as string[]) {
        const w = normalise(raw);
        const seen = out.get(w);
        if (seen === undefined || size < seen) out.set(w, size);
      }
    }
  }
  return out;
}

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

/** A multiword's segments carry an "n:m-k" marker in their msd. */
const SV_SEGMENT_MSD = /\d+:\d+-\d+/;

export interface SwedishExclusions {
  /** Ever tagged `pm` or `pmm`. */
  properNouns: Set<string>;
  /** Only ever seen as a piece of a multiword. */
  fragments: Set<string>;
  /** Every standalone reading is a genitive. */
  genitives: Set<string>;
  /** Ever tagged `in` or `inm`: aha, hmm, pst, sch, voj, åhå. */
  interjections: Set<string>;
  /**
   * Ever tagged with one of SALDO's abbreviation parts of speech. The `a`
   * suffix marks them: `nna` is an abbreviated noun (dvd, gps, sms), `pma` a
   * name, `aba` an adverb, `ava` an adjective, `ppa` a preposition.
   */
  abbreviations: Set<string>;
}

/** SALDO's abbreviation parts of speech. */
const SV_POS_ABBREV = new Set(["nna", "pma", "aba", "ava", "ppa"]);
/** SALDO's interjection parts of speech. */
const SV_POS_INTERJECTION = new Set(["in"]);

/**
 * Three classes of Swedish form that are legal guesses but poor hidden words.
 * All three are read off SALDO's own tags; none of them is a judgement call.
 *
 *   properNouns  A form is dropped from the dictionary only when *every*
 *                reading is `pm`, so names with a second reading survive:
 *                "kalle" is also an adjective, "ystad" also a verb, "curie"
 *                also a noun. For answers the rule is stricter: if SALDO ever
 *                calls it a name, we never hide it.
 *
 *   fragments    SALDO enumerates a multiword's pieces as separate WordForms,
 *                marked "1:2-2" and so on. "cetera" exists only inside
 *                "et cetera" and "round" only inside "all round"; neither is a
 *                Swedish word on its own. This is the class that put both of
 *                them in the answer pool.
 *
 *   genitives    "greens" is the genitive of the loanword "green", which is a
 *                real SALDO form and a weak thing to ask someone to guess. A
 *                form is listed only when it has no non-genitive reading, so
 *                ordinary words that merely look like plurals are untouched.
 */
async function loadSwedishExclusions(): Promise<SwedishExclusions> {
  const path = join(CACHE, "saldom.xml");
  const properNouns = new Set<string>();
  const segments = new Set<string>();
  const standalone = new Set<string>();
  const nonGenitive = new Set<string>();
  const interjections = new Set<string>();
  const abbreviations = new Set<string>();
  /** Forms with at least one ordinary reading: not a name, not an
      abbreviation, not an interjection. */
  const ordinary = new Set<string>();

  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  const feat = /<feat att="(\w+)" val="([^"]*)"\s*\/>/;

  let pos = "";
  let inLemma = false;
  let pendingForm: string | null = null;
  let heldLemmas: string[] = [];

  for await (const line of rl) {
    if (line.includes("<LexicalEntry>")) {
      pos = "";
      pendingForm = null;
      heldLemmas = [];
      continue;
    }
    if (line.includes("<Lemma>")) {
      inLemma = true;
      continue;
    }
    if (line.includes("</Lemma>")) {
      inLemma = false;
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
      // The lemma is written before its tag, so it is judged once the tag lands.
      for (const held of heldLemmas) {
        const w = normalise(held);
        if (pos === "pm" || pos === "pmm") properNouns.add(w);
        if (SV_POS_INTERJECTION.has(pos)) interjections.add(w);
        else if (SV_POS_ABBREV.has(pos)) abbreviations.add(w);
        else if (!SV_POS_BLOCK.has(pos)) ordinary.add(w);
        if (!SV_POS_BLOCK.has(pos)) {
          standalone.add(w);
          nonGenitive.add(w);
        }
      }
      heldLemmas = [];
      continue;
    }
    if (att === "writtenForm") {
      if (inLemma) {
        heldLemmas.push(val);
        pendingForm = null;
      } else {
        pendingForm = val;
      }
      continue;
    }
    if (att === "msd" && pendingForm !== null) {
      const w = normalise(pendingForm);
      if (pos === "pm" || pos === "pmm") properNouns.add(w);
      if (!SV_SEGMENT_MSD.test(val)) {
        if (SV_POS_INTERJECTION.has(pos)) interjections.add(w);
        else if (SV_POS_ABBREV.has(pos)) abbreviations.add(w);
        else if (!SV_POS_BLOCK.has(pos) && !SV_MSD_BLOCK.has(val)) ordinary.add(w);
      }
      if (!SV_POS_BLOCK.has(pos) && !SV_MSD_BLOCK.has(val)) {
        if (SV_SEGMENT_MSD.test(val)) {
          segments.add(w);
        } else {
          standalone.add(w);
          if (!val.split(" ").includes("gen")) nonGenitive.add(w);
        }
      }
      pendingForm = null;
    }
  }

  // Only forms with no standalone reading at all are fragments; "glädja" is a
  // segment of "glädja sig" but also a verb in its own right, so it stays.
  const fragments = new Set<string>();
  for (const w of segments) if (!standalone.has(w)) fragments.add(w);

  const genitives = new Set<string>();
  for (const w of standalone) if (!nonGenitive.has(w)) genitives.add(w);

  // Only ever an interjection, or only ever an abbreviation. Abbreviations
  // inflect, and their inflections collide with ordinary words: Ba -> "bas",
  // Ga -> "gas", OS -> "oss", ha (hectare) -> "har". Every one of those has an
  // ordinary reading too, so this keeps them.
  const interjectionOnly = new Set<string>();
  for (const w of interjections) if (!ordinary.has(w)) interjectionOnly.add(w);
  const abbreviationOnly = new Set<string>();
  for (const w of abbreviations) if (!ordinary.has(w)) abbreviationOnly.add(w);

  return {
    properNouns,
    fragments,
    genitives,
    interjections: interjectionOnly,
    abbreviations: abbreviationOnly,
  };
}

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
// Which words may be hidden
// ---------------------------------------------------------------------------

/**
 * LDNOOBW's per language obscenity list, CC BY 4.0.
 *
 * Verified before use: the repo exists, states "licensed under a Creative
 * Commons Attribution 4.0 International License", and ships flat per language
 * files. Multiword entries such as "dra åt helvete" are skipped, since a hidden
 * word is always a single word.
 *
 * This is a union with the hand written stems, not a replacement: the list is
 * 43 entries for Swedish and does not carry inflections, so "knulla" is on it
 * but "knullar" is not.
 */
function loadObscenities(lang: Lang): Set<string> {
  const path = join(CACHE, `ldnoobw-${lang}.txt`);
  const out = new Set<string>();
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Run \`npm run data:fetch\` first.`);
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const w = normalise(line.trim());
    if (w && !w.includes(" ")) out.add(w);
  }
  return out;
}

/** Every word held out of the answer pool, with the rule that did it. */
export interface Removal {
  lang: Lang;
  word: string;
  reason: string;
}

const removals: Removal[] = [];

export interface AnswerGates {
  /** Swedish: names, multiword fragments and genitive-only forms. */
  swedish: SwedishExclusions;
  /** English: smallest SCOWL band per word. */
  scowlSize: ReadonlyMap<string, number>;
  /** LDNOOBW, for this language. */
  obscenities: ReadonlySet<string>;
}

/**
 * True when a word is allowed to be the hidden word. Guessing is unaffected:
 * everything here is still in the dictionary.
 */
function answerable(word: string, lang: Lang, gates: AnswerGates): boolean {
  const curated = answerBlockReason(word, lang, gates.obscenities);
  if (curated !== null) {
    removals.push({ lang, word, reason: curated });
    return false;
  }
  if (lang === "sv") {
    const { properNouns, fragments, genitives } = gates.swedish;
    // Logged for the lengths a game actually draws on: Five uses 5 and 6,
    // Mini uses 3, 4 and 5. The full genitive class runs to hundreds of
    // thousands of forms, so the rest stays out of the log.
    const worthLogging = word.length >= 3 && word.length <= 6;
    const note = (reason: string): false => {
      if (worthLogging) removals.push({ lang, word, reason });
      return false;
    };
    if (properNouns.has(word)) return note("saldo:proper-noun");
    if (fragments.has(word)) return note("saldo:multiword-fragment");
    if (genitives.has(word)) return note("saldo:genitive-only");
  }
  if (lang === "en") {
    const size = gates.scowlSize.get(word);
    if (size === undefined || size > SCOWL_ANSWER_MAX_SIZE) {
      if (word.length >= 3 && word.length <= 6) {
        removals.push({ lang, word, reason: `scowl:band-${size ?? "absent"}` });
      }
      return false;
    }
  }
  return true;
}

/**
 * The removals, written where they can be skimmed and, more usefully, diffed.
 * A false positive is invisible in the surviving buckets but obvious here.
 */
function writeRemovals(): void {
  const byLang = new Map<Lang, Removal[]>();
  for (const r of removals) {
    const list = byLang.get(r.lang) ?? [];
    list.push(r);
    byLang.set(r.lang, list);
  }

  const out: string[] = [
    "# Words held out of the answer pool",
    "",
    "Generated by `npm run data:words`. Do not edit by hand.",
    "",
    "Every word here is still a **valid guess**. It is only barred from being",
    "the hidden word. Skim this after a rebuild: a word that should not be on",
    "this list is a false positive in the curation, and shows up as a diff.",
    "",
    "Swedish SALDO classes and the English SCOWL band cap are listed only for",
    "the two bucketed lengths, 5 and 6. The full genitive class alone runs to",
    "393,137 forms.",
    "",
  ];

  for (const lang of ["sv", "en"] as const) {
    const list = (byLang.get(lang) ?? []).sort(
      (a, b) => a.reason.localeCompare(b.reason) || compareWords(a.word, b.word, lang),
    );
    out.push(`## ${lang}`, "");
    const byReason = new Map<string, string[]>();
    for (const r of list) {
      const words = byReason.get(r.reason) ?? [];
      words.push(r.word);
      byReason.set(r.reason, words);
    }
    for (const [reason, words] of [...byReason].sort((a, b) => a[0].localeCompare(b[0]))) {
      out.push(`### ${reason} — ${words.length}`, "");
      for (let i = 0; i < words.length; i += 10) {
        out.push(`    ${words.slice(i, i + 10).join("  ")}`);
      }
      out.push("");
    }
  }

  const dir = join(process.cwd(), "docs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "answer-removals.md"), out.join("\n"));
  console.log(`\n  wrote docs/answer-removals.md, ${removals.length.toLocaleString()} entries`);
}

// ---------------------------------------------------------------------------
// Mini's fill pool
// ---------------------------------------------------------------------------

const FILL_DIR = join(process.cwd(), "data", "fill");

/** See ThreeLetterGate.bandOf: 35 is the line between words and noises. */
const THREE_LETTER_MAX_BAND = 35;


/**
 * Written as JSON under data/, not public/. Mini ships generated puzzles, so
 * the pool itself is a build input for phase 2 rather than something a phone
 * ever fetches. Committed, because a puzzle bank has to be reproducible from
 * the repo alone.
 */
function writeFillPool(lang: Lang, pool: FillPool): void {
  mkdirSync(FILL_DIR, { recursive: true });
  // Keys emitted in a fixed order so the file is byte stable across runs.
  const ordered: Record<string, Record<string, string[]>> = {};
  for (const length of FILL_LENGTHS) {
    const bands: Record<string, string[]> = {};
    for (const band of DIFFICULTIES) bands[band] = pool[length]![band];
    ordered[String(length)] = bands;
  }
  writeFileSync(
    join(FILL_DIR, `${lang}.json`),
    `${JSON.stringify(ordered, null, 2)}\n`,
  );
}

/** Sizes and a reproducible sample, for a human to sanity check. */
function reportFill(
  lang: Lang,
  pool: FillPool,
  rankOf: ReadonlyMap<string, number>,
  counts: GateCounts,
  gated: ReadonlyMap<string, string>,
): void {
  console.log(`\n  ${lang} Mini fill pool`);
  console.log(
    `    three letter gate removed ${gated.size}: ` +
      `${counts.interjection} interjection, ${counts.abbreviation} abbreviation, ` +
      `${counts.novowel} no-vowel, ${counts.band} scowl-band`,
  );
  const shown = [...gated.entries()].slice(0, 24);
  if (shown.length > 0) {
    console.log(`      ${shown.map(([w, r]) => `${w}(${r[0]})`).join(" ")}`);
  }
  for (const length of FILL_LENGTHS) {
    const bands = pool[length]!;
    const total = DIFFICULTIES.reduce((n, b) => n + bands[b].length, 0);
    const counts = DIFFICULTIES.map((b) => `${b} ${bands[b].length}`).join("  ");
    const cap =
      length === 3 ? `  (capped at the commonest ${THREE_LETTER_RANK_CAP})` : "";
    console.log(`    ${length} letters: ${total} words   ${counts}${cap}`);
  }

  // A fixed seed, so the sample is the same on every run and can be discussed.
  const rng = mulberry32(20260814);
  for (const length of FILL_LENGTHS) {
    const all = DIFFICULTIES.flatMap((b) => pool[length]![b]);
    const list = [...all];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
    const sample = list.slice(0, 40).sort((a, b) => compareWords(a, b, lang));
    console.log(`\n    ${lang} ${length} letters, 40 sampled:`);
    for (let i = 0; i < sample.length; i += 10) {
      console.log(`      ${sample.slice(i, i + 10).join("  ")}`);
    }
    const worst = all.reduce((m, w) => Math.max(m, rankOf.get(w)! + 1), 0);
    console.log(`      rarest in pool: corpus rank ${worst}`);
  }
}

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

/**
 * How much of each length's pool the lower difficulty takes. The rest of that
 * length's pool becomes the higher one.
 *
 * Five letters is an absolute count. Lätt's job is to be gentle, so it is the
 * gentlest 600 words and nothing more; letting it grow with the pool would
 * only push it deeper into the frequency tail. Medel absorbs the difference.
 *
 * Six letters is a ratio. An absolute 4,000 would have made Extrem's size an
 * accident of how big the pool happened to be: Swedish would keep 1,387 and
 * English 678 today, but a 4,200 word pool would leave Extrem at 200 and trip
 * the minimum. 60/40 holds the shape whatever the pool does.
 */
const FIRST_TARGET: Record<number, (poolSize: number) => number> = {
  5: () => 600,
  6: (poolSize) => Math.round(poolSize * 0.6),
};

/** Under this and a bucket is too thin to play, so the build refuses to ship. */
const MIN_BUCKET = 300;

/**
 * Score and split the answers of one length into that length's two
 * difficulties. Neighbours are counted inside this pool only, so a five letter
 * word's neighbours are other five letter answers and nothing else.
 */
function bucketize(
  answers: readonly string[],
  rankOf: ReadonlyMap<string, number>,
  lang: Lang,
  length: number,
): Map<string, Difficulty> {
  const pool = answers.filter((w) => w.length === length);
  const neighbours = neighbourCounts(pool);

  // Ranks are 1-based here; rankOf is a 0-based position in the frequency list.
  let maxRank = 1;
  for (const w of pool) maxRank = Math.max(maxRank, rankOf.get(w)! + 1);

  const scored: Scored[] = pool.map((word) => {
    const rank = rankOf.get(word)! + 1;
    const n = neighbours.get(word) ?? 0;
    return {
      word,
      rank,
      neighbours: n,
      score: difficultyScore({ word, lang, rank, maxRank, neighbours: n }),
    };
  });

  const [first, second] = LENGTH_SPLIT[length]!;
  const filtered =
    first === "easy"
      ? scored.filter((s) => !isEasyBlocked(s.word, lang))
      : scored;
  const blockedFromEasy = scored.filter((s) => isEasyBlocked(s.word, lang));

  const out = splitPool(filtered, lang, {
    first,
    second,
    firstTarget: FIRST_TARGET[length]!(pool.length),
    // Only the beginners' bucket carries the extra structural filter.
    easyFilter: first === "easy",
  });
  // A word held out of easy still belongs to the pool, one bucket further out.
  for (const s of blockedFromEasy) out.set(s.word, second);
  return out;
}

/** Bucket sizes and a reproducible sample, for a human to sanity check. */
function reportBuckets(
  lang: Lang,
  answers: readonly string[],
  buckets: ReadonlyMap<string, Difficulty>,
  rankOf: ReadonlyMap<string, number>,
): void {
  const members: Record<Difficulty, string[]> = {
    easy: [],
    medium: [],
    hard: [],
    extreme: [],
  };
  for (const w of answers) {
    const b = buckets.get(w);
    if (b) members[b].push(w);
  }

  console.log(`\n  ${lang} difficulty buckets`);
  for (const b of DIFFICULTIES) {
    const list = members[b];
    const ranks = list.map((w) => rankOf.get(w)! + 1);
    const median = ranks.sort((x, y) => x - y)[Math.floor(ranks.length / 2)] ?? 0;
    console.log(
      `    ${b.padEnd(8)} ${String(list.length).padStart(6)} words   median corpus rank ${median}`,
    );
  }

  // A fixed seed, so the sample is the same on every run and can be discussed.
  const rng = mulberry32(20260813);
  for (const b of DIFFICULTIES) {
    const list = [...members[b]];
    // Fisher-Yates over a copy, driven by the seeded rng.
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
    const sample = list.slice(0, 40).sort((x, y) => compareWords(x, y, lang));
    console.log(`\n    ${lang} ${b}, 40 sampled:`);
    for (let i = 0; i < sample.length; i += 10) {
      console.log(`      ${sample.slice(i, i + 10).join("  ")}`);
    }
  }

  for (const b of DIFFICULTIES) {
    if (members[b].length < MIN_BUCKET) {
      throw new Error(
        `${lang} bucket "${b}" has only ${members[b].length} words, under the ` +
          `${MIN_BUCKET} minimum. Refusing to ship it.`,
      );
    }
  }
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
  gates: AnswerGates,
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
  // The answer pool is narrower than the guess list on purpose. A proper noun,
  // an obscurity or a crude word is still a legal guess; it is never the word
  // the player is asked to find.
  const answers: string[] = [];
  const rankOf = new Map<string, number>();
  for (const w of frequency) {
    if (!validity.has(w)) continue;
    if (w.length < ANSWER_MIN || w.length > ANSWER_MAX) continue;
    if (rankOf.has(w)) continue;
    if (!answerable(w, lang, gates)) continue;
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

  // --- Mini's fill pool ----------------------------------------------------
  // Build-time only: the phone never downloads this. Mini ships generated
  // puzzles, and this is what generates them.
  const built = buildFillPool(sortedAnswers, rankOf, lang, {
    interjections: gates.swedish.interjections,
    abbreviations: gates.swedish.abbreviations,
    // English has no part of speech to read, so the band stands in for one.
    bandOf: lang === "en" ? gates.scowlSize : undefined,
    maxBand: lang === "en" ? THREE_LETTER_MAX_BAND : undefined,
  });
  writeFillPool(lang, built.pool);
  reportFill(lang, built.pool, rankOf, built.counts, built.gated);

  // --- Difficulty buckets, one pass per bucketed length --------------------
  // Five letters feed Lätt and Medel, six letters feed Svår and Extrem. The
  // two pools are scored and split independently of each other.
  const buckets = new Map<string, Difficulty>();
  for (const length of BUCKETED_LENGTHS) {
    for (const [w, b] of bucketize(sortedAnswers, rankOf, lang, length)) {
      buckets.set(w, b);
    }
  }

  // One byte per answer, in the same order as answers.txt and answer-bands.bin.
  // Anything that is not a bucketed five letter answer is explicitly 255, never
  // a defaulted 0, so a wrong length word can never be served as "easy".
  const difficulty = Buffer.alloc(sortedAnswers.length, NO_BUCKET);
  sortedAnswers.forEach((w, i) => {
    const b = buckets.get(w);
    difficulty[i] = b === undefined ? NO_BUCKET : DIFFICULTIES.indexOf(b);
  });
  for (const byte of difficulty) {
    if (!VALID_BUCKET_BYTES.includes(byte)) {
      throw new Error(`${lang}: difficulty byte ${byte} is not a valid bucket`);
    }
  }
  if (difficulty.length !== bands.length) {
    throw new Error(
      `${lang}: difficulty has ${difficulty.length} bytes but bands has ${bands.length}`,
    );
  }
  writeFileSync(join(dir, "answer-difficulty.bin"), difficulty);
  reportBuckets(lang, sortedAnswers, buckets, rankOf);

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
    // Deliberately no build timestamp. It was the only non-deterministic byte
    // in the output, and a rebuild that changes nothing should change nothing.
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
            "OpenSubtitles 2018 frequencies, hermitdave/FrequencyWords (CC BY-SA 4.0)",
            "Answer filtering: LDNOOBW (CC BY 4.0)",
          ]
        : [
            "SALDO morphology, Språkbanken, Göteborgs universitet (CC BY 4.0)",
            "OpenSubtitles 2018 frequencies, hermitdave/FrequencyWords (CC BY-SA 4.0)",
            "Answer filtering: LDNOOBW (CC BY 4.0)",
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
  const scowlSize = scowlSizes();
  console.log(`  ${en.size.toLocaleString()} valid words`);
  const noSwedish: SwedishExclusions = {
    properNouns: new Set(),
    fragments: new Set(),
    genitives: new Set(),
    interjections: new Set(),
    abbreviations: new Set(),
  };
  reports.push(
    emit("en", en, loadFrequency("en"), {
      swedish: noSwedish,
      scowlSize,
      obscenities: loadObscenities("en"),
    }),
  );

  console.log("Swedish: streaming SALDO morphology…");
  const sv = await loadSwedish();
  console.log(`  ${sv.size.toLocaleString()} valid word forms`);
  const swedish = await loadSwedishExclusions();
  console.log(
    `  held out of answers: ${swedish.properNouns.size.toLocaleString()} proper nouns, ` +
      `${swedish.fragments.size.toLocaleString()} multiword fragments, ` +
      `${swedish.genitives.size.toLocaleString()} genitive-only forms`,
  );
  reports.push(
    emit("sv", sv, loadFrequency("sv"), {
      swedish,
      scowlSize: new Map(),
      obscenities: loadObscenities("sv"),
    }),
  );

  writeRemovals();

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
