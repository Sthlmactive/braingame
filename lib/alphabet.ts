import type { Lang } from "./i18n";

/**
 * Å, Ä and Ö are letters in their own right. They are never folded to A and O,
 * and they sort last, after Z, in that order.
 */
export const ALPHABETS: Record<Lang, readonly string[]> = {
  en: "abcdefghijklmnopqrstuvwxyz".split(""),
  sv: "abcdefghijklmnopqrstuvwxyzåäö".split(""),
};

const ORDER: Record<Lang, Map<string, number>> = {
  en: new Map(ALPHABETS.en.map((c, i) => [c, i])),
  sv: new Map(ALPHABETS.sv.map((c, i) => [c, i])),
};

/** Rank of a letter in the language's alphabet, or a large number if foreign. */
export function letterRank(ch: string, lang: Lang): number {
  return ORDER[lang].get(ch) ?? 999;
}

/** Sort comparator that puts Å Ä Ö after Z rather than next to A and O. */
export function compareWords(a: string, b: string, lang: Lang): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ra = letterRank(a[i]!, lang);
    const rb = letterRank(b[i]!, lang);
    if (ra !== rb) return ra - rb;
  }
  return a.length - b.length;
}

/** Lowercase and NFC normalise for lookup. The display form is kept separately. */
export function normalise(word: string): string {
  return word.normalize("NFC").toLowerCase();
}

const ALPHA_RE: Record<Lang, RegExp> = {
  en: /^[a-z]+$/,
  sv: /^[a-zåäö]+$/,
};

/** True when every character is a letter of that language's alphabet. */
export function isAlphabetic(word: string, lang: Lang): boolean {
  return ALPHA_RE[lang].test(word);
}

/** Multiset of letters, used everywhere we ask "can these tiles spell this?". */
export function letterCounts(word: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const ch of word) m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
}

/** True when `word` can be spelled from `pool` without reusing a letter. */
export function canSpell(word: string, pool: Map<string, number>): boolean {
  const need = letterCounts(word);
  for (const [ch, n] of need) {
    if ((pool.get(ch) ?? 0) < n) return false;
  }
  return true;
}
