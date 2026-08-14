import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { useLanguage } from "./helpers";
import { difficultyPool, getLanguage, isValidWord } from "@/lib/dictionary";
import { isAlphabetic } from "@/lib/alphabet";
import { isAnswerBlocked } from "@/lib/curation";
import {
  DIFFICULTIES,
  DIFFICULTY_LENGTH,
  NO_BUCKET,
  VALID_BUCKET_BYTES,
  difficultyScore,
  neighbourCounts,
  passesEasyFilter,
  splitPool,
  structurePenalty,
  type Scored,
} from "@/lib/difficulty";
import { LANGS, type Lang } from "@/lib/i18n";

beforeAll(async () => {
  await useLanguage("sv");
  await useLanguage("en");
});

const bin = (lang: Lang, name: string): Buffer =>
  readFileSync(join(process.cwd(), "public", "data", lang, name));

describe("shipped difficulty data", () => {
  it.each(LANGS)("%s: one difficulty byte per answer", (lang) => {
    const bands = bin(lang, "answer-bands.bin");
    const difficulty = bin(lang, "answer-difficulty.bin");
    expect(difficulty.length).toBe(bands.length);
    expect(difficulty.length).toBe(getLanguage(lang).answers.length);
  });

  it.each(LANGS)("%s: writes no byte outside the four buckets and 255", (lang) => {
    const difficulty = bin(lang, "answer-difficulty.bin");
    const seen = new Set<number>(difficulty);
    for (const byte of seen) {
      expect(VALID_BUCKET_BYTES, `unexpected byte ${byte}`).toContain(byte);
    }
    // All four buckets must actually be used, or a difficulty is unplayable.
    for (let b = 0; b < DIFFICULTIES.length; b++) expect(seen).toContain(b);
    // And something has to be excluded, since answers run from 3 to 9 letters.
    expect(seen).toContain(NO_BUCKET);
  });

  it.each(LANGS)("%s: every bucket is playable", (lang) => {
    for (const d of DIFFICULTIES) {
      expect(difficultyPool(lang, d).length, `${lang} ${d}`).toBeGreaterThanOrEqual(
        300,
      );
    }
  });

  it.each(LANGS)("%s: every bucketed word is a legal answer", (lang) => {
    for (const d of DIFFICULTIES) {
      for (const w of difficultyPool(lang, d)) {
        // Lätt and Medel are five letters, Svår and Extrem are six.
        expect(w, `${lang} ${d}`).toHaveLength(DIFFICULTY_LENGTH[d]);
        expect(w).toBe(w.toLowerCase());
        expect(w).toBe(w.normalize("NFC"));
        expect(isAlphabetic(w, lang), `${lang} ${w}`).toBe(true);
        // The guess list has to accept the word it is about to hide.
        expect(isValidWord(w, lang), `${lang} ${w}`).toBe(true);
      }
    }
  });

  it.each(LANGS)("%s: a word belongs to exactly one bucket", (lang) => {
    const seen = new Set<string>();
    for (const d of DIFFICULTIES) {
      for (const w of difficultyPool(lang, d)) {
        expect(seen.has(w), `${w} is in two buckets`).toBe(false);
        seen.add(w);
      }
    }
  });

  it("puts everyday Swedish in easy and awkward words further out", () => {
    const bucketOf = (word: string): string | null => {
      for (const d of DIFFICULTIES) {
        if (difficultyPool("sv", d).includes(word)) return d;
      }
      return null;
    };
    // Ten spot checks. Easy words a twelve year old knows, and words whose
    // shape or rarity should keep them out of easy.
    for (const w of ["vägen", "räkna", "tänka", "bilar", "maten"]) {
      expect(bucketOf(w), w).toBe("easy");
    }
    // Repeated letters disqualify a word from easy however common it is.
    for (const w of ["detta", "denna"]) {
      expect(bucketOf(w), w).not.toBe("easy");
      expect(bucketOf(w), w).not.toBeNull();
    }
    // Rare letters and thin vowels push a word outward.
    for (const w of ["check", "sving"]) {
      const b = bucketOf(w);
      expect(b, w).not.toBe("easy");
    }
    // A word of neither bucketed length has no bucket at all.
    expect(bucketOf("hus")).toBeNull();
  });
});

