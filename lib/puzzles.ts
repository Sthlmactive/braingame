import type { Lang } from "./i18n";
import type { LoopBoard } from "@/games/loop/board";

/**
 * Loader for the puzzles that are generated at build time rather than on the
 * phone: Grid's word squares and Loop's crossword boards.
 */

export type Loader = (path: string) => Promise<unknown>;

let loader: Loader = async (path) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`puzzles: ${res.status} for ${path}`);
  return res.json();
};

export function setPuzzleLoader(fn: Loader): void {
  loader = fn;
}

const squareCache = new Map<Lang, string[][]>();
const loopCache = new Map<Lang, Record<number, LoopBoard[]>>();

export async function loadGridSquares(lang: Lang): Promise<string[][]> {
  const cached = squareCache.get(lang);
  if (cached) return cached;
  const data = (await loader(`/data/${lang}/grid-squares.json`)) as {
    squares: string[][];
  };
  const squares = data.squares ?? [];
  squareCache.set(lang, squares);
  return squares;
}

export async function loadLoopBoards(
  lang: Lang,
): Promise<Record<number, LoopBoard[]>> {
  const cached = loopCache.get(lang);
  if (cached) return cached;
  const data = (await loader(`/data/${lang}/loop-boards.json`)) as {
    loop: Record<number, LoopBoard[]>;
  };
  const loop = data.loop ?? {};
  loopCache.set(lang, loop);
  return loop;
}

export function clearPuzzleCache(): void {
  squareCache.clear();
  loopCache.clear();
}
