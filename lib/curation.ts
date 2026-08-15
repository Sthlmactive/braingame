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

/** Ordinary words that read as a name to anyone playing. */
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
  // Both have an ordinary reading — a rhea is a flightless bird, a saki a South
  // American monkey — and both read as a name to anyone who has not met the
  // animal. They surfaced in Mini's gentlest bank, where every letter is
  // checked twice, which is the worst place for a word nobody can confirm.
  "rhea",
  "saki",
];

/**
 * The same, in Swedish.
 *
 * SALDO's `pm` tag catches proper nouns at build time, so this list is only
 * for the case the tag cannot see: a word with a perfectly ordinary lemma that
 * a player reads as a name anyway. `senna` is a real SALDO noun — the plant,
 * `nn_0u_radar` — and is still the racing driver to anyone who meets it in a
 * grid, where every letter is checked twice and a wrong guess is unrecoverable.
 */
const SV_NAMES = ["senna"];

/**
 * Swedish words reviewed against SALDO and **kept**, recorded so the same three
 * are not re-litigated on the next pass through Mini's fill.
 *
 * All three look like names and are not:
 *
 *   kåre   lemma, `nn`, paradigm nn_2u_vinge — a gust of wind, cf. vindkåre
 *   remi   lemma, `nn`, paradigm nn_3u_akademi — the draw, in chess
 *   yves   not a lemma at all: the present s-form and imperative of `yvas`
 */

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

    // --- Added after reading Mini's Swedish fill pool, all three lengths ----
    // The list above was built from LDNOOBW, which is an English-first list
    // with 43 Swedish entries, and it showed: FNASK, ARSEL and ONANI were in
    // three of five sampled Extrem grids. A mini clues every word on screen,
    // so a miss here is not a rare bad answer, it is a clue commissioned for
    // it. These are the stems that are safe as substrings; everything whose
    // stem collides with an ordinary word is listed by exact form in CRUDE.
    "fnask",
    "sköka",
    "skökor",
    "otukt",
    "orgie",
    "jucka",
    "pinka",
    "fjärt",
    "dildo",
    "bimbo",
    "bitch",
    "miffo",
    "fetto",
    "hagga",
    // "arsel" as a stem eats "varsel", a notice. The plural stem is safe:
    // varsel has "arse", not "arsl".
    "arsl",
    // "onan" would eat "resonans". The verb is listed on its own.
    "onaner",
    // "fis" would eat fisk, fiska, fiskar. "fisa" only catches the verb, and
    // "fiser" has to be listed separately because it does not contain it.
    "fisa",
    "fiser",
    // "bajs" above misses the verb, which is spelled without the s.
    // Known collision: "bajadär", a word nobody has used since 1890.
    "baja",
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
    // kissa
    "kisse",
    "kissen",
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

    // --- Added after reading Mini's Swedish fill pool, all three lengths ----
    // Exact forms only: each of these sits inside an ordinary word, so a stem
    // would take good answers with it. The collision is named on each line.
    "arsel", // varsel
    "kissa", // skissa; kisse and kissen are the cat
    "kissar",
    "kissat",
    "kissade",
    "luder", // inkludera
    "ludret",
    "ludren",
    "anal", // analys, analog, banal, kanal
    "anala",
    "anus", // anusen has no other reading, but "anus" is inside nothing else
    "balle", // ballerina, ballad
    "ballen",
    "ballar",
    "kåt", // kåta and kåtor are also the Sami hut
    "kåta",
    "kåten",
    "kåtare",
    "homo", // homogen, homonym, homonymi
    "kiss", // kisse and kissen are the cat
    "mongo", // mongolisk, and the country, which is a proper noun anyway
    "jävel", // the "jävl" stem misses it: jävel has an e where jävla has none
    "jäveln",
    "onani", // resonans contains "onan"
    "pung", // pungdjur, and pung is an ordinary purse in older use
    "pungar",
    "sate", // satellit, satsa, satin
    "saten",
    "satar",
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
/**
 * Forms the pipeline can defend and a player cannot.
 *
 * SALDO generates them from real paradigms, so they pass every automatic gate,
 * and they still read as a mistake in a grid. `koman` is the definite of the
 * loanword `koma`, which nobody inflects; `iland` is two words, `i land`, and
 * only ever appears run together by accident.
 *
 * Not crude, so it gets its own reason rather than being filed under one.
 */
const JUNK: Record<Lang, readonly string[]> = {
  // `kanan` is the definite of `kana`, the slide you take on ice. Three
  // different models were asked to clue it in the pilot and produced a sore on
  // the foot, a bird in a pot, and the stern of a boat. When three independent
  // writers all miss the same word, the word is the problem — see the
  // unclueable rule in docs/mini-spec.md.
  sv: ["koman", "iland", "kanan"],
  en: [],
};

export function answerBlockReason(
  word: string,
  lang: Lang,
  external?: ReadonlySet<string>,
): string | null {
  if (CRUDE[lang].includes(word)) return "list";
  if (JUNK[lang].includes(word)) return "junk";
  if (lang === "en" && EN_NAMES.includes(word)) return "name";
  if (lang === "sv" && SV_NAMES.includes(word)) return "name";
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
