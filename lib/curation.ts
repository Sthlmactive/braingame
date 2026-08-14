import type { Lang } from "./i18n";

/**
 * Hand curation, applied to the ANSWER pool only. Every word here stays a
 * perfectly valid guess; it just never becomes the hidden word.
 *
 * Everything that can be decided from a source is decided there instead:
 *
 *   Swedish proper nouns   SALDO's own `pm` tag, 22k forms, applied at build
 *                          time. That is what catches "kalle" and "ystad",
 *                          which slip through the dictionary filter because
 *                          they carry a second, non proper noun reading.
 *   English obscurities    SCOWL size bands. Answers stop at size 55, which
 *                          removes the 60 and 70 tail where names like
 *                          "ariel", "merle", "dexter" and "bilbo" live.
 *
 * What is left are the two cases no source can settle: English words that are
 * both an ordinary noun and a common first name, and words that are simply not
 * wanted as a hidden word. Those are listed here, by hand, and this list is
 * therefore incomplete by construction. Adding to it is a one line change.
 */

/** Ordinary English words that read as names to anyone playing. */
const EN_NAMES = [
  "tom",
  "peter",
  "nappy",
  "pygmy",
  "japan",
  "phoebe",
  "marcel",
  "carter",
  "victor",
  "martin",
  "logan",
  "jasper",
  "morris",
  "nelson",
  "graham",
  "warren",
  "harper",
  "mercer",
  "deacon",
  "hooper",
  "cooper",
  "walker",
  "parker",
  "porter",
  "hunter",
  "sawyer",
  "murphy",
  "bailey",
  "kelly",
  "sandy",
  "daisy",
  "violet",
  "aurora",
  "carol",
  "donna",
  "maria",
  "molly",
  "sally",
  "jenny",
  "nancy",
  "terry",
  "jerry",
  "billy",
  "bobby",
  "benny",
  "sonny",
  "randy",
  "wally",
  "butch",
  "henry",
  "hector",
  "louis",
  "lewis",
  "baker",
  "fisher",
  "miller",
  "berlin",
  "wales",
  "aspen",
  "sierra",
  "villa",
  "plaza",
];

/**
 * Crude words are blocked by stem rather than one form at a time, because a
 * word list leaks a new inflection on every rebuild: "skita" was caught but
 * "skiter", "skitit" and "skitig" were not.
 *
 * The cost of a stem is collision, so each one carries its exceptions. Those
 * are the whole reason this is reviewed by hand: "pröva" contains röv,
 * "analys" contains anal, and "grape" contains rape.
 */
const CRUDE_STEMS: Record<Lang, readonly string[]> = {
  sv: [
    // "röv" alone is unusable: it sits inside röva (to rob), rövare (robber),
    // sjörövare (pirate), erövra (conquer), bedrövad (distressed), pröva (try)
    // and förövare (perpetrator). Only the compound is unambiguous.
    "rövhål",
    "skit",
    "kuk",
    "fitt",
    "bög",
    "neger",
    "nigger",
    "snopp",
    "snippa",
    "piss",
    "bajs",
    "jävl",
    "kärring",
    "subba",
    "penis",
    "slyn",
    "slid",
    "fjolla",
    "tutt",
    "patta",
    "knull",
    "runk",
    "sperma",
    "snusk",
    "porr",
    "orgas",
    "samlag",
    "hora",
    "horan",
    "horas",
    "horar",
    "horor",
    "horhus",
  ],
  en: [
    "fuck",
    "cunt",
    "shit",
    "nigg",
    "fagg",
    "whor",
    "slut",
    "rape",
    // "rapi" caught rapid, rapidly, rapids, scraping, therapies and therapist
    // for one true hit, and "semen" caught only amusement, basement and
    // horsemen. Both are listed by exact form instead.
    "rapist",
    "raping",
    "piss",
    "wank",
    "douche",
    "porn",
    "pube",
    "spunk",
    "queer",
    "boob",
    "turd",
    "scrot",
    "vagin",
    "dick",
    "titty",
    "tits",
    "bugger",
    "crappy",
    "horny",
  ],
};

/**
 * Innocent words that happen to contain a stem. Every one of these was found
 * in a real bucket, not imagined.
 */
