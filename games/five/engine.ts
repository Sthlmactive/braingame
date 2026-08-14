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

/**
 * Why a guess was refused. `null` means it was accepted.
 *
 * These are the only two reasons a guess can be turned away, and the strings
 * double as i18n keys for the flash message.
 */
export type RejectReason = "wrongLength" | "notAWord";

export interface GuessCheck {
  ok: boolean;
  reason: RejectReason | null;
}

/**
 * The single gate every guess passes through. Five's Enter key calls exactly
 * this, and so do the tests, so a rule can never be true in one and not the
 * other.
 *
 * There are exactly two ways to be refused: wrong length, or not a word. The
 * word check is the whole dictionary and never a frequency band, so the answer
 * may be drawn from a narrow pool while any real word remains a legal guess at
 * any point.
 */
export function checkGuess({
  guess,
  length,
  isWord,
}: {
  guess: string;
  length: number;
  isWord: (word: string) => boolean;
}): GuessCheck {
  if (guess.length !== length) return { ok: false, reason: "wrongLength" };
  if (!isWord(guess)) return { ok: false, reason: "notAWord" };
  return { ok: true, reason: null };
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
