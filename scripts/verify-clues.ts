import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LANGS, type Lang } from "../lib/i18n";
import { checkClue, checkCrude } from "./build-clues";
import type { CachedClue } from "./generate-clues";

/**
 * Phase 3c: verify the clue bank, and produce a cut list.
 *
 * Two signals, both of which mean "nobody can solve this", and neither of
 * which is a request to rewrite the clue:
 *
 *   verifier-miss      shown only the clue and the length, the verifier does
 *                      not arrive at the word
 *   sense-disagreement the word's two clues describe different senses, so at
 *                      least one of them is about a different word
 *
 * The output is `docs/clue-review.md`, **a cut list**. A word that cannot be
 * clued is dropped from the answer pool and its puzzles are rebuilt; shipping a
 * clue nobody can solve is worse than shipping a slightly smaller bank.
 *
 *   ANTHROPIC_API_KEY=... npx tsx scripts/verify-clues.ts
 */

const CLUE_DIR = join(process.cwd(), "data", "clues");
const REVIEW = join(process.cwd(), "docs", "clue-review.md");

const MODEL = "claude-sonnet-5";
const IN_PER_M = 2;
const OUT_PER_M = 10;

const CHUNK = 50;
const CONCURRENCY = 4;
const MAX_SPEND_USD = 2;
const MAX_ATTEMPTS = 3;

const SOLVE_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, guess: { type: "string" } },
        required: ["id", "guess"],
        additionalProperties: false,
      },
    },
  },
  required: ["answers"],
  additionalProperties: false,
} as const;

const SENSE_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, same: { type: "boolean" } },
        required: ["id", "same"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
} as const;

const LANGUAGE_NAME: Record<Lang, string> = { sv: "Swedish", en: "English" };

class Ledger {
  input = 0;
  output = 0;
  add(i: number, o: number): void {
    this.input += i;
    this.output += o;
  }
  get usd(): number {
    return (this.input / 1e6) * IN_PER_M + (this.output / 1e6) * OUT_PER_M;
  }
  assertUnderCeiling(): void {
    if (this.usd > MAX_SPEND_USD) {
      throw new Error(`Spend ceiling hit: $${this.usd.toFixed(4)} > $${MAX_SPEND_USD.toFixed(2)}`);
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function ask<T>(
  client: Anthropic,
  ledger: Ledger,
  system: string,
  user: string,
  schema: object,
): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    ledger.assertUnderCeiling();
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: "low", format: { type: "json_schema", schema } },
      } as Anthropic.MessageCreateParamsNonStreaming);
      ledger.add(response.usage.input_tokens, response.usage.output_tokens);
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Spend ceiling")) throw error;
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt);
    }
  }
  return null;
}

interface Flagged {
  lang: Lang;
  word: string;
  reason: "verifier-miss" | "sense-disagreement";
  detail: string;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
  const client = new Anthropic();
  const ledger = new Ledger();
  const flagged: Flagged[] = [];
  const mechanical: string[] = [];

