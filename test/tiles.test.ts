import { beforeAll, describe, expect, it } from "vitest";
import { useLanguage } from "./helpers";
import { getLanguage } from "@/lib/dictionary";
import {
  BLANK,
  DISTRIBUTIONS,
  SIZE,
  buildBag,
  letterValue,
  premiumAt,
} from "@/games/tiles/board";
import {
  applyMove,
  chooseMove,
  emptyBlanks,
  emptyBoard,
  evaluatePlacement,
  generateMoves,
  idx,
  isEmpty,
  supply,
  wordAt,
  type Board,
  type PlacedTile,
} from "@/games/tiles/engine";
import { ALPHABETS } from "@/lib/alphabet";
import { mulberry32 } from "@/lib/rng";
import type { Lang } from "@/lib/i18n";

beforeAll(async () => {
  await useLanguage("en");
  await useLanguage("sv");
});

const dawgFor = (lang: Lang) => getLanguage(lang).dawg;

function place(board: Board, word: string, r: number, c: number, dir: "h" | "v") {
  [...word].forEach((ch, k) => {
    board[dir === "h" ? idx(r, c + k) : idx(r + k, c)] = ch;
  });
}

function tiles(word: string, r: number, c: number, dir: "h" | "v"): PlacedTile[] {
  return [...word].map((letter, k) => ({
    index: dir === "h" ? idx(r, c + k) : idx(r + k, c),
    letter,
    blank: false,
  }));
}

describe("distributions", () => {
  it("gives each language 100 tiles", () => {
    expect(buildBag("en")).toHaveLength(100);
    expect(buildBag("sv")).toHaveLength(100);
  });

  it("gives Swedish real Å Ä Ö tiles and no W or Q", () => {
    const sv = DISTRIBUTIONS.sv;
    for (const l of ["å", "ä", "ö"]) {
      expect(sv.counts[l], l).toBeGreaterThan(0);
      expect(sv.values[l], l).toBeGreaterThan(0);
    }
    // Swedish Scrabble has neither, so copying the English table would be wrong.
    expect(sv.counts.w).toBeUndefined();
    expect(sv.counts.q).toBeUndefined();
    expect(DISTRIBUTIONS.en.counts.w).toBeGreaterThan(0);
  });

  it("values Swedish letters by Swedish frequency, not English", () => {
    // U and Ö are scarce in Swedish; K and M are common. The English table
    // would have made U worth 1 and K worth 5.
    expect(DISTRIBUTIONS.sv.values.u).toBeGreaterThan(DISTRIBUTIONS.en.values.u!);
    expect(DISTRIBUTIONS.sv.values.k).toBeLessThan(DISTRIBUTIONS.en.values.k!);
  });

  it("only contains letters of its own alphabet", () => {
    for (const lang of ["en", "sv"] as const) {
      const allowed = new Set<string>([...ALPHABETS[lang], BLANK]);
      for (const l of buildBag(lang)) expect(allowed.has(l), `${lang}:${l}`).toBe(true);
    }
  });

  it("scores a blank as nothing", () => {
    expect(letterValue(BLANK, "en")).toBe(0);
    expect(letterValue(BLANK, "sv")).toBe(0);
  });
});

describe("premium layout", () => {
  it("is symmetric and has a double word star at the centre", () => {
    expect(premiumAt(7, 7)).toBe("D");
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        expect(premiumAt(r, c), `${r},${c}`).toBe(premiumAt(c, r));
        expect(premiumAt(r, c)).toBe(premiumAt(SIZE - 1 - r, SIZE - 1 - c));
      }
    }
  });

  it("has the four corner triple words", () => {
    for (const [r, c] of [[0, 0], [0, 14], [14, 0], [14, 14]] as const) {
      expect(premiumAt(r, c)).toBe("T");
    }
  });
});

