import { createReadStream, existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { isAlphabetic, normalise } from "../lib/alphabet";
import { answerPool, isValidWord, loadLanguage, setFetcher } from "../lib/dictionary";
import type { Lang } from "../lib/i18n";
import { NOT_WORDS, SEED_WORDS } from "../test/seed-words";

/**
 * Why does the shipped dictionary reject real words?
 *
 * Loads the built data exactly as the browser does, runs a seed list of words
 * that must be accepted, and for every miss reports which stage of the pipeline
 * dropped it: absent from the raw source, killed by the POS filter, killed by
 * the msd (word-fragment) filter, killed by case, charset or length, or present
 * in the data and failing only at lookup time.
 *
 *   npx tsx scripts/diagnose-dictionary.ts
 */

const CACHE = join(process.cwd(), "scripts", ".cache");

// ---------------------------------------------------------------------------
// Seed lists. The regression list, plus the words that must stay refused, so
// the diagnosis and the test suite can never drift apart.
// ---------------------------------------------------------------------------

const SEED: Record<Lang, string[]> = {
  sv: [...SEED_WORDS.sv, ...NOT_WORDS.sv],
  en: [...SEED_WORDS.en, ...NOT_WORDS.en],
};

// ---------------------------------------------------------------------------
// The filters the current build script applies, replayed here so a miss can be
// attributed to one of them rather than guessed at.
// ---------------------------------------------------------------------------

const SV_POS_BLOCK = new Set(["pm", "pmm", "mxc", "sxc", "mxs", "ssm"]);
const SV_MSD_BLOCK = new Set(["c", "sms", "ci", "cm"]);
const MAX_LEN: Record<Lang, number> = { en: 15, sv: 9 };
const MIN_LEN = 2;

type Stage =
  | "ok"
  | "not-in-source"
  | "dropped-by-pos"
  | "dropped-by-msd"
  | "dropped-by-case"
  | "dropped-by-charset-or-length"
  | "in-data-lookup-fails";

/** Every place a seed word turns up in the raw source. */
interface Sighting {
  form: string;
  pos: string;
  msd: string;
  where: "lemma" | "wordform";
}

// ---------------------------------------------------------------------------
// Raw sources
// ---------------------------------------------------------------------------

/**
 * One streaming pass over the 254 MB SALDO XML collecting every sighting of a
 * seed word. Matching is on the NFC-folded form so an NFD source spelling is
 * still found; the raw bytes are kept for the normalisation check.
 */
async function scanSaldo(wanted: Set<string>): Promise<Map<string, Sighting[]>> {
  const path = join(CACHE, "saldom.xml");
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Run \`npm run data:fetch\` first.`);
  }

  const found = new Map<string, Sighting[]>();
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  const feat = /<feat att="(\w+)" val="([^"]*)"\s*\/>/;

  let pos = "";
  let inLemma = false;
  let pendingForm: string | null = null;
  let pendingLemma: string | null = null;

  // A lemma is seen before its POS tag, so sightings are held until the tag
  // arrives. Word forms inherit the entry's POS, which is known by then.
  let heldLemmas: string[] = [];
  const record = (form: string, where: Sighting["where"], msd: string): void => {
    const key = normalise(form);
    if (!wanted.has(key)) return;
    const list = found.get(key) ?? [];
    list.push({ form, pos, msd, where });
    found.set(key, list);
  };

  for await (const line of rl) {
    if (line.includes("<LexicalEntry>")) {
      pos = "";
      pendingForm = null;
      pendingLemma = null;
      heldLemmas = [];
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
      for (const held of heldLemmas) record(held, "lemma", "");
      heldLemmas = [];
      pendingLemma = null;
      continue;
    }
    if (att === "writtenForm") {
      if (inLemma) {
        pendingLemma = val;
        heldLemmas.push(val);
        pendingForm = null;
      } else {
        pendingForm = val;
      }
      continue;
    }
    if (att === "msd" && pendingForm !== null) {
      record(pendingForm, "wordform", val);
      pendingForm = null;
    }
  }
  void pendingLemma;

  return found;
}

const SCOWL_SIZES = [10, 20, 35, 40, 50, 55, 60, 70] as const;

/** Every SCOWL spelling of a seed word, with the raw casing preserved. */
function scanScowl(wanted: Set<string>): Map<string, Sighting[]> {
  const found = new Map<string, Sighting[]>();
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
        const key = normalise(raw);
        if (!wanted.has(key)) continue;
        const list = found.get(key) ?? [];
        list.push({ form: raw, pos: `scowl-${size}`, msd: variant, where: "lemma" });
        found.set(key, list);
      }
    }
  }
  return found;
}

