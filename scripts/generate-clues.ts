import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareWords } from "../lib/alphabet";
import { LANGS, type Lang } from "../lib/i18n";
import {
  CLUE_SCHEMA,
  checkClue,
  checkCrude,
  inventory,
  loadCutList,
  systemPrompt,
  userPrompt,
  type Picked,
} from "./build-clues";

/**
 * The bulk clue run.
 *
 * Sonnet 5, chosen in the pilot on Swedish quality rather than price — see
 * docs/mini-spec.md. Cached to disk and committed, so a rebuild costs nothing:
 * only words absent from the cache are ever sent.
 *
 *   ANTHROPIC_API_KEY=... npx tsx scripts/generate-clues.ts
 */

const OUT_DIR = join(process.cwd(), "data", "clues");

const MODEL = "claude-sonnet-5";
const IN_PER_M = 2;
const OUT_PER_M = 10;

/**
 * Words per request. One request per word would re-send the rules 5,000 times;
 * 50 is what the pilot proved a model can hold without dropping entries.
 */
const CHUNK = 50;

/** Chunks in flight. Cuts an hour of sequential calls to about a quarter of it. */
const CONCURRENCY = 4;

/**
 * Hard ceiling. The run aborts rather than continuing past it — a bug that
 * loops requests should cost a few dollars, not a few hundred.
 */
const MAX_SPEND_USD = 3;

/** Attempts per chunk before it is recorded as failed and the run moves on. */
const MAX_ATTEMPTS = 3;

const MAX_TOKENS = 8000;

export interface CachedClue {
  clue1: string;
  clue2: string;
  model: string;
  /** Mechanical rule violations found at generation time, if any survived. */
  flags?: string[];
  /**
   * Only one usable clue, repeated in both slots.
   *
   * Two clues exist so a word met again does not read identically. When one of
   * the pair breaks a rule and the other is clean, keeping the clean one is
   * better than cutting the word: the player loses a little variety, not a
   * solvable puzzle.
   */
  single?: true;
}

type Cache = Record<string, CachedClue>;

function cachePath(lang: Lang): string {
  return join(OUT_DIR, `${lang}.json`);
}

function loadCache(lang: Lang): Cache {
  const path = cachePath(lang);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Cache) : {};
}

function saveCache(lang: Lang, cache: Cache): void {
  // Sorted, so the committed file diffs cleanly rather than by insertion order.
  const sorted: Cache = {};
  for (const key of Object.keys(cache).sort()) sorted[key] = cache[key]!;
  writeFileSync(cachePath(lang), `${JSON.stringify(sorted, null, 2)}\n`);
}

class Ledger {
  input = 0;
  output = 0;

  add(input: number, output: number): void {
    this.input += input;
    this.output += output;
  }

  get usd(): number {
    return (this.input / 1e6) * IN_PER_M + (this.output / 1e6) * OUT_PER_M;
  }

  assertUnderCeiling(): void {
    if (this.usd > MAX_SPEND_USD) {
      throw new Error(
        `Spend ceiling hit: $${this.usd.toFixed(4)} exceeds $${MAX_SPEND_USD.toFixed(2)}. ` +
          `Cache is written up to this point; re-run to continue after raising MAX_SPEND_USD.`,
      );
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function clueChunk(
  client: Anthropic,
  lang: Lang,
  words: Picked[],
  ledger: Ledger,
): Promise<Map<string, { clue1: string; clue2: string }>> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    ledger.assertUnderCeiling();
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt(lang),
        messages: [{ role: "user", content: userPrompt(words) }],
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
      lastError = error;
      if (error instanceof Error && error.message.startsWith("Spend ceiling")) throw error;
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt);
    }
  }

  console.error(`    chunk failed after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`);
  return new Map();
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
  mkdirSync(OUT_DIR, { recursive: true });

  const repair = process.argv.includes("--repair");
  const client = new Anthropic();
  const ledger = new Ledger();
  const cut = loadCutList();
  const started = Date.now();
  let generated = 0;
  let failed = 0;
  const flagged: string[] = [];

  for (const lang of LANGS) {
    const cache = loadCache(lang);
    const facts = inventory(lang);
    // A word needs clueing when it has none, and — in repair mode — when the
    // clue it has breaks a rule. Repairs and new words go in one pass: the
    // rebuild orphans words at the same time as the checker condemns clues,
    // and two passes would pay the per-request overhead twice.
    const needsRepair = (word: string): boolean =>
      repair && (cache[word]?.flags?.length ?? 0) > 0;
    const todo = [...facts.values()]
      .filter((f) => (!cache[f.word] || needsRepair(f.word)) && !cut.has(f.word))
      .sort((a, b) => compareWords(a.word, b.word, lang))
      .map((f) => ({ ...f, reason: "bulk" }) as Picked);

    console.log(
      `\n  ${lang}: ${facts.size} words in banks, ${Object.keys(cache).length} cached, ` +
        `${cut.size ? `${[...cut].length} on the cut list, ` : ""}${todo.length} to generate`,
    );

    const chunks: Picked[][] = [];
    for (let i = 0; i < todo.length; i += CHUNK) chunks.push(todo.slice(i, i + CHUNK));

    let done = 0;
    for (let c = 0; c < chunks.length; c += CONCURRENCY) {
      const wave = chunks.slice(c, c + CONCURRENCY);
      const results = await Promise.all(
        wave.map((chunk) => clueChunk(client, lang, chunk, ledger)),
      );

      for (const [w, chunk] of wave.entries()) {
      const clues = results[w]!;
      for (const word of chunk) {
        const got = clues.get(word.word);
        if (!got) {
          failed++;
          continue;
        }
        const problems = [
          ...checkClue(got.clue1, word.word, lang).map((p) => `1:${p.kind}(${p.detail})`),
          ...checkClue(got.clue2, word.word, lang).map((p) => `2:${p.kind}(${p.detail})`),
          ...checkCrude(got.clue1, lang).map((c) => `1:crude(${c})`),
          ...checkCrude(got.clue2, lang).map((c) => `2:crude(${c})`),
        ];
        cache[word.word] = {
          ...got,
          model: MODEL,
          ...(problems.length ? { flags: problems } : {}),
        };
        if (problems.length) flagged.push(`${lang}/${word.word} ${problems.join(" ")}`);
        generated++;
      }
      done += chunk.length;
      }

      saveCache(lang, cache); // after every wave, so a crash loses one wave
      process.stderr.write(`    ${done}/${todo.length}  $${ledger.usd.toFixed(4)}\r`);
    }
    saveCache(lang, cache);
  }

  console.log(`\n\n  MEASURED COST`);
  console.log(`    input  ${ledger.input.toLocaleString()} tokens`);
  console.log(`    output ${ledger.output.toLocaleString()} tokens`);
  console.log(`    total  $${ledger.usd.toFixed(4)}  (ceiling $${MAX_SPEND_USD.toFixed(2)})`);
  console.log(`    ${generated} words clued, ${failed} failed, ${((Date.now() - started) / 1000).toFixed(0)}s`);

  console.log(`\n  MECHANICAL FLAGS: ${flagged.length}`);
  for (const f of flagged.slice(0, 40)) console.log(`    ${f}`);
  if (flagged.length > 40) console.log(`    ... and ${flagged.length - 40} more`);
}

main().catch((error: unknown) => {
  console.error(`\n${String(error)}`);
  process.exitCode = 1;
});
