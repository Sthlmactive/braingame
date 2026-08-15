import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LANGS, type Lang } from "../lib/i18n";
import { ACCEPTED_CLUES, checkClue, checkCrude } from "./build-clues";
import type { CachedClue } from "./generate-clues";

/**
 * Mechanical repair of the clue bank. No API calls, no model, no cost.
 *
 * Most rule breaches in the bulk run are not bad clues — they are good clues
 * with a redundant suffix, or false positives from a substring test. Those are
 * fixed here in code. Only what survives is worth paying a model to rewrite.
 *
 *   npx tsx scripts/fix-clues.ts [--write]
 */

const CLUE_DIR = join(process.cwd(), "data", "clues");



/**
 * Trailing grammatical tags. The clue's own noun phrase already carries the
 * form — "Den lilla butiken, bestämd form" says it twice — so the tag is
 * deleted rather than the clue rewritten.
 */
const TAG_PATTERNS: Record<Lang, RegExp[]> = {
  sv: [
    /,\s*i\s+bestämd\s+(form|plural|singular)\s*$/iu,
    /,\s*i\s+obestämd\s+form\s*$/iu,
    /,\s*i\s+plural(\s+form)?\s*$/iu,
    /,\s*i\s+singular(\s+form)?\s*$/iu,
    /,\s*i\s+neutrum\s*$/iu,
    /,\s*(bestämd|bestämt|obestämd|obestämt)(\s+form)?(\s+(maskulinum|femininum|neutrum|plural|singular))?\s*$/iu,
    /,\s*bestämt\s+i\s+flertal\s*$/iu,
    /,\s*med\s+bestämd\s+artikel\s*$/iu,
    /,\s*i\s+particip\s*$/iu,
    /,\s*i\s+böjd\s+form\s*$/iu,
    /,\s*uppmanande\s+form\s*$/iu,
    /,\s*i\s+grundform\s*$/iu,
    /,\s*pluralis\s*$/iu,
    // The tags the repair pass produced: the model swapped one metalinguistic
    // suffix for another rather than dropping the habit.
    /,\s*i\s+presens\s*$/iu,
    /,\s*i\s+preteritum\s*$/iu,
    /,\s*i\s+imperativ\s*$/iu,
    /,\s*i\s+infinitiv\s*$/iu,
    /,\s*i\s+supinum\s*$/iu,
    /,\s*i\s+flertal\s*$/iu,
    /,\s*i\s+genitivform\s*$/iu,
    /,\s*i\s+genitiv\s*$/iu,
    /,\s*(o?bestämd|o?bestämt)\s+artikel\s*$/iu,
    /,\s*verbform\s*$/iu,
    /\s+i\s+bestämd\s+form\s*$/iu,
  ],
  en: [
    /,\s*(in\s+the\s+)?plural(\s+form)?\s*$/iu,
    /,\s*(in\s+the\s+)?singular\s*$/iu,
    /,\s*past\s+tense\s*$/iu,
    /,\s*present\s+tense\s*$/iu,
    /,\s*definite\s+form\s*$/iu,
    /,\s*imperative\s*$/iu,
  ],
};

export function stripTag(clue: string, lang: Lang): string {
  let out = clue.trim();
  for (const pattern of TAG_PATTERNS[lang]) {
    const next = out.replace(pattern, "");
    if (next !== out) out = next.trim();
  }
  return out.replace(/[,\s]+$/u, "");
}

/**
 * Leading filler that costs words and carries no meaning. Trimmed only when
 * what remains is still a sentence — three words or more.
 */
const FILLER: Record<Lang, RegExp[]> = {
  sv: [
    // The infinitive marker: a Swedish crossword drops it as a matter of course.
    /^att\s+/iu,
    /^n[åa]got\s+som\s+/iu,
    /^en\s+person\s+som\s+/iu,
    /^det\s+som\s+/iu,
    /^en\s+som\s+/iu,
    /^man\s+kan\s+säga\s+att\s+/iu,
  ],
  en: [
    /^something\s+(that|which)\s+/iu,
    /^a\s+person\s+who\s+/iu,
    /^one\s+(that|who|which)\s+/iu,
    /^the\s+thing\s+that\s+/iu,
  ],
};

const wordCount = (s: string): number => s.trim().split(/\s+/u).filter(Boolean).length;