/**
 * Miss rate per word length, which is the number that decides whether a gap is
 * Five's problem or somebody else's.
 *
 * Measured against the full OpenSubtitles list rather than the 50k, because the
 * long compounds that a Swedish player types are exactly what the 50k truncates
 * away. Raw corpus rejection is meaningless on its own: the corpus is thick with
 * proper nouns, OCR damage and run together speech that the dictionary is right
 * to refuse. So two filters are applied before anything is called a miss.
 */
interface LengthRow {
  length: number;
  candidates: number;
  misses: number;
  examples: string[];
}

function coverageByLength(
  lang: Lang,
  minCount: number,
  foreign: Set<string>,
): LengthRow[] {
  const path = join(CACHE, `${lang}_full.txt`);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}. Fetch the full OpenSubtitles list for ${lang} first.`,
    );
  }

  const rows = new Map<number, LengthRow>();
  for (let len = 4; len <= 9; len++) {
    rows.set(len, { length: len, candidates: 0, misses: 0, examples: [] });
  }

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const raw = line.slice(0, sp);
    const count = Number(line.slice(sp + 1));
    if (!Number.isFinite(count) || count < minCount) continue;

    const w = normalise(raw);
    const row = rows.get(w.length);
    if (!row) continue;
    if (!isAlphabetic(w, lang)) continue;
    // A token common in the other language's subtitles too is almost always a
    // name or an English word, not a gap in this language's dictionary.
    if (foreign.has(w)) continue;

    row.candidates++;
    if (!isValidWord(w, lang)) {
      row.misses++;
      if (row.examples.length < 14) row.examples.push(w);
    }
  }

  return [...rows.values()];
}

/** Tokens common in the other language, used to filter names out of a corpus. */
function foreignTokens(other: Lang, minCount: number): Set<string> {
  const path = join(CACHE, `${other}_full.txt`);
  const out = new Set<string>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    if (Number(line.slice(sp + 1)) < minCount) continue;
    out.add(normalise(line.slice(0, sp)));
  }
  return out;
}

/** OpenSubtitles rank, 0-based, from the 50k list the build currently uses. */
function loadRanks(lang: Lang): Map<string, number> {
  const path = join(CACHE, `${lang}_50k.txt`);
  const ranks = new Map<string, number>();
  if (!existsSync(path)) return ranks;
  let rank = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const word = line.split(" ")[0];
    if (!word) continue;
    const w = normalise(word);
    if (ranks.has(w)) continue;
    ranks.set(w, rank++);
  }
  return ranks;
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

function classify(
  word: string,
  lang: Lang,
  sightings: Sighting[] | undefined,
  inGuessList: boolean,
): { stage: Stage; note: string } {
  if (inGuessList) return { stage: "ok", note: "" };
  if (!sightings || sightings.length === 0) {
    return { stage: "not-in-source", note: "no entry in the raw source" };
  }

  // Replay the build filters over every sighting. If any one of them would
  // have survived, the word should be in the data and the fault is downstream.
  const reasons: string[] = [];
  for (const s of sightings) {
    if (lang === "sv") {
      if (SV_POS_BLOCK.has(s.pos)) {
        reasons.push(`pos=${s.pos} blocked`);
        continue;
      }
      if (s.where === "wordform" && SV_MSD_BLOCK.has(s.msd)) {
        reasons.push(`msd=${s.msd} blocked`);
        continue;
      }
    }
    if (s.form !== s.form.toLowerCase()) {
      reasons.push(`"${s.form}" is not lowercase`);
      continue;
    }
    const w = normalise(s.form);
    if (!isAlphabetic(w, lang)) {
      reasons.push(`"${w}" outside the ${lang} alphabet`);
      continue;
    }
    if (w.length < MIN_LEN || w.length > MAX_LEN[lang]) {
      reasons.push(`length ${w.length} outside ${MIN_LEN}..${MAX_LEN[lang]}`);
      continue;
    }
    // Survived every filter, so the build should have written it.
    return {
      stage: "in-data-lookup-fails",
      note: `passes every filter as ${s.where} pos=${s.pos || "-"} msd=${s.msd || "-"}`,
    };
  }

  const first = reasons[0] ?? "unknown";
  if (first.includes("pos=")) return { stage: "dropped-by-pos", note: first };
  if (first.includes("msd=")) return { stage: "dropped-by-msd", note: first };
  if (first.includes("lowercase")) return { stage: "dropped-by-case", note: first };
  return { stage: "dropped-by-charset-or-length", note: first };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

/** Codepoint dump, so an NFD spelling cannot hide behind an identical render. */
function codepoints(s: string): string {
  return [...s].map((c) => c.codePointAt(0)!.toString(16).padStart(4, "0")).join(" ");
}

async function main(): Promise<void> {
  setFetcher(async (path) => {
    const buf = await readFile(join(process.cwd(), "public", path));
    return buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  });

  const results: Record<Lang, { stage: Stage; note: string; word: string }[]> = {
    sv: [],
    en: [],
  };

  for (const lang of ["sv", "en"] as const) {
    await loadLanguage(lang);
    const seed = SEED[lang];
    const wanted = new Set(seed.map(normalise));
    const ranks = loadRanks(lang);

    console.log(`\n=== ${lang.toUpperCase()} =================================`);
    console.log("scanning raw source…");
    const sightings =
      lang === "sv" ? await scanSaldo(wanted) : scanScowl(wanted);

    const answers = new Set(answerPool(lang, 5, "full"));

    console.log(
      `\n${pad("word", 12)}${pad("guess", 7)}${pad("answer", 8)}${pad("rank", 8)}stage`,
    );
    console.log("-".repeat(78));

    let hits = 0;
    for (const raw of seed) {
      const word = normalise(raw);
      const inGuess = isValidWord(word, lang);
      const inAnswers = answers.has(word);
      const rank = ranks.get(word);
      const { stage, note } = classify(word, lang, sightings.get(word), inGuess);
      if (inGuess) hits++;
      results[lang].push({ stage, note, word });
      console.log(
        pad(word, 12) +
          pad(inGuess ? "yes" : "NO", 7) +
          pad(inAnswers ? "yes" : "no", 8) +
          pad(rank === undefined ? "-" : String(rank + 1), 8) +
          (stage === "ok" ? "" : `${stage}  ${note}`),
      );
    }

    const pct = ((hits / seed.length) * 100).toFixed(1);
    console.log("-".repeat(78));
    console.log(`${lang}: ${hits}/${seed.length} in the guess list (${pct}%)`);

    // --- where the losses land ---------------------------------------------
    const byStage = new Map<Stage, string[]>();
    for (const r of results[lang]) {
      if (r.stage === "ok") continue;
      const list = byStage.get(r.stage) ?? [];
      list.push(r.word);
      byStage.set(r.stage, list);
    }
    if (byStage.size > 0) {
      console.log("\nlosses by stage:");
      for (const [stage, words] of byStage) {
        console.log(`  ${pad(stage, 30)} ${words.length}  ${words.join(" ")}`);
      }
    }

    // --- Suspect B: normalisation ------------------------------------------
    if (lang === "sv") {
      console.log("\nnormalisation check (Suspect B):");
      let nfdSightings = 0;
      for (const list of sightings.values()) {
        for (const s of list) if (s.form !== s.form.normalize("NFC")) nfdSightings++;
      }
      console.log(`  raw source forms that are not NFC: ${nfdSightings}`);

      const nonNfcAnswers = [...answers].filter((w) => w !== w.normalize("NFC"));
      console.log(`  shipped answers that are not NFC:  ${nonNfcAnswers.length}`);

      const probe = "kväll";
      console.log(`  "${probe}" NFC bytes: ${codepoints(probe.normalize("NFC"))}`);
      console.log(`  "${probe}" NFD bytes: ${codepoints(probe.normalize("NFD"))}`);
      console.log(
        `  lookup NFC: ${isValidWord(probe.normalize("NFC"), "sv")}  ` +
          `lookup NFD: ${isValidWord(probe.normalize("NFD"), "sv")}`,
      );
      // The DAWG alphabet is the ground truth for what the data was written in.
      console.log(
        `  dawg alphabet: ${codepoints((await loadLanguage("sv")).dawg.alphabet.join(""))}`,
      );
    }

    // --- miss rate by length ------------------------------------------------
    // Five uses 5 and 6. Anything clustering at 7+ belongs to Tiles and Hive.
    const other: Lang = lang === "sv" ? "en" : "sv";
    for (const minCount of [10, 100]) {
      const foreign = foreignTokens(other, 10);
      const rows = coverageByLength(lang, minCount, foreign);
      console.log(
        `\n${lang} miss rate by length, corpus count >= ${minCount}, ` +
          `tokens common in ${other} excluded:`,
      );
      console.log(
        `  ${pad("len", 6)}${pad("candidates", 13)}${pad("missed", 9)}${pad("rate", 8)}examples`,
      );
      for (const r of rows) {
        const rate = r.candidates === 0 ? 0 : (r.misses / r.candidates) * 100;
        console.log(
          `  ${pad(String(r.length), 6)}${pad(r.candidates.toLocaleString(), 13)}` +
            `${pad(String(r.misses), 9)}${pad(`${rate.toFixed(1)}%`, 8)}` +
            r.examples.slice(0, 10).join(" "),
        );
      }
    }
  }
}

void main();
