import { describe, expect, it } from "vitest";
import { bandBagKey, bandHash, coverage, levelPool, levelsIn } from "@/lib/band";
import { advance, clearBagOrders, currentWord, ensureBag } from "@/lib/bag";
import { DIFFICULTIES } from "@/lib/difficulty";
import { LEVELLED_GAME_IDS, LEVELS } from "@/lib/games";
import { LANGS } from "@/lib/i18n";

/**
 * Levels 1 to 10 mapped onto four difficulties.
 *
 * The tuning in lib/levels.ts is untouched; only the way it is reached
 * changed. The properties worth protecting are that no level is lost, none is
 * reachable from two difficulties, and a band never gets harder as you go
 * down it.
 */

describe("bands", () => {
  it.each(LEVELLED_GAME_IDS)("%s covers all ten levels exactly once", (game) => {
    const all = coverage(game).sort((a, b) => a - b);
    expect(all).toEqual([...LEVELS]);
  });

  it.each(LEVELLED_GAME_IDS)("%s never lets a band go backwards", (game) => {
    // Every level in Lätt is below every level in Medel, and so on. A band
    // that overlapped its neighbour would make "harder" mean nothing.
    let ceiling = 0;
    for (const d of DIFFICULTIES) {
      const levels = levelsIn(game, d);
      expect(levels.length, `${game}/${d} is empty`).toBeGreaterThan(0);
      expect(Math.min(...levels), `${game}/${d}`).toBeGreaterThan(ceiling);
      ceiling = Math.max(...levels);
    }
    expect(ceiling).toBe(10);
  });

  it.each(LEVELLED_GAME_IDS)("%s keeps each band contiguous", (game) => {
    for (const d of DIFFICULTIES) {
      const levels = [...levelsIn(game, d)];
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]! - levels[i - 1]!, `${game}/${d} skips a level`).toBe(1);
      }
    }
  });

  /**
   * Three games get a split other than 2/3/3/2, because a rule changes
   * mid-band otherwise. Pinned here so the reasoning is not lost: these are
   * the levels the rule steps at, and a band boundary has to sit on them.
   */
  it("puts a band boundary wherever a game's rules step", () => {
    // Hive requires a pangram from 8; Tiles adds a turn clock at 8.
    for (const game of ["hive", "tiles"] as const) {
      expect(levelsIn(game, "extreme"), game).toContain(8);
      expect(levelsIn(game, "hard"), game).not.toContain(8);
    }
    // Rush starts peeling at 7.
    expect(levelsIn("rush", "hard")).toContain(7);
    expect(levelsIn("rush", "medium")).not.toContain(7);
    // Ordoku stops dimming used values after 3.
    expect(levelsIn("ordoku", "easy")).toContain(3);
    expect(levelsIn("ordoku", "medium")).not.toContain(3);
    // Grid's only step is at 9, which the default split already respects.
    expect(levelsIn("grid", "extreme")).toEqual([9, 10]);
  });

  it("gives every game, language and difficulty its own bag", () => {
    const keys = new Set<string>();
    for (const game of LEVELLED_GAME_IDS) {
      for (const lang of LANGS) {
        for (const d of DIFFICULTIES) keys.add(bandBagKey(game, lang, d));
      }
    }
    expect(keys.size).toBe(LEVELLED_GAME_IDS.length * LANGS.length * 4);
    // And none of them collides with Five's or Mini's namespace.
    for (const k of keys) expect(k.startsWith("band:")).toBe(true);
  });

  it("re-shuffles when a band's contents change", () => {
    const before = bandHash("hive", "hard");
    expect(before).toContain("hive");
    expect(before).not.toBe(bandHash("hive", "extreme"));
    expect(before).not.toBe(bandHash("grid", "hard"));
  });
});

describe("drawing a level", () => {
  it("plays every level in a band before repeating one", () => {
    clearBagOrders();
    for (const game of LEVELLED_GAME_IDS) {
      for (const d of DIFFICULTIES) {
        const pool = levelPool(game, d);
        const hash = bandHash(game, d);
        let bag = ensureBag(undefined, hash, pool.length, () => 12345);
        const seen: string[] = [];
        for (let i = 0; i < pool.length; i++) {
          seen.push(currentWord(pool, bag)!);
          bag = advance(bag, pool.length, () => 999).state;
        }
        expect(new Set(seen).size, `${game}/${d} repeated inside one bag`).toBe(
          pool.length,
        );
        expect([...seen].sort()).toEqual([...pool].sort());
      }
    }
  });

  it("wraps into a fresh shuffle once the band is exhausted", () => {
    clearBagOrders();
    const pool = levelPool("loop", "medium");
    let bag = ensureBag(undefined, bandHash("loop", "medium"), pool.length, () => 1);
    for (let i = 0; i < pool.length - 1; i++) {
      bag = advance(bag, pool.length, () => 2).state;
    }
    const wrap = advance(bag, pool.length, () => 7);
    expect(wrap.wrapped).toBe(true);
    expect(wrap.state.cursor).toBe(0);
    expect(wrap.state.seed).toBe(7);
  });

  it("only ever draws a level from the band asked for", () => {
    clearBagOrders();
    for (const game of LEVELLED_GAME_IDS) {
      for (const d of DIFFICULTIES) {
        const pool = levelPool(game, d);
        const allowed = new Set(levelsIn(game, d).map(String));
        let bag = ensureBag(undefined, bandHash(game, d), pool.length, () => 5);
        for (let i = 0; i < 20; i++) {
          expect(allowed.has(currentWord(pool, bag)!), `${game}/${d}`).toBe(true);
          bag = advance(bag, pool.length, () => i).state;
        }
      }
    }
  });
});
