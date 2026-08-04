/**
 * Five's rules, with no React and no dictionary access, so they can be tested
 * directly.
 */

export type Mark = "correct" | "present" | "absent";

/**
 * Per letter feedback. Duplicates are the part everyone gets wrong: a repeated
 * letter in the guess is only marked "present" as many times as it actually
 * remains in the answer after exact matches are taken out.
 */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const n = guess.length;
  const marks: Mark[] = new Array(n).fill("absent");
  const remaining = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) {
      marks[i] = "correct";
    } else {
      const ch = answer[i]!;
      remaining.set(ch, (remaining.get(ch) ?? 0) + 1);
    }
  }

  for (let i = 0; i < n; i++) {
    if (marks[i] === "correct") continue;
    const ch = guess[i]!;
    const left = remaining.get(ch) ?? 0;
    if (left > 0) {
      marks[i] = "present";
      remaining.set(ch, left - 1);
    }
  }

  return marks;
}

export type KeyMark = Mark | "unknown";

/** Fold the guesses so far into the keyboard's letter states. */
export function keyboardState(
  guesses: string[],
  answer: string,
): Record<string, KeyMark> {
  const rank: Record<KeyMark, number> = {
    unknown: 0,
    absent: 1,
    present: 2,
    correct: 3,
  };
  const out: Record<string, KeyMark> = {};
  for (const guess of guesses) {
    const marks = scoreGuess(guess, answer);
    for (let i = 0; i < guess.length; i++) {
      const ch = guess[i]!;
      const m = marks[i]!;
      // A letter never goes backwards: once correct, always correct.
      if (rank[m] > rank[out[ch] ?? "unknown"]) out[ch] = m;
    }
  }
  return out;
}

export interface HardModeViolation {
  kind: "missingCorrect" | "missingPresent";
  letter: string;
  /** Only set for missingCorrect. */
  position?: number;
}

/**
 * Hard mode: every clue already revealed has to be reused. A green letter must
 * stay in its column, and a yellow letter must appear somewhere.
 */
export function hardModeViolation(
  guess: string,
  previousGuesses: string[],
  answer: string,
): HardModeViolation | null {
  const fixed = new Map<number, string>();
  const required = new Map<string, number>();

  for (const prev of previousGuesses) {
    const marks = scoreGuess(prev, answer);
    const counts = new Map<string, number>();
    for (let i = 0; i < prev.length; i++) {
      const ch = prev[i]!;
      const m = marks[i]!;
      if (m === "correct") {
        fixed.set(i, ch);
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
      } else if (m === "present") {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
      }
    }
    // Across guesses, keep the strongest evidence for each letter.
    for (const [ch, n] of counts) {
      required.set(ch, Math.max(required.get(ch) ?? 0, n));
    }
  }

  for (const [pos, ch] of fixed) {
    if (guess[pos] !== ch) {
      return { kind: "missingCorrect", letter: ch, position: pos };
    }
  }

  const have = new Map<string, number>();
  for (const ch of guess) have.set(ch, (have.get(ch) ?? 0) + 1);
  for (const [ch, n] of required) {
    if ((have.get(ch) ?? 0) < n) return { kind: "missingPresent", letter: ch };
  }

  return null;
}

/**
 * Score for a solved board. Fewer guesses and faster is worth more, and the
 * hints spent come straight off the top so a hint is never free.
 */
export function scoreRun({
  solved,
  guessesUsed,
  guessesAllowed,
  timeMs,
  hintsUsed,
  length,
}: {
  solved: boolean;
  guessesUsed: number;
  guessesAllowed: number;
  timeMs: number;
  hintsUsed: number;
  length: number;
}): number {
  if (!solved) return 0;
  const base = 100 * length;
  const spare = Math.max(0, guessesAllowed - guessesUsed);
  const speed = Math.max(0, 240 - Math.floor(timeMs / 1000)) * 2;
  return Math.max(0, base + spare * 60 + speed - hintsUsed * 80);
}

/** Which position a hint should reveal: the first still-unknown letter. */
export function hintPosition(
  answer: string,
  guesses: string[],
  alreadyRevealed: ReadonlySet<number>,
): number | null {
  const known = new Set<number>(alreadyRevealed);
  for (const g of guesses) {
    const marks = scoreGuess(g, answer);
    marks.forEach((m, i) => {
      if (m === "correct") known.add(i);
    });
  }
  for (let i = 0; i < answer.length; i++) {
    if (!known.has(i)) return i;
  }
  return null;
}
