import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCEPTED_CLUES,
  checkClue,
  checkCrude,
  MAX_CLUE_WORDS,
} from "@/scripts/build-clues";
import { DIFFICULTIES } from "@/lib/difficulty";
import { LANGS, type Lang } from "@/lib/i18n";
import { wordsOf } from "@/lib/mini";

/**
 * The clue bank, checked against the rules it was written to.
 *
 * These run over the whole bank rather than a sample: the rules are cheap to
 * check and a single clue that gives its answer away is a puzzle nobody can
 * solve fairly.
 */

interface CachedClue {
  clue1: string;
  clue2: string;
  single?: true;
}

const cache = (lang: Lang): Record<string, CachedClue> =>
  JSON.parse(
    readFileSync(join(process.cwd(), "data", "clues", `${lang}.json`), "utf8"),
  ) as Record<string, CachedClue>;

const bankWords = (lang: Lang): Set<string> => {
  const out = new Set<string>();
  for (const difficulty of DIFFICULTIES) {
    const path = join(process.cwd(), "public", "data", lang, `mini-${difficulty}.txt`);
    for (const grid of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
      for (const word of wordsOf(grid)) out.add(word);
    }
  }
  return out;
};

/**
 * How long a clue may be before it overflows the clue bar.
 *
 * The bar reserves two lines at 13px, and the narrowest supported screen is a
 * 320pt SE: 288pt of page width, less two 36pt arrows and 8pt of padding,
 * leaves ~208pt of text. Familjen Grotesk at 13px averages ~6.3pt per
 * character, so a line holds ~33 and two hold ~66. 60 is that with headroom
 * for a wide-glyph clue.
 */
const MAX_CLUE_CHARS = 60;

describe.each(LANGS)("%s clue bank", (lang) => {
  const clues = cache(lang);
  const words = bankWords(lang);
  const entries = Object.entries(clues);

  it("has a clue for every word in every bank", () => {
    const missing = [...words].filter((w) => !clues[w]?.clue1);
    expect(missing, `words with no clue: ${missing.slice(0, 12).join(" ")}`).toEqual([]);
  });

  it("never gives the answer away", () => {
    const bad = entries.flatMap(([word, entry]) =>
      [entry.clue1, entry.clue2].flatMap((clue) =>
        checkClue(clue, word, lang)
          .filter((p) => p.kind === "contains-answer" || p.kind === "contains-stem")
          .map((p) => `${word}: ${p.kind}(${p.detail}) in "${clue}"`),
      ),
    );
    expect(bad, bad.slice(0, 8).join("; ")).toEqual([]);
  });

  it("never names the answer's grammatical form", () => {
    const bad = entries
      .filter(([word]) => !ACCEPTED_CLUES.has(`${lang}/${word}`))
      .flatMap(([word, entry]) =>
      [entry.clue1, entry.clue2].flatMap((clue) =>
        checkClue(clue, word, lang)
          .filter((p) => p.kind === "form-tell")
          .map((p) => `${word}: ${p.detail} in "${clue}"`),
      ),
    );
    expect(bad, bad.slice(0, 8).join("; ")).toEqual([]);
  });

  it(`is at most ${MAX_CLUE_WORDS} words`, () => {
    const bad = entries
      .filter(([word]) => !ACCEPTED_CLUES.has(`${lang}/${word}`))
      .flatMap(([word, entry]) =>
      [entry.clue1, entry.clue2]
        .filter((clue) => clue.trim().split(/\s+/u).length > MAX_CLUE_WORDS)
        .map((clue) => `${word}: "${clue}"`),
    );
    expect(bad, bad.slice(0, 8).join("; ")).toEqual([]);
  });

  it("fits the clue bar's two lines", () => {
    const bad = entries.flatMap(([word, entry]) =>
      [entry.clue1, entry.clue2]
        .filter((clue) => clue.length > MAX_CLUE_CHARS)
        .map((clue) => `${word}: ${clue.length} chars — "${clue}"`),
    );
    expect(bad, bad.slice(0, 4).join("; ")).toEqual([]);
  });

  it("has no crude words in clue text", () => {
    const bad = entries.flatMap(([word, entry]) =>
      ACCEPTED_CLUES.has(`${lang}/${word}`)
        ? []
        : [entry.clue1, entry.clue2].flatMap((clue) =>
            checkCrude(clue, lang).map((c) => `${word}: ${c} in "${clue}"`),
          ),
    );
    expect(bad, bad.slice(0, 8).join("; ")).toEqual([]);
  });

  it("gives every word two clues that differ, unless it is a recorded single", () => {
    const same = entries
      .filter(([, entry]) => entry.clue1.trim() === entry.clue2.trim() && !entry.single)
      .map(([word]) => word);
    expect(same, same.slice(0, 8).join(" ")).toEqual([]);
  });

  it("keeps single-clue words rare", () => {
    // A single clue is a repair of last resort, not a shortcut. If this share
    // climbs, the generation prompt has stopped working rather than a few
    // words being hard.
    const singles = entries.filter(([, entry]) => entry.single).length;
    expect(singles / entries.length).toBeLessThan(0.01);
  });
});

describe("clue language follows the puzzle", () => {
  it("no English clue uses a Swedish-only letter", () => {
    const clues = cache("en");
    const bad = Object.entries(clues)
      .flatMap(([word, entry]) =>
        [entry.clue1, entry.clue2]
          .filter((clue) => /[åäöÅÄÖ]/u.test(clue))
          .map((clue) => `${word}: "${clue}"`),
      );
    expect(bad, bad.slice(0, 6).join("; ")).toEqual([]);
  });
});