describe("supply", () => {
  it("uses plain tiles when it can", () => {
    expect(supply(["c", "a", "t"], ["c", "a", "t", "s"])).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("falls back to a blank only when it must", () => {
    const got = supply(["c", "a", "t"], ["c", "t", BLANK]);
    expect(got).toEqual([false, true, false]);
  });

  it("refuses when the rack cannot cover it", () => {
    expect(supply(["c", "a", "t"], ["c", "a"])).toBeNull();
  });

  it("respects duplicate counts", () => {
    expect(supply(["e", "e"], ["e"])).toBeNull();
    expect(supply(["e", "e"], ["e", "e"])).not.toBeNull();
  });
});

describe("wordAt", () => {
  it("reads a run and stops at the edge of the row", () => {
    const b = emptyBoard();
    place(b, "cat", 7, 6, "h");
    expect(wordAt(b, idx(7, 7), "h")).toBe("cat");
  });

  it("does not wrap from one row into the next", () => {
    const b = emptyBoard();
    b[idx(3, 14)] = "a";
    b[idx(4, 0)] = "b";
    expect(wordAt(b, idx(3, 14), "h")).toBe("a");
  });
});

describe("evaluatePlacement", () => {
  it("requires the first move to cross the centre", () => {
    const b = emptyBoard();
    const off = evaluatePlacement(b, emptyBlanks(), tiles("cat", 0, 0, "h"), "en", dawgFor("en"));
    expect(off.ok).toBe(false);
    expect(off.error).toBe("mustCoverCentre");

    const on = evaluatePlacement(b, emptyBlanks(), tiles("cat", 7, 6, "h"), "en", dawgFor("en"));
    expect(on.ok).toBe(true);
  });

  it("doubles the word on the centre star", () => {
    const b = emptyBoard();
    const res = evaluatePlacement(b, emptyBlanks(), tiles("cat", 7, 7, "h"), "en", dawgFor("en"));
    // c3 + a1 + t1 = 5, doubled by the centre = 10.
    expect(res.move!.score).toBe(10);
  });

  it("rejects a word that is not in the dictionary", () => {
    const b = emptyBoard();
    const res = evaluatePlacement(b, emptyBlanks(), tiles("xqz", 7, 6, "h"), "en", dawgFor("en"));
    expect(res.ok).toBe(false);
    expect(res.error).toBe("notAWord");
  });

  it("rejects tiles that do not share a line", () => {
    const b = emptyBoard();
    const res = evaluatePlacement(
      b,
      emptyBlanks(),
      [
        { index: idx(7, 7), letter: "a", blank: false },
        { index: idx(8, 8), letter: "t", blank: false },
      ],
      "en",
      dawgFor("en"),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toBe("notInLine");
  });

  it("rejects a move that touches nothing", () => {
    const b = emptyBoard();
    place(b, "cat", 7, 7, "h");
    const res = evaluatePlacement(b, emptyBlanks(), tiles("dog", 0, 0, "h"), "en", dawgFor("en"));
    expect(res.ok).toBe(false);
    expect(res.error).toBe("mustTouch");
  });

  it("scores every cross word a parallel move creates", () => {
    const b = emptyBoard();
    place(b, "an", 7, 7, "h");
    // "no" laid under "an" reads across as "no" and down as "an" and "no".
    const res = evaluatePlacement(
      b,
      emptyBlanks(),
      [
        { index: idx(8, 7), letter: "n", blank: false },
        { index: idx(8, 8), letter: "o", blank: false },
      ],
      "en",
      dawgFor("en"),
    );
    expect(res.ok).toBe(true);
    expect(res.move!.word).toBe("no");
    // The two columns are scored as well as the row.
    expect(res.move!.words).toContain("an");
    expect(res.move!.words.filter((w) => w === "no")).toHaveLength(2);
  });

  it("rejects a move whose cross word is nonsense", () => {
    const b = emptyBoard();
    place(b, "cat", 7, 7, "h");
    const res = evaluatePlacement(
      b,
      emptyBlanks(),
      [{ index: idx(8, 7), letter: "q", blank: false }],
      "en",
      dawgFor("en"),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toBe("notAWord");
  });

  it("scores a blank as zero but still needs a real word", () => {
    const b = emptyBoard();
    const withBlank = [
      { index: idx(7, 7), letter: "c", blank: true },
      { index: idx(7, 8), letter: "a", blank: false },
      { index: idx(7, 9), letter: "t", blank: false },
    ];
    const res = evaluatePlacement(b, emptyBlanks(), withBlank, "en", dawgFor("en"));
    expect(res.ok).toBe(true);
    // a1 + t1 = 2, doubled = 4, with the blank c contributing nothing.
    expect(res.move!.score).toBe(4);
  });

  it("adds the bingo bonus for seven tiles", () => {
    const b = emptyBoard();
    const seven = evaluatePlacement(
      b,
      emptyBlanks(),
      tiles("retains", 7, 4, "h"),
      "en",
      dawgFor("en"),
    );
    const six = evaluatePlacement(
      emptyBoard(),
      emptyBlanks(),
      tiles("retain", 7, 4, "h"),
      "en",
      dawgFor("en"),
    );
    expect(seven.ok).toBe(true);
    expect(six.ok).toBe(true);
    expect(seven.move!.score - six.move!.score).toBeGreaterThan(45);
  });

  it("plays Swedish words with Å Ä Ö", () => {
    const b = emptyBoard();
    const res = evaluatePlacement(b, emptyBlanks(), tiles("häst", 7, 6, "h"), "sv", dawgFor("sv"));
    expect(res.ok).toBe(true);
    expect(res.move!.word).toBe("häst");
  });

  it("rejects an empty placement", () => {
    expect(
      evaluatePlacement(emptyBoard(), emptyBlanks(), [], "en", dawgFor("en")).error,
    ).toBe("empty");
  });
});

describe("generateMoves", () => {
  it("opens across the centre", () => {
    const moves = generateMoves(
      emptyBoard(),
      emptyBlanks(),
      ["c", "a", "t", "s", "e", "r", "n"],
      "en",
      dawgFor("en"),
      { maxWordLength: 7, premiumWeight: 1, budgetMs: 3000 },
    );
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves.slice(0, 20)) {
      expect(m.tiles.some((t) => t.index === idx(7, 7))).toBe(true);
    }
  });

  it("returns moves sorted by score", () => {
    const moves = generateMoves(
      emptyBoard(),
      emptyBlanks(),
      ["c", "a", "t", "s", "e", "r", "n"],
      "en",
      dawgFor("en"),
      { maxWordLength: 7, premiumWeight: 1, budgetMs: 3000 },
    );
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i - 1]!.score).toBeGreaterThanOrEqual(moves[i]!.score);
    }
  });

  it("only returns legal moves", () => {
    const b = emptyBoard();
    place(b, "cat", 7, 7, "h");
    const moves = generateMoves(
      b,
      emptyBlanks(),
      ["s", "o", "e", "r", "d", "i", "n"],
      "en",
      dawgFor("en"),
      { maxWordLength: 7, premiumWeight: 1, budgetMs: 3000 },
    );
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves.slice(0, 40)) {
      const check = evaluatePlacement(b, emptyBlanks(), m.tiles, "en", dawgFor("en"));
      expect(check.ok, m.word).toBe(true);
      expect(check.move!.score).toBe(m.score);
    }
  });

  it("never uses a letter the rack does not have", () => {
    const rack = ["a", "e", "t"];
    const b = emptyBoard();
    place(b, "cat", 7, 7, "h");
    const moves = generateMoves(b, emptyBlanks(), rack, "en", dawgFor("en"), {
      maxWordLength: 6,
      premiumWeight: 1,
      budgetMs: 3000,
    });
    for (const m of moves) {
      const used = m.tiles.filter((t) => !t.blank).map((t) => t.letter);
      const pool = [...rack];
      for (const l of used) {
        const at = pool.indexOf(l);
        expect(at, `${m.word} used ${l}`).toBeGreaterThanOrEqual(0);
        pool.splice(at, 1);
      }
    }
  });

  it("respects the word length cap that sets easy levels", () => {
    const moves = generateMoves(
      emptyBoard(),
      emptyBlanks(),
      ["c", "a", "t", "s", "e", "r", "n"],
      "en",
      dawgFor("en"),
      { maxWordLength: 3, premiumWeight: 0, budgetMs: 3000 },
    );
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) expect(m.word.length).toBeLessThanOrEqual(3);
  });

  it("works in Swedish", () => {
    const moves = generateMoves(
      emptyBoard(),
      emptyBlanks(),
      ["h", "ä", "s", "t", "a", "r", "n"],
      "sv",
      dawgFor("sv"),
      { maxWordLength: 7, premiumWeight: 1, budgetMs: 3000 },
    );
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some((m) => m.word.includes("ä"))).toBe(true);
  });

  it("finds nothing when the rack cannot reach the board", () => {
    const b = emptyBoard();
    place(b, "cat", 7, 7, "h");
    const moves = generateMoves(b, emptyBlanks(), ["q"], "en", dawgFor("en"), {
      maxWordLength: 7,
      premiumWeight: 1,
      budgetMs: 1500,
    });
    expect(moves.every((m) => m.tiles.length <= 1)).toBe(true);
  });
});

describe("chooseMove", () => {
  const moves = [10, 8, 6, 4, 2].map((score) => ({
    tiles: [],
    word: `w${score}`,
    dir: "h" as const,
    score,
    words: [],
  }));

  it("takes the best move at full skill", () => {
    expect(chooseMove(moves, 1, mulberry32(1))!.score).toBe(10);
  });

  it("takes a weaker move at low skill", () => {
    const picked = new Set<number>();
    for (let s = 1; s <= 40; s++) {
      picked.add(chooseMove(moves, 0.15, mulberry32(s))!.score);
    }
    expect(picked.size).toBeGreaterThan(1);
  });

  it("returns null with nothing to play", () => {
    expect(chooseMove([], 1, mulberry32(1))).toBeNull();
  });
});

describe("applyMove", () => {
  it("writes the tiles onto the board", () => {
    const b = emptyBoard();
    const res = evaluatePlacement(b, emptyBlanks(), tiles("cat", 7, 7, "h"), "en", dawgFor("en"));
    const after = applyMove(b, emptyBlanks(), res.move!);
    expect(after.board[idx(7, 7)]).toBe("c");
    expect(isEmpty(after.board)).toBe(false);
    // The original board is untouched.
    expect(isEmpty(b)).toBe(true);
  });
});
