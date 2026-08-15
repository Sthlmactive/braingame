"use client";

import { useCallback, useState } from "react";
import { advance, currentWord, ensureBag, loadBags, saveBag } from "./bag";
import { bandBagKey, bandHash, levelPool } from "./band";
import type { Difficulty } from "./difficulty";
import type { GameId, Level } from "./games";
import type { Lang } from "./i18n";

/**
 * Which level this round of `difficulty` plays.
 *
 * A shuffled bag over the band's levels, the same mechanism Five uses for
 * words: you see every level in the band before you see any of them twice.
 * Three rounds of Medel in a row are three different levels rather than a
 * coin flip that lands on the same one.
 */
export function useBandLevel(
  game: GameId,
  lang: Lang,
  difficulty: Difficulty,
): { level: Level; next: () => void } {
  const key = bandBagKey(game, lang, difficulty);
  const hash = bandHash(game, difficulty);
  const pool = levelPool(game, difficulty);

  const [bag, setBag] = useState(() =>
    ensureBag(loadBags()[key], hash, pool.length),
  );

  const next = useCallback(() => {
    setBag((state) => {
      const moved = advance(state, pool.length).state;
      saveBag(key, moved);
      return moved;
    });
  }, [key, pool.length]);

  const drawn = currentWord(pool, bag);
  // The pool is never empty, but a corrupt cursor should start the band over
  // rather than crash the game.
  const level = (drawn ? Number(drawn) : pool[0] ? Number(pool[0]) : 1) as Level;

  return { level, next };
}