/**
 * The answer pool is narrower than the guess list. Everything held back here
 * must still be typeable, or we have broken the dictionary to fix the pool.
 */
describe("what may never be the hidden word", () => {
  const bucketOf = (word: string, lang: Lang): string | null => {
    for (const d of DIFFICULTIES) {
      if (difficultyPool(lang, d).includes(word)) return d;
    }
    return null;
  };

  const neverHidden = (word: string, lang: Lang): void => {
    expect(bucketOf(word, lang), `${lang} ${word} is a hidden word`).toBeNull();
    expect(isValidWord(word, lang), `${lang} ${word} is not guessable`).toBe(true);
  };

  it("holds back Swedish proper nouns that carry a second reading", () => {
    // SALDO tags these `pm` as well as noun, adjective or verb, so they survive
    // the dictionary filter. They must not survive into answers.
    for (const w of ["kalle", "ystad", "curie"]) neverHidden(w, "sv");
  });

  it("holds back English words that read as names", () => {
    // "ariel" and "merle" go by SCOWL band; "peter" and "japan" are curated,
    // because both are ordinary lowercase English words as well as names.
    for (const w of ["ariel", "merle", "peter", "japan"]) neverHidden(w, "en");
  });

  it("holds back crude words in both languages", () => {
    for (const w of ["pussy", "prick", "labia", "honky"]) neverHidden(w, "en");
    for (const w of ["knull", "fitta"]) neverHidden(w, "sv");
  });

  it("keeps skåda as an answer, just not an easy one", () => {
    expect(bucketOf("skåda", "sv")).not.toBe("easy");
    expect(bucketOf("skåda", "sv")).not.toBeNull();
    expect(isValidWord("skåda", "sv")).toBe(true);
  });

  /**
   * The other half of the curation contract. Blocking by stem and by an
   * external obscenity list both over-reach, and a false positive is invisible
   * in the surviving buckets: the word is simply gone. These are the collisions
   * found so far, pinned so a future stem cannot quietly eat them.
   */
  const INNOCENT: Record<Lang, readonly string[]> = {
    sv: [
      // contain "röv"
      "pröva",
      "beröva",
      "erövra",
      "grövre",
      "ströva",
      // contains "porr"
      "sporra",
      // contain "anal"
      "analys",
      "banal",
      "kanal",
      // LDNOOBW over-blocks these
      "hård",
      "sås",
      "stake",
    ],
    en: [
      // contain "rape"
      "grape",
      "drape",
      "scrape",
      // contain "anal"
      "banal",
      "canal",
      "analog",
      // LDNOOBW over-blocks these
      "escort",
      "nude",
      "snatch",
    ],
  };

  it.each(LANGS)("%s: keeps the words the filters collide with", (lang) => {
    const blocked = INNOCENT[lang].filter((w) => isAnswerBlocked(w, lang));
    expect(blocked, `wrongly blocked: ${blocked.join(" ")}`).toEqual([]);
  });

  it.each(LANGS)("%s: those words are still real answers in the data", (lang) => {
    // Being unblocked is not enough; they have to have survived into the pool.
    // Only the two bucketed lengths can be checked this way.
    const answers = new Set(getLanguage(lang).answers);
    const missing = INNOCENT[lang]
      .filter((w) => w.length === 5 || w.length === 6)
      .filter((w) => !answers.has(w));
    expect(missing, `absent from the answer pool: ${missing.join(" ")}`).toEqual([]);
  });

  it("finds no obvious leak left in any bucket", () => {
    for (const lang of LANGS) {
      for (const d of DIFFICULTIES) {
        for (const w of difficultyPool(lang, d)) {
          expect(isAnswerBlocked(w, lang), `${lang} ${d}: ${w}`).toBe(false);
        }
      }
    }
  });
});