  for (const lang of LANGS) {
    const path = join(CLUE_DIR, `${lang}.json`);
    if (!existsSync(path)) continue;
    const cache = JSON.parse(readFileSync(path, "utf8")) as Record<string, CachedClue>;
    const words = Object.keys(cache).sort();
    console.log(`\n  ${lang}: verifying ${words.length} words`);

    // --- Mechanical re-check over the whole bank, free ----------------------
    for (const word of words) {
      const entry = cache[word]!;
      for (const [i, clue] of [entry.clue1, entry.clue2].entries()) {
        for (const p of checkClue(clue, word, lang)) {
          mechanical.push(`${lang}/${word}#${i + 1} ${p.kind}(${p.detail})`);
        }
        for (const c of checkCrude(clue, lang)) {
          mechanical.push(`${lang}/${word}#${i + 1} crude(${c})`);
        }
      }
    }

    // --- Blind solve: the clue, nothing else --------------------------------
    const solveSystem =
      `You are solving ${LANGUAGE_NAME[lang]} mini-crossword clues. For each clue you are ` +
      `given the clue text and the answer's length. Reply with the single ${LANGUAGE_NAME[lang]} ` +
      `word you believe is the answer, lowercase. Guess even when unsure; never leave one blank.`;

    const items = words.flatMap((word) => [
      { word, which: 1, clue: cache[word]!.clue1 },
      { word, which: 2, clue: cache[word]!.clue2 },
    ]);

    const guesses = new Map<string, string>();
    for (let c = 0; c < items.length; c += CHUNK * CONCURRENCY) {
      const wave: (typeof items)[] = [];
      for (let k = 0; k < CONCURRENCY; k++) {
        const slice = items.slice(c + k * CHUNK, c + (k + 1) * CHUNK);
        if (slice.length) wave.push(slice);
      }
      const results = await Promise.all(
        wave.map((slice) =>
          ask<{ answers: { id: number; guess: string }[] }>(
            client,
            ledger,
            solveSystem,
            slice
              .map((it, i) => `${i + 1}. (${it.word.length} letters) ${it.clue}`)
              .join("\n"),
            SOLVE_SCHEMA,
          ),
        ),
      );
      results.forEach((res, w) => {
        for (const a of res?.answers ?? []) {
          const item = wave[w]![a.id - 1];
          if (item) guesses.set(`${item.word}#${item.which}`, a.guess.toLowerCase().trim());
        }
      });
      process.stderr.write(
        `    solve ${Math.min(c + CHUNK * CONCURRENCY, items.length)}/${items.length}  $${ledger.usd.toFixed(4)}\r`,
      );
    }

    for (const word of words) {
      const g1 = guesses.get(`${word}#1`);
      const g2 = guesses.get(`${word}#2`);
      if (g1 !== word && g2 !== word) {
        flagged.push({
          lang,
          word,
          reason: "verifier-miss",
          detail: `clue1 → ${g1 ?? "?"}, clue2 → ${g2 ?? "?"}`,
        });
      }
    }

    // --- Sense agreement between a word's two clues -------------------------
    const senseSystem =
      `You are checking ${LANGUAGE_NAME[lang]} crossword clues. Each item gives two clues ` +
      `written for the same answer. Answer whether both clues point at the same sense of ` +
      `the same word. Different angles on one meaning count as the same sense; two different ` +
      `meanings, or two different words, do not.`;

    for (let c = 0; c < words.length; c += CHUNK * CONCURRENCY) {
      const wave: string[][] = [];
      for (let k = 0; k < CONCURRENCY; k++) {
        const slice = words.slice(c + k * CHUNK, c + (k + 1) * CHUNK);
        if (slice.length) wave.push(slice);
      }
      const results = await Promise.all(
        wave.map((slice) =>
          ask<{ verdicts: { id: number; same: boolean }[] }>(
            client,
            ledger,
            senseSystem,
            slice
              .map((w, i) => `${i + 1}. A: ${cache[w]!.clue1}\n   B: ${cache[w]!.clue2}`)
              .join("\n"),
            SENSE_SCHEMA,
          ),
        ),
      );
      results.forEach((res, w) => {
        for (const v of res?.verdicts ?? []) {
          const word = wave[w]![v.id - 1];
          if (word && !v.same) {
            flagged.push({
              lang,
              word,
              reason: "sense-disagreement",
              detail: `"${cache[word]!.clue1}" vs "${cache[word]!.clue2}"`,
            });
          }
        }
      });
      process.stderr.write(
        `    sense ${Math.min(c + CHUNK * CONCURRENCY, words.length)}/${words.length}  $${ledger.usd.toFixed(4)}\r`,
      );
    }
  }

  // --- The cut list ---------------------------------------------------------
  const cutWords = [...new Set(flagged.map((f) => f.word))].sort();
  const lines: string[] = [
    "# Clue review — the cut list",
    "",
    "Generated by `npx tsx scripts/verify-clues.ts`. Do not edit by hand.",
    "",
    "**This is a cut list, not a fix list.** Every word below failed a check that",
    "means a player cannot solve it: either the verifier could not reach the word",
    "from its own clue, or the word's two clues describe different senses. The",
    "response is to drop the word from the answer pool and rebuild the puzzles",
    "that used it — a clue nobody can solve is worse than a smaller bank.",
    "",
    `Total flagged: **${cutWords.length}** words.`,
    "",
  ];

  for (const reason of ["verifier-miss", "sense-disagreement"] as const) {
    const group = flagged.filter((f) => f.reason === reason);
    lines.push(`## ${reason} — ${group.length}`, "");
    for (const f of group) lines.push(`- \`${f.lang}\` **${f.word}** — ${f.detail}`);
    lines.push("");
  }

  lines.push(
    "## Mechanical violations",
    "",
    "Rule breaches the code catches without a model. These are **regenerated**,",
    "not cut — the word is fine, the clue is not.",
    "",
    `Total: ${mechanical.length}`,
    "",
    ...mechanical.map((m) => `- ${m}`),
    "",
  );

  writeFileSync(REVIEW, `${lines.join("\n")}\n`);
  writeFileSync(join(CLUE_DIR, "cut-proposed.json"), `${JSON.stringify(cutWords, null, 2)}\n`);

  console.log(`\n\n  MEASURED COST  $${ledger.usd.toFixed(4)}  (ceiling $${MAX_SPEND_USD.toFixed(2)})`);
  console.log(`    input ${ledger.input.toLocaleString()}, output ${ledger.output.toLocaleString()}`);
  console.log(`\n  FLAGGED FOR CUTTING: ${cutWords.length} words`);
  console.log(`    verifier-miss      ${flagged.filter((f) => f.reason === "verifier-miss").length}`);
  console.log(`    sense-disagreement ${flagged.filter((f) => f.reason === "sense-disagreement").length}`);
  console.log(`  MECHANICAL (regenerate, not cut): ${mechanical.length}`);
  console.log(`\n  wrote ${REVIEW} and data/clues/cut-proposed.json`);
}

main().catch((error: unknown) => {
  console.error(`\n${String(error)}`);
  process.exitCode = 1;
});
