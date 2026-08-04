import { describe, expect, it } from "vitest";
import {
  hardModeViolation,
  hintPosition,
  keyboardState,
  scoreGuess,
  scoreRun,
} from "@/games/five/engine";

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

describe("hardModeViolation", () => {
  it("allows anything on the first guess", () => {
    expect(hardModeViolation("stare", [], "crate")).toBeNull();
  });

  it("requires a green letter to stay in its column", () => {
    // "crate" vs "stare": r is present, a is correct at index 2, e correct at 4.
    const v = hardModeViolation("point", ["stare"], "crate");
    expect(v).not.toBeNull();
    expect(v!.kind).toBe("missingCorrect");
  });

  it("requires a yellow letter to be reused somewhere", () => {
    // Guess "moist" against "crate": t is present at the end.
    const v = hardModeViolation("clued", ["moist"], "crate");
    expect(v).toEqual({ kind: "missingPresent", letter: "t" });
  });

  it("accepts a guess that honours every clue", () => {
    expect(hardModeViolation("crate", ["stare"], "crate")).toBeNull();
  });

  it("requires both copies when a letter is known twice", () => {
    // "geese" vs guess "esses": two e's are accounted for.
    const v = hardModeViolation("crate", ["esses"], "geese");
    expect(v).not.toBeNull();
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
