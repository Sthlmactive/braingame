import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareWords } from "../lib/alphabet";
import { answerBlockReason } from "../lib/curation";
import { DIFFICULTIES, neighbourCounts, type Difficulty } from "../lib/difficulty";
import { type FillPool } from "../lib/fill";
import { LANGS, type Lang } from "../lib/i18n";
import { wordsOf } from "../lib/mini";
import { mulberry32 } from "../lib/rng";

/**
 * Mini's clue bank.
 *
 * Keyed by word, not by puzzle: across 3,000 puzzles the same words recur
 * constantly, so this is a few thousand generations rather than tens of
 * thousands. Two clues per word, chosen between by puzzle seed, so the same
 * word does not always read identically.
 *
 *   npx tsx scripts/build-clues.ts --select        # pick the pilot sample, no API calls
 *   npx tsx scripts/build-clues.ts --pilot         # run the pilot across all models
 */

const DATA = join(process.cwd(), "public", "data");
const FILL_DIR = join(process.cwd(), "data", "fill");
const OUT_DIR = join(process.cwd(), "data", "clues");

/** How many words per language the pilot clues. */
const PILOT_SIZE = 50;

/** Seed for the pilot sample, so the same words are compared on every run. */
const PILOT_SEED = 0xc10e;

/**
 * The models under comparison. Cheapest first — the pilot exists to find the
 * cheapest one that is actually good enough, not to justify the dearest.
 */
export const PILOT_MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5", inPerM: 1, outPerM: 5, effort: null },
  { id: "claude-sonnet-5", label: "Sonnet 5", inPerM: 2, outPerM: 10, effort: "low" },
  { id: "claude-opus-5", label: "Opus 5", inPerM: 5, outPerM: 25, effort: "low" },
] as const;

// ---------------------------------------------------------------------------
// Word inventory
// ---------------------------------------------------------------------------

export interface WordFacts {
  word: string;
  length: number;
  /** Which difficulty banks this word appears in. */
  banks: Difficulty[];
  /** Words of the same length differing in exactly one position. */
  neighbours: number;
}

function bankWords(lang: Lang, difficulty: Difficulty): Set<string> {
  const path = join(DATA, lang, `mini-${difficulty}.txt`);
  const out = new Set<string>();
  for (const grid of readFileSync(path, "utf8").split("\n").filter((l) => l.length)) {
    for (const w of wordsOf(grid)) out.add(w);
  }
  return out;
}

