/**
 * Loop's crossword layout. Shared by the build script that generates boards
 * and the runtime that plays them, so the two can never drift apart.
 */

export type Dir = "h" | "v";

export interface Placement {
  word: string;
  x: number;
  y: number;
  dir: Dir;
}

export interface LoopBoard {
  /** The wheel's letters, in no particular order. */
  wheel: string;
  words: Placement[];
  width: number;
  height: number;
}

export interface LoopBoardFile {
  lang: string;
  level: number;
  boards: LoopBoard[];
}

export const key = (x: number, y: number): string => `${x},${y}`;

/** Render placements onto a sparse letter map. */
export function layout(words: Placement[]): Map<string, string> {
  const cells = new Map<string, string>();
  for (const p of words) {
    for (let i = 0; i < p.word.length; i++) {
      const x = p.dir === "h" ? p.x + i : p.x;
      const y = p.dir === "v" ? p.y + i : p.y;
      cells.set(key(x, y), p.word[i]!);
    }
  }
  return cells;
}

/**
 * Whether a word can go here under ordinary crossword rules: it may cross
 * existing letters only where they match, it must not run straight into
 * another word, and it must not lie alongside one.
 */
export function canPlace(
  cells: Map<string, string>,
  word: string,
  x: number,
  y: number,
  dir: Dir,
  requireCross: boolean,
): boolean {
  const dx = dir === "h" ? 1 : 0;
  const dy = dir === "v" ? 1 : 0;

  // Nothing may butt up against either end.
  if (cells.has(key(x - dx, y - dy))) return false;
  if (cells.has(key(x + dx * word.length, y + dy * word.length))) return false;

  let crossings = 0;
  for (let i = 0; i < word.length; i++) {
    const cx = x + dx * i;
    const cy = y + dy * i;
    const existing = cells.get(key(cx, cy));
    if (existing !== undefined) {
      if (existing !== word[i]) return false;
      crossings++;
      continue;
    }
    // An empty cell must not have neighbours to either side, or the two words
    // would read as one longer nonsense word.
    const sideA = dir === "h" ? key(cx, cy - 1) : key(cx - 1, cy);
    const sideB = dir === "h" ? key(cx, cy + 1) : key(cx + 1, cy);
    if (cells.has(sideA) || cells.has(sideB)) return false;
  }

  return requireCross ? crossings > 0 : true;
}

/** Shift every placement so the board starts at 0,0, and measure it. */
export function normalise(words: Placement[]): LoopBoard["words"] & Placement[] {
  if (words.length === 0) return [];
  let minX = Infinity;
  let minY = Infinity;
  for (const p of words) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  return words.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY }));
}

export function measure(words: Placement[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const p of words) {
    width = Math.max(width, p.x + (p.dir === "h" ? p.word.length : 1));
    height = Math.max(height, p.y + (p.dir === "v" ? p.word.length : 1));
  }
  return { width, height };
}
