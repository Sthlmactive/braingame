import { beforeAll, describe, expect, it } from "vitest";
import { useLanguage } from "./helpers";
import {
  alphabet,
  answerPool,
  decodeFrontCoded,
  isValidWord,
  languageMeta,
  poolSize,
  randomWord,
  wordsFromLetters,
  wordsMatching,
} from "@/lib/dictionary";
import { NOT_WORDS, SEED_WORDS } from "./seed-words";
import { BAND_NAMES } from "@/lib/bands";
import { compareWords, isAlphabetic, normalise } from "@/lib/alphabet";
import { mulberry32 } from "@/lib/rng";

beforeAll(async () => {
  await useLanguage("en");
  await useLanguage("sv");
});

describe("front coding", () => {
  it("round trips", () => {
    expect(decodeFrontCoded("0cat\n2ch\n0dog")).toEqual(["cat", "cach", "dog"]);
  });
});

describe("isValidWord", () => {
  it("accepts ordinary English words", () => {
    for (const w of ["cat", "house", "bridge", "quiet", "thought", "zebra"]) {
      expect(isValidWord(w, "en"), w).toBe(true);
    }
  });

  it("accepts ordinary Swedish words", () => {
    for (const w of ["hus", "katt", "stol", "vatten", "kärlek", "sjö", "ärta"]) {
      expect(isValidWord(w, "sv"), w).toBe(true);
    }
  });

  it("accepts Swedish inflected forms, not only lemmas", () => {
    for (const w of ["hundar", "hundarna", "husen", "sprang", "skrivit"]) {
      expect(isValidWord(w, "sv"), w).toBe(true);
    }
  });

  it("rejects non words", () => {
    for (const w of ["qqqq", "zzzzzz", "xkcdq"]) {
      expect(isValidWord(w, "en"), w).toBe(false);
      expect(isValidWord(w, "sv"), w).toBe(false);
    }
  });

  it("is case and normalisation insensitive on input", () => {
    expect(isValidWord("HOUSE", "en")).toBe(true);
    expect(isValidWord("KÄRLEK", "sv")).toBe(true);
    // NFD "a" + combining ring must still find the NFC form.
    expect(isValidWord("år".normalize("NFD") + "", "sv")).toBe(
      isValidWord("år", "sv"),
    );
  });

  it("keeps Å Ä Ö distinct from A and O", () => {
    // "far" and "fär" are different strings; folding would make them equal.
    expect(isValidWord("far", "sv")).toBe(true);
    expect(normalise("Får")).toBe("får");
    expect(normalise("Får")).not.toBe("far");
  });

  it("has no words outside the alphabet or the length caps", () => {
    for (const lang of ["en", "sv"] as const) {
      const meta = languageMeta(lang);
      const pool = answerPool(lang, 5, "full");
      for (const w of pool) {
        expect(isAlphabetic(w, lang), `${lang}:${w}`).toBe(true);
        expect(w.length).toBeLessThanOrEqual(meta.maxWordLength);
      }
    }
  });
});

describe("answer pool", () => {
  it("is big enough at every length and band a game asks for", () => {
    // Five and Grid draw 3 to 8 letters across every band.
    for (const lang of ["en", "sv"] as const) {
      for (let len = 3; len <= 8; len++) {
        for (const band of BAND_NAMES) {
          const n = poolSize(lang, len, band);
          expect(n, `${lang} len ${len} band ${band}`).toBeGreaterThan(30);
        }
      }
    }
  });

  it("has enough nine letter words for Ordoku's 9x9 diagonal", () => {
    // Nothing asks for a nine letter word from the commonest thousand, but
    // Ordoku needs plenty at top20k, each with nine distinct letters.
    for (const lang of ["en", "sv"] as const) {
      const usable = answerPool(lang, 9, "top20k").filter(
        (w) => new Set(w).size === 9,
      );
      expect(usable.length, lang).toBeGreaterThan(100);
    }
  });

  it("widens monotonically as the band widens", () => {
    for (const lang of ["en", "sv"] as const) {
      for (let len = 3; len <= 9; len++) {
        let prev = 0;
        for (const band of BAND_NAMES) {
          const n = poolSize(lang, len, band);
          expect(n, `${lang} ${len} ${band}`).toBeGreaterThanOrEqual(prev);
          prev = n;
        }
      }
    }
  });

  it("only contains words the dictionary accepts", () => {
    for (const lang of ["en", "sv"] as const) {
      for (const w of answerPool(lang, 6, "top3k")) {
        expect(isValidWord(w, lang), `${lang}:${w}`).toBe(true);
      }
    }
  });

  it("is sorted with Å Ä Ö after Z", () => {
    const pool = answerPool("sv", 4, "full");
    for (let i = 1; i < pool.length; i++) {
      expect(compareWords(pool[i - 1]!, pool[i]!, "sv")).toBeLessThan(0);
    }
    // A word starting with ö must sort after every word starting with z.
    expect(compareWords("öra", "zon", "sv")).toBeGreaterThan(0);
    expect(compareWords("år", "äta", "sv")).toBeLessThan(0);
    expect(compareWords("äta", "öra", "sv")).toBeLessThan(0);
  });
});