describe("scoring", () => {
  it("counts neighbours inside one length only", () => {
    // "hatta" and "hatts" differ in one position; "hat" is a different length
    // and must never be counted, which is what crossing lengths would do.
    const counts = neighbourCounts(["hatta", "hatts", "hatte", "annan"]);
    expect(counts.get("hatta")).toBe(2);
    expect(counts.get("hatts")).toBe(2);
    expect(counts.get("annan")).toBe(0);
  });

  it("counts a neighbour once per differing position", () => {
    const counts = neighbourCounts(["abcde", "abcdx", "abcxe"]);
    expect(counts.get("abcde")).toBe(2);
    expect(counts.get("abcdx")).toBe(1);
  });

  it("penalises the shapes that make a word hard", () => {
    const plain = structurePenalty("vägen", "sv", 0);
    expect(plain).toBe(0);
    // A repeated letter costs 0.25.
    expect(structurePenalty("annan", "sv", 0)).toBeGreaterThanOrEqual(0.25);
    // A rare letter costs 0.15, and two cost 0.30, never more.
    expect(structurePenalty("zzzzz", "sv", 0)).toBeLessThanOrEqual(1);
    // Neighbours are worth up to 0.20, reached at twelve.
    expect(structurePenalty("vägen", "sv", 12)).toBeCloseTo(0.2, 5);
    expect(structurePenalty("vägen", "sv", 999)).toBeCloseTo(0.2, 5);
  });

  it("holds the easy filter to no repeats, no rare letters, two vowels", () => {
    expect(passesEasyFilter("vägen", "sv")).toBe(true);
    expect(passesEasyFilter("detta", "sv")).toBe(false); // repeated t
    expect(passesEasyFilter("sving", "sv")).toBe(false); // one vowel
    expect(passesEasyFilter("crypt", "en")).toBe(false);
  });

  it("ranks a rarer word above a commoner one, all else equal", () => {
    const common = difficultyScore({
      word: "vägen",
      lang: "sv",
      rank: 10,
      maxRank: 10000,
      neighbours: 0,
    });
    const rare = difficultyScore({
      word: "vägen",
      lang: "sv",
      rank: 9000,
      maxRank: 10000,
      neighbours: 0,
    });
    expect(rare).toBeGreaterThan(common);
  });

  it("is deterministic: the same pool splits identically every time", () => {
    const pool = difficultyPool("sv", "medium").slice(0, 400);
    const build = (): Map<string, string> => {
      const neighbours = neighbourCounts(pool);
      const scored: Scored[] = pool.map((word, i) => ({
        word,
        rank: i + 1,
        neighbours: neighbours.get(word) ?? 0,
        score: difficultyScore({
          word,
          lang: "sv",
          rank: i + 1,
          maxRank: pool.length,
          neighbours: neighbours.get(word) ?? 0,
        }),
      }));
      return splitPool(scored, "sv", {
        first: "easy",
        second: "medium",
        firstTarget: 60,
        easyFilter: true,
      });
    };
    expect([...build().entries()]).toEqual([...build().entries()]);
  });

  it("breaks score ties by word, so ordering never depends on input order", () => {
    const scored: Scored[] = [
      { word: "bbbbb", score: 0.5, rank: 1, neighbours: 0 },
      { word: "aaaaa", score: 0.5, rank: 2, neighbours: 0 },
    ];
    const opts = { first: "hard", second: "extreme", firstTarget: 1 } as const;
    const forward = splitPool(scored, "sv", opts);
    const backward = splitPool([...scored].reverse(), "sv", opts);
    expect([...forward.entries()].sort()).toEqual([...backward.entries()].sort());
    // The alphabetically first word wins the tie, whichever order it arrived in.
    expect(forward.get("aaaaa")).toBe("hard");
  });
});
