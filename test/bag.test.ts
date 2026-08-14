import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useLanguage } from "./helpers";
import { difficultyPool, poolFingerprint } from "@/lib/dictionary";
import { DIFFICULTIES } from "@/lib/difficulty";
import { LANGS } from "@/lib/i18n";
import {
  advance,
  bagKey,
  clearBagOrders,
  currentWord,
  ensureBag,
  type BagState,
} from "@/lib/bag";

beforeAll(async () => {
  await useLanguage("sv");
  await useLanguage("en");
});

beforeEach(() => clearBagOrders());

describe("the bag", () => {
  it("keys by language and difficulty", () => {
    expect(bagKey("sv", "easy")).toBe("sv:easy");
  });

  // The promise: no word repeats until every word has been seen.
  it.each(
    LANGS.flatMap((lang) => DIFFICULTIES.map((d) => [lang, d] as const)),
  )("draws every %s %s word exactly once before repeating", (lang, d) => {
    const pool = difficultyPool(lang, d);
    const hash = poolFingerprint(lang, d);
    let state = ensureBag(undefined, hash, pool.length, () => 12345);

    const seen: string[] = [];
    for (let i = 0; i < pool.length; i++) {
      const w = currentWord(pool, state);
      expect(w, `draw ${i}`).not.toBeNull();
      seen.push(w!);
      const stepped = advance(state, pool.length, () => 999);
      state = stepped.state;
      // The bag only reports wrapping on the draw that empties it.
      expect(stepped.wrapped).toBe(i === pool.length - 1);
    }

    expect(seen).toHaveLength(pool.length);
    expect(new Set(seen).size).toBe(pool.length);
    expect([...seen].sort()).toEqual([...pool].sort());
  });

  it("reshuffles under a new seed once the bag empties", () => {
    const pool = ["a", "b", "c"];
    const state: BagState = { seed: 1, cursor: 2, hash: "h" };
    const stepped = advance(state, pool.length, () => 77);
    expect(stepped.wrapped).toBe(true);
    expect(stepped.state).toEqual({ seed: 77, cursor: 0, hash: "h" });
  });

  it("is reproducible from the seed alone", () => {
    const pool = difficultyPool("sv", "easy");
    const hash = poolFingerprint("sv", "easy");
    const a = currentWord(pool, { seed: 4242, cursor: 17, hash });
    clearBagOrders();
    const b = currentWord(pool, { seed: 4242, cursor: 17, hash });
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it("actually shuffles rather than walking the pool in order", () => {
    const pool = difficultyPool("sv", "medium");
    const hash = poolFingerprint("sv", "medium");
    const first = Array.from({ length: 10 }, (_, i) =>
      currentWord(pool, { seed: 20260813, cursor: i, hash }),
    );
    expect(first).not.toEqual(pool.slice(0, 10));
  });
});

describe("ensureBag", () => {
  const hash = "abc";

  it("starts a bag when there is none", () => {
    expect(ensureBag(undefined, hash, 100, () => 5)).toEqual({
      seed: 5,
      cursor: 0,
      hash,
    });
  });

  it("keeps a valid saved bag", () => {
    const saved: BagState = { seed: 9, cursor: 3, hash };
    expect(ensureBag(saved, hash, 100, () => 5)).toBe(saved);
  });

  // The whole point of storing the hash: a rebuilt pool must not be indexed
  // with a cursor that was measured against a different ordering.
  it("resets when the pool has changed underneath it", () => {
    const saved: BagState = { seed: 9, cursor: 3, hash: "stale" };
    expect(ensureBag(saved, hash, 100, () => 5)).toEqual({
      seed: 5,
      cursor: 0,
      hash,
    });
  });

  it("resets when the cursor no longer addresses the pool", () => {
    const saved: BagState = { seed: 9, cursor: 500, hash };
    expect(ensureBag(saved, hash, 100, () => 5).cursor).toBe(0);
  });

  it("rejects corrupt payloads instead of trusting them", () => {
    for (const junk of [null, 42, "x", {}, { seed: "a", cursor: 0, hash }]) {
      expect(ensureBag(junk, hash, 100, () => 5)).toEqual({
        seed: 5,
        cursor: 0,
        hash,
      });
    }
  });
});

describe("pool fingerprints", () => {
  it("differ between difficulties and languages", () => {
    const all = LANGS.flatMap((lang) =>
      DIFFICULTIES.map((d) => poolFingerprint(lang, d)),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("is stable across calls", () => {
    expect(poolFingerprint("sv", "hard")).toBe(poolFingerprint("sv", "hard"));
  });
});