describe("randomWord", () => {
  it("returns a word of the requested length inside the band", () => {
    const rng = mulberry32(42);
    for (const lang of ["en", "sv"] as const) {
      for (let len = 4; len <= 7; len++) {
        const pool = new Set(answerPool(lang, len, "top5k"));
        for (let i = 0; i < 25; i++) {
          const w = randomWord(lang, len, "top5k", rng);
          expect(w, `${lang} ${len}`).not.toBeNull();
          expect(w!.length).toBe(len);
          expect(pool.has(w!)).toBe(true);
        }
      }
    }
  });

  it("is deterministic for a given seed", () => {
    const a = randomWord("en", 5, "top2k", mulberry32(7));
    const b = randomWord("en", 5, "top2k", mulberry32(7));
    expect(a).toBe(b);
  });

  it("returns null for an impossible request instead of throwing", () => {
    expect(randomWord("en", 30, "full", mulberry32(1))).toBeNull();
  });

  it("spreads across the pool rather than returning one word", () => {
    const rng = mulberry32(99);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(randomWord("sv", 5, "top5k", rng)!);
    expect(seen.size).toBeGreaterThan(50);
  });
});

describe("wordsFromLetters", () => {
  it("finds words that fit the letters and nothing else", () => {
    const found = wordsFromLetters("aeirstn", "en", {
      minLength: 4,
      maxLength: 7,
    });
    expect(found.length).toBeGreaterThan(50);
    for (const w of found) {
      expect(w.length).toBeGreaterThanOrEqual(4);
      expect(w.length).toBeLessThanOrEqual(7);
      expect(isValidWord(w, "en")).toBe(true);
    }
    expect(found).toContain("stain");
    expect(found).toContain("train");
  });

  it("respects the letter budget when repeats are off", () => {
    // One "e" available, so "eel" must not appear.
    const found = wordsFromLetters("bel", "en", { minLength: 3 });
    expect(found).not.toContain("eel");
  });

  it("allows repeats when asked, which is how Hive works", () => {
    const loose = wordsFromLetters("aelmp", "en", {
      minLength: 4,
      allowRepeats: true,
    });
    const strict = wordsFromLetters("aelmp", "en", { minLength: 4 });
    expect(loose.length).toBeGreaterThan(strict.length);
    expect(loose).toContain("apple");
    expect(strict).not.toContain("apple");
  });

  it("enforces a required centre letter", () => {
    const found = wordsFromLetters("aeglnpt", "en", {
      minLength: 4,
      required: "g",
      allowRepeats: true,
    });
    expect(found.length).toBeGreaterThan(5);
    for (const w of found) expect(w).toContain("g");
  });

  it("works with Swedish letters", () => {
    const found = wordsFromLetters("äarstn", "sv", { minLength: 4 });
    expect(found.length).toBeGreaterThan(20);
    for (const w of found) expect(isValidWord(w, "sv")).toBe(true);
  });

  it("honours the limit", () => {
    const found = wordsFromLetters("aeirstn", "en", { minLength: 3, limit: 10 });
    expect(found.length).toBeLessThanOrEqual(10);
  });
});

describe("wordsMatching", () => {
  it("matches a template", () => {
    const found = wordsMatching("h..se", "en");
    expect(found).toContain("house");
    expect(found).toContain("horse");
    for (const w of found) {
      expect(w.length).toBe(5);
      expect(w[0]).toBe("h");
      expect(w[4]).toBe("e");
    }
  });

  it("returns every five letter word for an all wildcard pattern", () => {
    const found = wordsMatching(".....", "sv");
    expect(found.length).toBeGreaterThan(2000);
    for (const w of found) expect(w.length).toBe(5);
  });
});

describe("seed word regression", () => {
  // The list that proved the dictionary was healthy. It stays green forever.
  it.each(["sv", "en"] as const)("accepts every %s seed word", (lang) => {
    const missing = SEED_WORDS[lang].filter((w) => !isValidWord(w, lang));
    expect(missing, `${lang} rejected: ${missing.join(" ")}`).toEqual([]);
  });

  it.each(["sv", "en"] as const)("still refuses %s non words", (lang) => {
    const wrong = NOT_WORDS[lang].filter((w) => isValidWord(w, lang));
    expect(wrong, `${lang} wrongly accepted: ${wrong.join(" ")}`).toEqual([]);
  });

  it("resolves NFD input, which is what a composing keyboard can send", () => {
    // Identical on screen, different bytes. Lookup has to fold before it walks.
    for (const w of ["kväll", "måste", "höger", "björn"]) {
      const nfd = w.normalize("NFD");
      expect(nfd).not.toBe(w.normalize("NFC"));
      expect(isValidWord(nfd, "sv"), `NFD ${w}`).toBe(true);
    }
  });

  it("ships answers and an alphabet that are already NFC", () => {
    // If the build ever writes NFD, lookup still works but the data doubles in
    // size and every byte level comparison silently stops matching.
    const pool = answerPool("sv", 5, "full");
    expect(pool.filter((w) => w !== w.normalize("NFC"))).toEqual([]);
    expect(alphabet("sv").join("")).toBe(alphabet("sv").join("").normalize("NFC"));
  });
});

describe("shipped data", () => {
  it("records its sources", () => {
    expect(languageMeta("sv").sources.join(" ")).toContain("SALDO");
    expect(languageMeta("en").sources.join(" ")).toContain("SCOWL");
  });

  it("has a dictionary far larger than the answer pool", () => {
    for (const lang of ["en", "sv"] as const) {
      const m = languageMeta(lang);
      expect(m.dictWords).toBeGreaterThan(m.answerWords * 3);
    }
  });
});