export function inventory(lang: Lang): Map<string, WordFacts> {
  const out = new Map<string, WordFacts>();
  for (const difficulty of DIFFICULTIES) {
    for (const word of bankWords(lang, difficulty)) {
      const found = out.get(word);
      if (found) found.banks.push(difficulty);
      else out.set(word, { word, length: word.length, banks: [difficulty], neighbours: 0 });
    }
  }

  // Neighbours are counted inside one length, which is what makes an
  // inflection cluster visible: AKTAR sits beside AKTAS, AKTAT and AKTAD.
  const fill = JSON.parse(readFileSync(join(FILL_DIR, `${lang}.json`), "utf8")) as FillPool;
  for (const length of [3, 4, 5]) {
    const pool = [...new Set(DIFFICULTIES.flatMap((b) => fill[length]?.[b] ?? []))];
    const counts = neighbourCounts(pool);
    for (const facts of out.values()) {
      if (facts.length === length) facts.neighbours = counts.get(facts.word) ?? 0;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pilot sample
// ---------------------------------------------------------------------------

export interface Picked extends WordFacts {
  /** Why this word is in the sample, for reading the comparison table. */
  reason: string;
}

/**
 * Weighted toward the cases where a cheap model produces a clue that is
 * technically correct and unusable, rather than a uniform random sample:
 *
 *   inflection  the fully checked bank's clustered forms — AKTAR / ENADE /
 *               NOSAR — where the clue carries the whole burden of picking
 *               an ending
 *   3-letter    the shortest entries, where there is least to say
 *   multi-bank  words a player meets over and over, so a weak clue is not a
 *               one-off
 *   spread      the rest, sampled across banks and rank, as a control
 */
export function pickPilot(lang: Lang, facts: Map<string, WordFacts>): Picked[] {
  const rng = mulberry32(PILOT_SEED + (lang === "sv" ? 1 : 2));
  const taken = new Set<string>();
  const out: Picked[] = [];

  const take = (candidates: WordFacts[], n: number, reason: string): void => {
    const pool = candidates.filter((f) => !taken.has(f.word));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    for (const f of pool.slice(0, n)) {
      taken.add(f.word);
      out.push({ ...f, reason });
    }
  };

  const all = [...facts.values()];

  // Inflection risk: in the fully checked bank, and in a dense cluster.
  const clustered = all
    .filter((f) => f.banks.includes("extreme") && f.neighbours >= 6)
    .sort((a, b) => b.neighbours - a.neighbours || compareWords(a.word, b.word, lang));
  take(clustered.slice(0, 120), 18, "inflection");

  take(all.filter((f) => f.length === 3), 8, "3-letter");
  take(all.filter((f) => f.banks.length >= 3), 10, "multi-bank");
  take(all, PILOT_SIZE - out.length, "spread");

  return out.sort(
    (a, b) => a.reason.localeCompare(b.reason) || compareWords(a.word, b.word, lang),
  );
}

// ---------------------------------------------------------------------------
// Clue rules — the system prompt
// ---------------------------------------------------------------------------

const LANGUAGE_NAME: Record<Lang, string> = { sv: "Swedish", en: "English" };

export function systemPrompt(lang: Lang): string {
  return `You write crossword clues for a mini crossword, in ${LANGUAGE_NAME[lang]}.

Write every clue in ${LANGUAGE_NAME[lang]}. The clue language follows the puzzle,
never the player's interface language.

Rules, all of them binding:

1. Eight words at most. This is a mini, not a cryptic.
2. Never use the answer, an inflection of it, or its stem in the clue.
3. No proper nouns in a clue. No answer is one.
4. Plain definitional clues for the easy and medium difficulties. Mild
   indirection is allowed for hard and extreme. Never cryptic wordplay,
   never anagram or hidden-word devices.
5. A ${LANGUAGE_NAME[lang]} clue must be solvable by someone who speaks only
   ${LANGUAGE_NAME[lang]}. Do not lean on English loanwords, English idiom, or
   a translation of an English clue.
6. Do not describe the answer's grammatical form. Never write "in the plural",
   "definite form", "past tense", "imperative", or any equivalent hint at the
   word's ending. The grid decides the ending; the clue decides the meaning.

Write two clues per word. They must be genuinely different from one another —
a different angle on the meaning, not a rephrasing of the same sentence.

For an inflected word, clue the sense the inflected form actually carries, in
natural ${LANGUAGE_NAME[lang]}, the way a ${LANGUAGE_NAME[lang]} crossword
would. Do not clue the dictionary form and leave the player to guess the
ending.`;
}

export function userPrompt(words: Picked[]): string {
  const lines = words.map((w) => `${w.word} (${w.length} letters)`).join("\n");
  return `Write two clues for each of these ${words.length} answers:\n\n${lines}`;
}

/**
 * The prompt for a clue that already failed.
 *
 * The first repair pass re-sent the generic prompt and the model made the same
 * mistake again — it swapped one metalinguistic suffix for another rather than
 * dropping the habit. So this one quotes the failed clue back verbatim and
 * names the exact violation, which is the difference between "avoid the
 * answer" and "brandkåren contains brand".
 */
export interface RepairItem {
  word: string;
  clue1: string;
  clue2: string;
  flags: string[];
}

const VIOLATION_TEXT: Record<string, (detail: string, word: string) => string> = {
  "contains-answer": (detail) => `it contains the answer "${detail}"`,
  "contains-stem": (detail, word) =>
    `it contains "${detail}", which contains the answer "${word}"`,
  "form-tell": (detail) => `it says "${detail}", which names the grammatical form`,
  "too-long": (detail) => `it is ${detail}, over the eight word limit`,
  crude: (detail) => `it uses "${detail}"`,
  empty: () => `it is empty`,
};

export function repairPrompt(items: RepairItem[], lang: Lang): string {
  const blocks = items.map((item) => {
    const lines = item.flags.map((flag) => {
      const which = flag.startsWith("1:") ? item.clue1 : item.clue2;
      const kind = flag.split(":")[1]!.split("(")[0]!;
      const detail = flag.slice(flag.indexOf("(") + 1, flag.lastIndexOf(")"));
      const why = VIOLATION_TEXT[kind]?.(detail, item.word) ?? kind;
      return `  Your clue for ${item.word.toUpperCase()} was "${which}". Rejected: ${why}.`;
    });
    return `${item.word} (${item.word.length} letters)\n${[...new Set(lines)].join("\n")}`;
  });

  return `These ${LANGUAGE_NAME[lang]} clues were rejected. Write two new clues for each
answer that do not repeat the mistake.

${blocks.join("\n\n")}`;
}

/**
 * Added to the system prompt when repairing. The model does not treat a
 * compound as containing its parts unless told so in as many words.
 */
export const COMPOUND_RULE = `The answer must not appear anywhere in the clue as a
sequence of letters, including inside a longer word. A compound contains its
parts: "brandkåren" contains "brand", "gräsmattan" contains "gräs", and
"bredare" contains "breda". A clue for BRAND may not use brandkåren, brandbil,
brandman or any other word built on it. Check every word of your clue letter by
letter against the answer before writing it down.`;

export const CLUE_SCHEMA = {
  type: "object",
  properties: {
    clues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          answer: { type: "string" },
          clue1: { type: "string" },
          clue2: { type: "string" },
        },
        required: ["answer", "clue1", "clue2"],
        additionalProperties: false,
      },
    },
  },
  required: ["clues"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Checks that do not need a model
// ---------------------------------------------------------------------------

/**
 * Phrases that name the answer's grammatical form.
 *
 * Split in two, because the same word can be a tag or ordinary language.
 * "Bestämd form" is always a tag. Bare "bestämt" is a tag in "Stämningen,
 * bestämt" and an ordinary adverb in "Ett bestämt avslut" — so the bare forms
 * only count when they trail the clue or follow a comma. "Böjd" was on this
 * list and is now not: it means "bent", and it was flagging "Böjd metallkrok".
 */
const HARD_TELLS: Record<Lang, readonly string[]> = {
  sv: [
    "i plural",
    "i singular",
    "pluralis",
    "i flertal",
    "bestämd form",
    "bestämt form",
    "obestämd form",
    "bestämd artikel",
    "i böjd form",
    "böjd form",
    "i particip",
    "i grundform",
    "grundform",
    "uppmanande form",
    "i neutrum",
    "presens",
    "imperfekt",
    "preteritum",
    "imperativ",
    "supinum",
    "genitiv",
    "verbform",
  ],
  en: [
    "in the plural",
    "plural form",
    "singular form",
    "past tense",
    "present tense",
    "definite form",
    "imperative form",
    "participle",
    "gerund",
    "conjugated",
    "inflected",
    "-ed form",
    "-ing form",
  ],
};

/** Only a tell when trailing, or immediately after a comma. */
const SOFT_TELLS: Record<Lang, readonly string[]> = {
  sv: ["bestämd", "bestämt", "obestämd", "obestämt", "plural", "singular"],
  en: ["plural", "singular", "definite", "imperative"],
};

/**
 * A clue may be this long, inclusive. Originally "under 8", which made a
 * perfectly good eight-word clue a violation by one word — 74 of them. The
 * bound was picked to mean "short", not to sit exactly there.
 */
export const MAX_CLUE_WORDS = 8;

/**
 * Clues reviewed by hand and kept, with the rule they trip.
 *
 * **Rule 7 is about Swedish inflectional endings.** Its job is to stop a clue
 * leaking an ending the crossings are supposed to pin — "Fågeln vid vattnet,
 * bestämd form" hands back the guarantee the fully checked bank was built to
 * provide. That is a real defect and it stays forbidden.
 *
 * The English irregular past tenses below are the opposite case: the tense is
 * not a hint at the answer's *shape*, it is the answer's *meaning*. There is
 * no clue for WENT that does not say "past tense of go" in some form, and any
 * attempt to write around it is worse for the player.
 *
 * Do not read these five as a reason to soften rule 7. A Swedish clue ending
 * ", i plural" is still a defect; an English clue saying "past tense of go"
 * was never what the rule was aimed at.
 */
export const ACCEPTED_CLUES = new Set([
  // Crude-list hits on ordinary language.
  "sv/toa", // "kissa" is what a Swedish clue for a toilet says
  "en/moxie", // "spunky" is the plucky sense of spunk
  // Irregular past tenses: the tense is the meaning, not a leaked ending.
  "en/was",
  "en/were",
  "en/went",
  "en/began",
  "en/been",
  // Three attempts, both clues nine words each time. The bound is eight, and
  // it was chosen to mean "short" rather than to sit exactly there — cutting a
  // word from the answer pool over one word of clue length is the worse trade.
  "sv/våran",
]);

export interface ClueProblem {
  kind: "contains-answer" | "contains-stem" | "too-long" | "form-tell" | "empty";
  detail: string;
}

/**
 * Inflectional endings, for deciding whether two words are the same word.
 *
 * Deliberately not a full morphology: enough to catch bli/blir and kall/kallt,
 * not enough to claim bra and bravo are related.
 */
const SUFFIXES: Record<Lang, readonly string[]> = {
  sv: [
    "s", "t", "n", "r", "a", "e", "d",
    "ar", "er", "or", "en", "et", "an", "na", "de", "te", "ts", "as", "es",
    "ade", "ase", "ande", "arna", "erna", "orna", "ades", "andes",
  ],
  en: ["s", "es", "d", "ed", "ing", "er", "est", "ly", "en", "ies", "ied"],
};

/**
 * Does a word in the clue give the answer away?
 *
 * Substring matching was the first attempt and it was wrong in both directions:
 * it flagged BRAVO for a clue containing "bra", and ALLRA for "alla", neither
 * of which reveals anything. What actually reveals an answer is a real
 * morphological relationship, which is two cases:
 *
 *   the clue word is built on the answer   BRAND clued with "brandkåren"
 *   the answer is the clue word inflected  BLIR clued with "bli"
 *
 * Anything else — a shared first three letters, a coincidence — is not a
 * relationship and is not flagged.
 */
export function revealsAnswer(clueWord: string, answer: string): boolean {
  if (clueWord === answer) return true;

  // The clue word is the answer plus more: a compound or a derivation.
  // Four characters, so "att" does not fire on "attack".
  if (answer.length >= 4 && clueWord.startsWith(answer)) return true;

  // The answer is the clue word plus an inflectional ending.
  if (clueWord.length >= 3 && answer.startsWith(clueWord)) {
    const suffix = answer.slice(clueWord.length);
    for (const lang of LANGS) {
      if (SUFFIXES[lang].includes(suffix)) return true;
    }
  }
  return false;
}

export function checkClue(clue: string, answer: string, lang: Lang): ClueProblem[] {
  const problems: ClueProblem[] = [];
  const text = clue.trim();
  if (text.length === 0) return [{ kind: "empty", detail: "no clue" }];

  const words = text.split(/\s+/);
  if (words.length > MAX_CLUE_WORDS) {
    problems.push({ kind: "too-long", detail: `${words.length} words` });
  }

  const bare = words.map((w) => w.toLowerCase().replace(/[^\p{L}]/gu, "")).filter(Boolean);
  if (bare.includes(answer)) {
    problems.push({ kind: "contains-answer", detail: answer });
  } else {
    const stem = bare.find((w) => revealsAnswer(w, answer));
    if (stem) problems.push({ kind: "contains-stem", detail: stem });
  }

  const lower = text.toLowerCase();
  const hard = HARD_TELLS[lang].find((t) => lower.includes(t));
  if (hard) {
    problems.push({ kind: "form-tell", detail: hard });
  } else {
    const soft = SOFT_TELLS[lang].find((t) =>
      new RegExp(`(,\\s*|^)(i\\s+)?${t}\\s*$`, "iu").test(lower),
    );
    if (soft) problems.push({ kind: "form-tell", detail: soft });
  }

  return problems;
}

/**
 * Crude words are barred from clue text as well as from answers.
 *
 * The `name` and `junk` reasons are deliberately ignored here: they exist to
 * keep a word from being the hidden answer, not to bar it from a clue. The
 * pilot flagged "sandy" in an English clue because Sandy is on the name list,
 * which is a false positive — the clue uses the adjective. Rule 3 (no proper
 * nouns) is therefore left to the verification pass, which can see the sense.
 */
export function checkCrude(clue: string, lang: Lang): string[] {
  return clue
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .filter((w) => {
      const reason = answerBlockReason(w, lang);
      if (reason === null || reason === "name" || reason === "junk") return false;
      // A crude *stem* only counts when it starts the word. The answer-pool
      // matcher is a substring test, which is right for answers and wrong for
      // clue prose: it read "turd" inside "sturdy", "runk" inside "prunkande",
      // "horny" inside "thorny" and "tutt" inside "kraftuttryck".
      if (reason.startsWith("stem:")) return w.startsWith(reason.slice(5));
      return true;
    });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Words that must never be clued, because nobody can clue them. */
export function loadCutList(): Set<string> {
  const path = join(OUT_DIR, "cut.json");
  if (!existsSync(path)) return new Set();
  return new Set(JSON.parse(readFileSync(path, "utf8")) as string[]);
}

function main(): void {
  const args = process.argv.slice(2);
  if (!args.includes("--select")) {
    throw new Error(
      "Use --select to pick the pilot sample, scripts/run-clue-pilot.ts to compare " +
        "models, or scripts/generate-clues.ts for the bulk run.",
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const sample: Record<string, Picked[]> = {};

  for (const lang of LANGS) {
    const facts = inventory(lang);
    const picked = pickPilot(lang, facts);
    sample[lang] = picked;
    console.log(`\n  ${lang}: ${facts.size} distinct words in banks, ${picked.length} picked`);
    for (const reason of ["inflection", "3-letter", "multi-bank", "spread"]) {
      const group = picked.filter((p) => p.reason === reason);
      console.log(
        `    ${reason.padEnd(11)} ${String(group.length).padStart(2)}  ` +
          group.map((p) => `${p.word}${p.neighbours ? `~${p.neighbours}` : ""}`).join(" "),
      );
    }
  }

  writeFileSync(join(OUT_DIR, "pilot-sample.json"), `${JSON.stringify(sample, null, 2)}\n`);
  console.log(`\n  wrote ${join(OUT_DIR, "pilot-sample.json")}`);
}

// Only when run directly. Other scripts import the rules and the sampler from
// here, and importing a module must not execute its command line.
if (process.argv[1]?.endsWith("build-clues.ts")) main();
