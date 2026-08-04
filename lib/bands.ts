/**
 * Difficulty bands. A band is a slice of the answer pool taken by corpus
 * frequency rank, so "top 3k" really does mean "drawn from the three thousand
 * commonest words in the language".
 */

export const BAND_NAMES = [
  "top1k",
  "top2k",
  "top3k",
  "top5k",
  "top10k",
  "top20k",
  "top40k",
  "full",
] as const;

export type Band = (typeof BAND_NAMES)[number];

/** Frequency rank cut-off for each band. `null` means the whole pool. */
export const BAND_LIMITS: Record<Band, number | null> = {
  top1k: 1000,
  top2k: 2000,
  top3k: 3000,
  top5k: 5000,
  top10k: 10000,
  top20k: 20000,
  top40k: 40000,
  full: null,
};

export function isBand(v: unknown): v is Band {
  return typeof v === "string" && (BAND_NAMES as readonly string[]).includes(v);
}
