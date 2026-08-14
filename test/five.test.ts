import { beforeAll, describe, expect, it } from "vitest";
import {
  checkGuess,
  hintPosition,
  keyboardState,
  scoreGuess,
  scoreRun,
} from "@/games/five/engine";
import { isValidWord } from "@/lib/dictionary";
import { useLanguage } from "./helpers";
import { SEED_WORDS } from "./seed-words";

describe("checkGuess, the gate the Enter key actually calls", () => {
  beforeAll(async () => {
    await useLanguage("sv");
    await useLanguage("en");
  });

  const accept = (guess: string, lang: "sv" | "en") =>
    checkGuess({
      guess,
      length: 5,
      isWord: (w) => isValidWord(w, lang),
    });

  // The regression that matters: not "is it in the dictionary module" but
  // "does pressing Enter on it work". Every five letter seed word must pass.
  it.each(["sv", "en"] as const)("accepts every five letter %s seed word", (lang) => {
    const five = SEED_WORDS[lang].filter((w) => w.length === 5);
    expect(five.length).toBeGreaterThan(15);
    const refused = five.filter((w) => !accept(w, lang).ok);
    expect(refused, `refused: ${refused.join(" ")}`).toEqual([]);
  });

  it("never narrows validation to the answer's frequency band", () => {
    // "fjäll" is a real word far outside any common band. If validation were
    // ever scoped to the band the answer was drawn from, this would fail.
    expect(accept("fjäll", "sv").ok).toBe(true);
    expect(accept("nymph", "en").ok).toBe(true);
  });

  it("reports the reason rather than a bare false", () => {
    expect(accept("hus", "sv")).toMatchObject({ ok: false, reason: "wrongLength" });
    expect(accept("qxzvw", "sv")).toMatchObject({ ok: false, reason: "notAWord" });
  });


});

describe("scoreGuess", () => {
  it("marks an exact match", () => {
    expect(scoreGuess("house", "house")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("marks position and presence", () => {
    expect(scoreGuess("hotel", "house")).toEqual([
      "correct", // h
      "correct", // o
      "absent", // t
      "present", // e is in house, elsewhere
      "absent", // l
    ]);
  });

  it("does not over-report a doubled guess letter", () => {
    // "kilos" holds one "l", so only the first "l" of "llama" can be present.
    const marks = scoreGuess("llama", "kilos");
    expect(marks).toEqual(["present", "absent", "absent", "absent", "absent"]);
  });

  it("prefers an exact match over an earlier loose one", () => {
    // "aback": guessing "areas" — first a is correct, later a has no room.
    const marks = scoreGuess("allay", "alloy");
    expect(marks).toEqual(["correct", "correct", "correct", "absent", "correct"]);
  });

  it("handles a doubled answer letter with one in the guess", () => {
    const marks = scoreGuess("saved", "geese");
    // one "e" in the guess, "geese" has two, so it is present not absent
    expect(marks[3]).toBe("present");
    expect(marks[0]).toBe("present"); // s appears in geese
  });

  it("works with Å Ä Ö as ordinary letters", () => {
    expect(scoreGuess("växer", "växte")).toEqual([
      "correct",
      "correct",
      "correct",
      "present",
      "absent",
    ]);
    // Ä must never match A.
    expect(scoreGuess("äta", "ata")).toEqual(["absent", "correct", "correct"]);
  });
});

describe("keyboardState", () => {
  it("never downgrades a letter", () => {
    const state = keyboardState(["stare", "trace"], "crate");
    expect(state.a).toBe("correct");
    expect(state.t).toBe("present");
    expect(state.s).toBe("absent");
  });

  it("is empty before the first guess", () => {
    expect(keyboardState([], "crate")).toEqual({});
  });
});


describe("scoreRun", () => {
  it("is zero when unsolved", () => {
    expect(
      scoreRun({
        solved: false,
        guessesUsed: 6,
        guessesAllowed: 6,
        timeMs: 1000,
        hintsUsed: 0,
        length: 5,
      }),
    ).toBe(0);
  });

  it("rewards spare guesses and speed", () => {
    const fast = scoreRun({
      solved: true,
      guessesUsed: 2,
      guessesAllowed: 6,
      timeMs: 10_000,
      hintsUsed: 0,
      length: 5,
    });
    const slow = scoreRun({
      solved: true,
      guessesUsed: 5,
      guessesAllowed: 6,
      timeMs: 200_000,
      hintsUsed: 0,
      length: 5,
    });
    expect(fast).toBeGreaterThan(slow);
  });

  it("charges for hints", () => {
    const base = {
      solved: true,
      guessesUsed: 3,
      guessesAllowed: 6,
      timeMs: 30_000,
      length: 5,
    };
    expect(scoreRun({ ...base, hintsUsed: 0 })).toBeGreaterThan(
      scoreRun({ ...base, hintsUsed: 2 }),
    );
  });

  it("never goes negative", () => {
    expect(
      scoreRun({
        solved: true,
        guessesUsed: 8,
        guessesAllowed: 8,
        timeMs: 9_000_000,
        hintsUsed: 40,
        length: 4,
      }),
    ).toBe(0);
  });
});

describe("hintPosition", () => {
  it("reveals the first unknown letter", () => {
    expect(hintPosition("crate", [], new Set())).toBe(0);
  });

  it("skips letters already known from a guess", () => {
    expect(hintPosition("crate", ["crops"], new Set())).toBe(2);
  });

  it("skips letters already revealed by an earlier hint", () => {
    expect(hintPosition("crate", [], new Set([0, 1]))).toBe(2);
  });

  it("returns null when everything is known", () => {
    expect(hintPosition("crate", ["crate"], new Set())).toBeNull();
  });
});
