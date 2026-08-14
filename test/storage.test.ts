import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  defaultState,
  emptyFiveStat,
  getFiveStat,
  migrate,
  recordFive,
} from "@/lib/storage";

describe("migration to v2", () => {
  // The one thing v2 is for: Five stopped having levels, so its old per level
  // records go. Nothing else may be touched.
  it("drops Five's level records and keeps the other six games", () => {
    const v1 = {
      v: 1,
      settings: { lang: "sv", sound: false, motion: "reduced", ordokuGlyphs: "numbers" },
      progress: {
        "five:sv:1": { completed: true, bestScore: 900, bestTimeMs: 1000, streak: 4 },
        "five:en:10": { completed: true, bestScore: 100, bestTimeMs: 1, streak: 1 },
        "hive:sv:3": { completed: true, bestScore: 500, bestTimeMs: 2000, streak: 2 },
        "grid:en:7": { completed: false, bestScore: 10, bestTimeMs: 0, streak: 0 },
        "tiles:sv:9": { completed: true, bestScore: 42, bestTimeMs: 5, streak: 1 },
      },
    };

    const out = migrate(v1);

    expect(out.v).toBe(SCHEMA_VERSION);
    expect(Object.keys(out.progress).sort()).toEqual([
      "grid:en:7",
      "hive:sv:3",
      "tiles:sv:9",
    ]);
    expect(out.progress["hive:sv:3"]).toEqual({
      completed: true,
      bestScore: 500,
      bestTimeMs: 2000,
      streak: 2,
    });
    // Settings survive a migration untouched.
    expect(out.settings).toEqual({
      lang: "sv",
      sound: false,
      motion: "reduced",
      ordokuGlyphs: "numbers",
    });
    // v1 had no Five stats to carry over.
    expect(out.five).toEqual({});
    expect(out.fiveLast).toBeNull();
  });

  it("round trips a v2 payload including Five's stats", () => {
    const state = defaultState();
    const withRun = recordFive(state, "sv", "hard", { won: true, guessesUsed: 3 });
    const out = migrate(JSON.parse(JSON.stringify(withRun.state)));
    expect(getFiveStat(out, "sv", "hard")).toEqual(withRun.stat);
    expect(out.fiveLast).toEqual({ lang: "sv", difficulty: "hard" });
  });

  it("resets silently on anything unrecognised", () => {
    for (const junk of [null, 7, "x", [], { v: 99 }, { v: 0 }]) {
      expect(migrate(junk)).toEqual(defaultState());
    }
  });

  it("drops a Five stat under an unknown difficulty rather than keeping it", () => {
    const out = migrate({
      v: 2,
      settings: {},
      progress: {},
      five: {
        "sv:easy": { played: 2, won: 1, streak: 1, maxStreak: 1, distribution: [1] },
        "sv:legendary": { played: 9, won: 9, streak: 9, maxStreak: 9, distribution: [] },
        "fr:easy": { played: 1, won: 1, streak: 1, maxStreak: 1, distribution: [] },
      },
    });
    expect(Object.keys(out.five)).toEqual(["sv:easy"]);
    // The histogram is always six bars, whatever was stored.
    expect(out.five["sv:easy"]!.distribution).toHaveLength(6);
  });
});

describe("recordFive", () => {
  it("counts a win, its streak and its bar", () => {
    let state = defaultState();
    state = recordFive(state, "sv", "easy", { won: true, guessesUsed: 3 }).state;
    state = recordFive(state, "sv", "easy", { won: true, guessesUsed: 3 }).state;
    const stat = getFiveStat(state, "sv", "easy");
    expect(stat.played).toBe(2);
    expect(stat.won).toBe(2);
    expect(stat.streak).toBe(2);
    expect(stat.maxStreak).toBe(2);
    expect(stat.distribution[2]).toBe(2);
  });

  it("breaks the streak on a loss but keeps the best", () => {
    let state = defaultState();
    state = recordFive(state, "sv", "easy", { won: true, guessesUsed: 2 }).state;
    state = recordFive(state, "sv", "easy", { won: true, guessesUsed: 4 }).state;
    state = recordFive(state, "sv", "easy", { won: false, guessesUsed: 6 }).state;
    const stat = getFiveStat(state, "sv", "easy");
    expect(stat.played).toBe(3);
    expect(stat.won).toBe(2);
    expect(stat.streak).toBe(0);
    expect(stat.maxStreak).toBe(2);
    // A loss is played, but it is not plotted on the win histogram.
    expect(stat.distribution.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("keeps each language and difficulty apart", () => {
    let state = defaultState();
    state = recordFive(state, "sv", "easy", { won: true, guessesUsed: 1 }).state;
    state = recordFive(state, "en", "easy", { won: false, guessesUsed: 6 }).state;
    expect(getFiveStat(state, "sv", "easy").won).toBe(1);
    expect(getFiveStat(state, "en", "easy").won).toBe(0);
    expect(getFiveStat(state, "sv", "hard")).toEqual(emptyFiveStat());
  });

  it("remembers where it was played for the home card", () => {
    const state = recordFive(defaultState(), "en", "extreme", {
      won: true,
      guessesUsed: 5,
    }).state;
    expect(state.fiveLast).toEqual({ lang: "en", difficulty: "extreme" });
  });
});
