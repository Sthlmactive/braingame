import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { useLanguage } from "./helpers";
import { isValidWord } from "@/lib/dictionary";
import { isAlphabetic } from "@/lib/alphabet";
import { isAnswerBlocked } from "@/lib/curation";
import { DIFFICULTIES } from "@/lib/difficulty";
import {
  FILL_LENGTHS,
  MINI_FILL_BANDS,
  THREE_LETTER_RANK_CAP,
  bandPool,
  fillWords,
  hasNoVowel,
  type FillPool,
} from "@/lib/fill";
import { LANGS, type Lang } from "@/lib/i18n";
import type { Scored } from "@/lib/difficulty";

/**
 * Mini's fill pool. Every letter in a mini crossword is checked twice, so a
 * single bad fill word ruins two entries at once; these are the guarantees
 * that stop one getting in.
 */

beforeAll(async () => {
  await useLanguage("sv");
  await useLanguage("en");
});

const pools: Record<Lang, FillPool> = {
  sv: JSON.parse(readFileSync(join(process.cwd(), "data", "fill", "sv.json"), "utf8")),
  en: JSON.parse(readFileSync(join(process.cwd(), "data", "fill", "en.json"), "utf8")),
};

const every = (lang: Lang): string[] =>
  FILL_LENGTHS.flatMap((len) =>
    DIFFICULTIES.flatMap((band) => pools[lang][len]?.[band] ?? []),
  );

describe("fill pool shape", () => {
  it.each(LANGS)("%s covers exactly the three fill lengths", (lang) => {
    expect(Object.keys(pools[lang]).map(Number).sort()).toEqual([3, 4, 5]);
  });

  it.each(LANGS)("%s words are the right length, case and charset", (lang) => {
    for (const len of FILL_LENGTHS) {
      for (const band of DIFFICULTIES) {
        for (const w of pools[lang][len]![band]) {
          expect(w, `${lang} ${len} ${band}`).toHaveLength(len);
          expect(w).toBe(w.toLowerCase());
          expect(w).toBe(w.normalize("NFC"));
          expect(isAlphabetic(w, lang), `${lang} ${w}`).toBe(true);
        }
      }
    }
  });

  it.each(LANGS)("%s puts every word in exactly one band", (lang) => {
    const seen = new Set<string>();
    for (const w of every(lang)) {
      expect(seen.has(w), `${w} is in two bands`).toBe(false);
      seen.add(w);
    }
  });

  it.each(LANGS)("%s bands are non-empty at every length", (lang) => {
    for (const len of FILL_LENGTHS) {
      for (const band of DIFFICULTIES) {
        expect(pools[lang][len]![band].length, `${lang} ${len} ${band}`).toBeGreaterThan(
          0,
        );
      }
    }
  });
});

describe("fill pool contents", () => {
  // The whole point: fill is drawn from the answer pool, not the guess list.
  it.each(LANGS)("%s: every fill word is a real word in that language", (lang) => {
    const bad = every(lang).filter((w) => !isValidWord(w, lang));
    expect(bad, `not in the guess list: ${bad.join(" ")}`).toEqual([]);
  });

  it.each(LANGS)("%s: no fill word is one curation holds back", (lang) => {
    const bad = every(lang).filter((w) => isAnswerBlocked(w, lang));
    expect(bad, `curation-blocked words in the fill pool: ${bad.join(" ")}`).toEqual(
      [],
    );
  });

  it.each(LANGS)("%s: no slur survived the three letter extension", (lang) => {
    // Found by scanning the pool when Mini reached down to three letters.
    const pool = new Set(every(lang));
    for (const w of ["squaw", "gyp", "gypsy", "wop", "dago", "gook", "perv", "pimp"]) {
      expect(pool.has(w), `${lang} fill pool still contains ${w}`).toBe(false);
    }
  });

  it.each(LANGS)("%s: three letter fill is capped at the commonest few", (lang) => {
    const three = DIFFICULTIES.flatMap((b) => pools[lang][3]![b]);
    expect(three.length).toBeLessThanOrEqual(THREE_LETTER_RANK_CAP);
  });

  /**
   * Interjections and abbreviations go by category, not by frequency: they are
   * common enough to survive any rank cut and useless as entries, because an
   * interjection has no definition to clue and an abbreviation has no letters
   * to deduce. Swedish reads SALDO's `in` and `nna`/`pma`/`aba`/`ava`/`ppa`
   * tags; English has no part of speech, so SCOWL's size band stands in.
   */
  it.each(LANGS)("%s: three letter fill holds no noises", (lang) => {
    const three = new Set(DIFFICULTIES.flatMap((b) => pools[lang][3]![b]));
    const junk =
      lang === "sv"
        ? ["hmm", "aha", "sch", "pst", "voj", "bah", "nja", "tja", "blä",
           "sms", "dvd", "gps", "dna", "tbc", "pga", "tex", "mrs"]
        : ["hmm", "shh", "ooh", "aah", "yep", "yup", "nah", "duh", "aha",
           "moi", "guv", "yea", "ops"];
    for (const w of junk) {
      expect(three.has(w), `${lang} three letter fill contains ${w}`).toBe(false);
    }
  });

  it("removes every word with no vowel at all", () => {
    for (const w of ["shh", "hmm", "pst", "brr", "tsk"]) {
      expect(hasNoVowel(w), w).toBe(true);
    }
    for (const w of ["dog", "här", "yes", "åka"]) {
      expect(hasNoVowel(w), w).toBe(false);
    }
  });

  it("keeps an abbreviation's ordinary homograph", () => {
    // Ba -> "bas", Ga -> "gas", OS -> "oss", ha (hectare) -> "har". Every one
    // has an ordinary reading too, so only-ever semantics keeps them.
    const three = new Set(DIFFICULTIES.flatMap((b) => pools.sv[3]![b]));
    // "sal" is absent for an unrelated reason: it misses the commonest-250 cut.
    for (const w of ["gas", "oss", "har", "bas", "led"]) {
      expect(three.has(w), `sv three letter fill lost ${w}`).toBe(true);
    }
  });
});

describe("difficulty band mapping", () => {
  it("gives every Mini difficulty adjacent bands, hardest last", () => {
    expect(MINI_FILL_BANDS.easy).toEqual(["easy", "medium"]);
    expect(MINI_FILL_BANDS.hard).toEqual(["medium", "hard"]);
    // Extrem takes a third band because a fully checked 5x5 needs the width;
    // see the measurement in lib/fill.ts.
    expect(MINI_FILL_BANDS.extreme).toEqual(["medium", "hard", "extreme"]);
  });

  it.each(LANGS)("%s: every difficulty can draw at all three lengths", (lang) => {
    for (const d of DIFFICULTIES) {
      const words = fillWords(pools[lang], MINI_FILL_BANDS[d]);
      for (const len of FILL_LENGTHS) {
        expect(words.get(len)!.length, `${lang} ${d} at ${len}`).toBeGreaterThan(15);
      }
    }
  });
});

describe("banding is deterministic", () => {
  const scored: Scored[] = Array.from({ length: 200 }, (_, i) => ({
    word: `w${String(i).padStart(3, "0")}`,
    rank: i + 1,
    neighbours: i % 5,
    score: (i * 37) % 200 / 200,
  }));

  it("produces the same split every time", () => {
    expect([...bandPool(scored, "en").entries()]).toEqual([
      ...bandPool(scored, "en").entries(),
    ]);
  });

  it("does not depend on input order", () => {
    const a = [...bandPool(scored, "en").entries()].sort();
    const b = [...bandPool([...scored].reverse(), "en").entries()].sort();
    expect(a).toEqual(b);
  });
});
