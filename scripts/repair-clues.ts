import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LANGS, type Lang } from "../lib/i18n";
import {
  CLUE_SCHEMA,
  COMPOUND_RULE,
  checkClue,
  checkCrude,
  repairPrompt,
  systemPrompt,
  type RepairItem,
} from "./build-clues";
import type { CachedClue } from "./generate-clues";

/**
 * The targeted repair pass.
 *
 * Distinct from `generate-clues.ts --repair`, which re-sends the generic
 * prompt: this one quotes each failed clue back verbatim and names the exact
 * violation. The first pass halved the failures and then made the same mistake
 * again on the hard words, because nothing in it said what had been wrong.
 *
 *   ANTHROPIC_API_KEY=... npx tsx scripts/repair-clues.ts
 */

const CLUE_DIR = join(process.cwd(), "data", "clues");

const MODEL = "claude-sonnet-5";
const IN_PER_M = 2;
const OUT_PER_M = 10;

/** Smaller than the bulk chunk: each item carries its failed clue and reason. */
const CHUNK = 20;
const MAX_SPEND_USD = 0.5;
const MAX_ATTEMPTS = 3;

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

async function repairChunk(
  client: Anthropic,
  lang: Lang,
  items: RepairItem[],
  ledger: Ledger,
): Promise<Map<string, { clue1: string; clue2: string }>> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    ledger.assertUnderCeiling();
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: `${systemPrompt(lang)}\n\n${COMPOUND_RULE}`,
        messages: [{ role: "user", content: repairPrompt(items, lang) }],
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: CLUE_SCHEMA },
        },
      } as Anthropic.MessageCreateParamsNonStreaming);

      ledger.add(response.usage.input_tokens, response.usage.output_tokens);
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const parsed = JSON.parse(text) as {
        clues: { answer: string; clue1: string; clue2: string }[];
      };
      const out = new Map<string, { clue1: string; clue2: string }>();
      for (const row of parsed.clues ?? []) {
        out.set(row.answer.toLowerCase(), { clue1: row.clue1, clue2: row.clue2 });
      }
      return out;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Spend ceiling")) throw error;
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt);
    }
  }
  return new Map();
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
  const client = new Anthropic();
  const ledger = new Ledger();
  const stillBad: string[] = [];
  let fixed = 0;

  for (const lang of LANGS) {
    const path = join(CLUE_DIR, `${lang}.json`);
    const cache = JSON.parse(readFileSync(path, "utf8")) as Record<string, CachedClue>;
    const items: RepairItem[] = Object.entries(cache)
      .filter(([, entry]) => (entry.flags?.length ?? 0) > 0)
      .map(([word, entry]) => ({
        word,
        clue1: entry.clue1,
        clue2: entry.clue2,
        flags: entry.flags ?? [],
      }));

    console.log(`\n  ${lang}: repairing ${items.length} words`);

    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const result = await repairChunk(client, lang, chunk, ledger);

      for (const item of chunk) {
        const got = result.get(item.word);
        if (!got) {
          stillBad.push(`${lang}/${item.word}`);
          continue;
        }
        const problems = [
          ...checkClue(got.clue1, item.word, lang).map((p) => `1:${p.kind}(${p.detail})`),
          ...checkClue(got.clue2, item.word, lang).map((p) => `2:${p.kind}(${p.detail})`),
          ...checkCrude(got.clue1, lang).map((c) => `1:crude(${c})`),
          ...checkCrude(got.clue2, lang).map((c) => `2:crude(${c})`),
        ];
        if (problems.length === 0) {
          cache[item.word] = { clue1: got.clue1, clue2: got.clue2, model: MODEL };
          fixed++;
        } else {
          // Keep the new attempt with its flags, so the survivor list reflects
          // the best text we have rather than the original failure.
          cache[item.word] = {
            clue1: got.clue1,
            clue2: got.clue2,
            model: MODEL,
            flags: problems,
          };
          stillBad.push(`${lang}/${item.word} ${problems.join(" ")}`);
        }
      }
      process.stderr.write(`    ${Math.min(i + CHUNK, items.length)}/${items.length}  $${ledger.usd.toFixed(4)}\r`);
    }

    const sorted: Record<string, CachedClue> = {};
    for (const key of Object.keys(cache).sort()) sorted[key] = cache[key]!;
    writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
  }

  console.log(`\n\n  MEASURED COST  $${ledger.usd.toFixed(4)}  (ceiling $${MAX_SPEND_USD.toFixed(2)})`);
  console.log(`    input ${ledger.input.toLocaleString()}, output ${ledger.output.toLocaleString()}`);
  console.log(`\n  repaired ${fixed}, still failing ${stillBad.length}`);
  for (const s of stillBad) console.log(`    ${s}`);
  writeFileSync(
    join(CLUE_DIR, "still-failing.json"),
    `${JSON.stringify(stillBad, null, 2)}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(`\n${String(error)}`);
  process.exitCode = 1;
});