export function trimLength(clue: string, lang: Lang): string {
  let out = clue.trim();
  if (wordCount(out) < 8) return out;
  for (const pattern of FILLER[lang]) {
    const next = out.replace(pattern, "").trim();
    if (next !== out && wordCount(next) >= 3) {
      // Re-capitalise: dropping a leading word leaves a lowercase clue.
      out = next.charAt(0).toUpperCase() + next.slice(1);
      if (wordCount(out) < 8) return out;
    }
  }
  return out;
}

function main(): void {
  const write = process.argv.includes("--write");
  const examples: string[] = [];
  const survivors: { lang: Lang; word: string; flags: string[] }[] = [];
  let tagFixed = 0;
  let lengthFixed = 0;
  let collapsed = 0;

  for (const lang of LANGS) {
    const path = join(CLUE_DIR, `${lang}.json`);
    const cache = JSON.parse(readFileSync(path, "utf8")) as Record<string, CachedClue>;

    // Every entry, not only the flagged ones. The checker changes as rules are
    // learned, so an entry that passed under an older version may not pass now
    // — skipping the clean ones hides exactly those.
    for (const [word, entry] of Object.entries(cache)) {

      for (const key of ["clue1", "clue2"] as const) {
        const original = entry[key];
        let fixed = stripTag(original, lang);
        if (fixed !== original) {
          tagFixed++;
          if (examples.length < 20 && lang === "sv") {
            examples.push(`${word.padEnd(9)} ${original}\n${" ".repeat(9)} → ${fixed}`);
          }
        }
        const trimmed = trimLength(fixed, lang);
        if (trimmed !== fixed) {
          lengthFixed++;
          fixed = trimmed;
        }
        entry[key] = fixed;
      }

      // Re-check with the repaired text and the corrected matchers.
      const problems: string[] = [
        ...checkClue(entry.clue1, word, lang).map((p) => `1:${p.kind}(${p.detail})`),
        ...checkClue(entry.clue2, word, lang).map((p) => `2:${p.kind}(${p.detail})`),
        ...checkCrude(entry.clue1, lang).map((c) => `1:crude(${c})`),
        ...checkCrude(entry.clue2, lang).map((c) => `2:crude(${c})`),
      ];

      // When exactly one of the pair is clean, keep it in both slots rather
      // than condemn the word. Cutting it would cost a rebuild, orphan more
      // words, and throw away a clue that was fine.
      const bad1 = problems.some((p) => p.startsWith("1:"));
      const bad2 = problems.some((p) => p.startsWith("2:"));
      if (bad1 !== bad2) {
        const good = bad1 ? entry.clue2 : entry.clue1;
        entry.clue1 = good;
        entry.clue2 = good;
        entry.single = true;
        collapsed++;
        problems.length = 0;
      }

      // An accepted clue keeps every check except the one it was accepted for.
      const unresolved = ACCEPTED_CLUES.has(`${lang}/${word}`)
        ? problems.filter(
            (p) =>
              !p.includes("crude(") && !p.includes("form-tell(") && !p.includes("too-long("),
          )
        : problems;

      if (unresolved.length) {
        entry.flags = unresolved;
        survivors.push({ lang, word, flags: unresolved });
      } else {
        delete entry.flags;
      }
    }

    if (write) {
      const sorted: Record<string, CachedClue> = {};
      for (const key of Object.keys(cache).sort()) sorted[key] = cache[key]!;
      writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
    }
  }

  console.log("  TWENTY BEFORE / AFTER (sv, tag stripping)\n");
  for (const e of examples) console.log(`    ${e}\n`);

  console.log(`  tags stripped   ${tagFixed} clues`);
  console.log(`  length trimmed  ${lengthFixed} clues`);
  console.log(`  collapsed to one ${collapsed} words`);
  console.log(`\n  SURVIVORS NEEDING NEW TEXT: ${survivors.length} words`);
  const byKind = new Map<string, number>();
  for (const s of survivors) {
    for (const f of s.flags) {
      const kind = f.split(":")[1]!.split("(")[0]!;
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    }
  }
  for (const [kind, n] of [...byKind].sort()) console.log(`    ${kind.padEnd(16)} ${n}`);
  for (const s of survivors.slice(0, 40)) {
    console.log(`    ${s.lang}/${s.word} ${s.flags.join(" ")}`);
  }
  if (survivors.length > 40) console.log(`    ... and ${survivors.length - 40} more`);

  writeFileSync(
    join(CLUE_DIR, "needs-regeneration.json"),
    `${JSON.stringify(survivors, null, 2)}\n`,
  );
  console.log(`\n  ${write ? "WROTE" : "DRY RUN — pass --write to apply"}`);
}

main();