const CRUDE_EXCEPTIONS: Record<Lang, readonly string[]> = {
  sv: [
    // röv
    "pröva",
    "prövar",
    "prövas",
    "prövat",
    "prövad",
    "prövade",
    "beröva",
    "berövad",
    "berövat",
    "erövra",
    "erövrad",
    "erövrat",
    "grövre",
    "ströva",
    "strövar",
    "strövat",
    // porr
    "sporra",
    "sporre",
    "sporrar",
    // LDNOOBW over-blocks these; every one is an ordinary Swedish word.
    "hård",
    "hårda",
    "hårt",
    "sås",
    "såsen",
    "stake",
    "staken",
    "tusan",
    "fan",
  ],
  en: [
    // rape
    "grape",
    "grapes",
    "drape",
    "drapes",
    "draped",
    "draper",
    "scrape",
    "scrapes",
    "scraped",
    "trapeze",
    "grapevine",
    "parapet",
    // rapist
    "therapist",
    "therapists",
    // dick
    "dickey",
    "dickens",
    // boob
    "booby",
    // wank
    "swank",
    "swanky",
    // LDNOOBW over-blocks these; all are ordinary English words.
    "escort",
    "escorts",
    "erotic",
    "nude",
    "nudity",
    "snatch",
    "suck",
    "sucks",
    "butt",
    "butts",
    "scat",
    "sex",
    "sexual",
    "sexually",
    "sexuality",
    "sexy",
    "grope",
  ],
};

/**
 * Words we will not hide, in either language, that no stem catches. The
 * player can still type them and be told they are real words.
 */
const CRUDE: Record<Lang, readonly string[]> = {
  en: [
    // Ethnic slurs found in the 3 to 5 letter fill pool when Mini extended the
    // pipeline down to three letters. Exact forms, because every one of these
    // sits inside an innocent word: gypsum, Egyptian, swop, pervade, pimpernel.
    "squaw",
    "squaws",
    "gyp",
    "gyps",
    "gypsy",
    "gypsies",
    "wop",
    "wops",
    "dago",
    "dagos",
    "gook",
    "gooks",
    "perv",
    "pervs",
    "pimp",
    "pimps",
    "pussy",
    "prick",
    "cocks",
    "cocked",
    "dicks",
    "whitey",
    "penis",
    "labia",
    "dildo",
    "orgasm",
    "nigger",
    "honky",
    "chink",
    "wetback",
    "tranny",
    "retard",
    "whore",
    "bitch",
    "semen",
    "rapists",
    "spics",
    "twats",
    "boobs",
    "titty",
    "horny",
    "herpes",
    "vagina",
    "scrotum",
    "rectum",
    "faggot",
    "cunts",
    "shits",
    "turds",
    "queef",
    "nutsack",
  ],
  sv: [
    // Same sweep, Swedish side.
    "squaw",
    "pervo",
    "röv",
    "röven",
    "bolin",
    "knull",
    "knulla",
    "porren",
    "flatan",
    "kukar",
    "kuken",
    "fitta",
    "fittan",
    "bögig",
    "bögen",
    "hora",
    "horan",
    "horor",
    "snorre",
    "pungen",
    "analt",
    "samlag",
    "orgasm",
    "snoppen",
    "snippa",
    "brudar",
    "jävlar",
    "kärring",
    "neger",
    "negern",
    "bajsa",
    "bajset",
    "pissa",
    "pisset",
  ],
};

/**
 * Which rule holds this word out of the answer pool, or null if none does.
 *
 * The reason is reported rather than a bare boolean so the build can write
 * docs/answer-removals.md, where a false positive is visible as a diff. An
 * exception list built by looking at one pool does not necessarily fit the
 * next one, so the removals have to be reviewable rather than assumed correct.
 *
 * `external` is the LDNOOBW list, passed in because it is fetched at build
 * time; at runtime there is nothing to check and it is simply absent.
 */
export function answerBlockReason(
  word: string,
  lang: Lang,
  external?: ReadonlySet<string>,
): string | null {
  if (CRUDE[lang].includes(word)) return "list";
  if (lang === "en" && EN_NAMES.includes(word)) return "name";
  // Exceptions override the pattern layers, LDNOOBW included: that list is
  // built for content moderation, where over blocking is cheap, and it holds
  // "hård", "sås" and "escort". It does not override CRUDE above, which is
  // our own deliberate choice.
  if (CRUDE_EXCEPTIONS[lang].includes(word)) return null;
  if (external?.has(word)) return "ldnoobw";
  const stem = CRUDE_STEMS[lang].find((s) => word.includes(s));
  return stem === undefined ? null : `stem:${stem}`;
}

/** Never the hidden word, in this language. */
export function isAnswerBlocked(
  word: string,
  lang: Lang,
  external?: ReadonlySet<string>,
): boolean {
  return answerBlockReason(word, lang, external) !== null;
}

/**
 * Fine as an answer, but not as an EASY one. Kept separate from the block
 * list so the word still shows up, just one bucket further out.
 */
const NOT_EASY: Record<Lang, readonly string[]> = {
  // Literary. A twelve year old is not expected to know it.
  sv: ["skåda"],
  en: [],
};

export function isEasyBlocked(word: string, lang: Lang): boolean {
  return NOT_EASY[lang].includes(word);
}
