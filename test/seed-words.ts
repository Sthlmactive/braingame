import type { Lang } from "@/lib/i18n";

/**
 * Words the dictionary must accept. This is the regression list: if a rebuild
 * of the word data ever drops one of these, the suite fails rather than the
 * player discovering it mid game.
 *
 * One word from the original hand written list is deliberately absent.
 * "måsvärld" is eight letters and is not a Swedish word (mås + värld is not a
 * compound anyone uses), so it belongs in NOT_WORDS below, not here.
 */
export const SEED_WORDS: Record<Lang, readonly string[]> = {
  sv: `vilka detta denna andra annan något inget ingen varje sedan
       genom under efter eller medan innan kring själv honom henne
       deras känna höger vänta söder äpple kväll björn
       gröna öppen ändra långt växer bröst hjälp stjäl fjäll skära
       örter vägen färsk hörde körde börja sätta tänka räkna önska
       kaffe stark snabb tjugo husen klart glass brann knapp skjut
       ljust tjock plats bilen skola svart grönt blått sitta ligga
       kasta hoppa krama sjung`
    .split(/\s+/)
    .filter(Boolean),
  en: `their which would could about there other after first never
       queue jazzy fjord lymph crypt vivid glyph nymph waltz proxy`
    .split(/\s+/)
    .filter(Boolean),
};

/**
 * The other half of the contract. A dictionary that accepts everything is as
 * broken as one that accepts nothing, so the things we refuse are pinned too.
 */
export const NOT_WORDS: Record<Lang, readonly string[]> = {
  // "måsvärld" is the non word from the original seed list. The rest are the
  // three junk families the frequency corpus is full of: proper nouns, OCR
  // damage where a capital I became an l, and run together speech.
  sv: ["måsvärld", "kjell", "norge", "lngen", "ldiot", "ärjag", "detär"],
  // Contraction fragments left behind by the corpus tokeniser, and names.
  en: ["doesn", "weren", "mustn", "david", "paris"],
};
