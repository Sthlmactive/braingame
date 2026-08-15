import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LANGS, type Lang } from "../lib/i18n";
import {
  CLUE_SCHEMA,
  PILOT_MODELS,
  checkClue,
  checkCrude,
  systemPrompt,
  userPrompt,
  type Picked,
} from "./build-clues";

/**
 * The clue pilot: the same words, clued by every candidate model, so the
 * comparison is between models rather than between samples.
 *
 * Packs every word into one request per (model, language). One request per
 * word would re-send the rules 50 times for no benefit — and in the bulk run,
 * 5,220 times.
 *
 *   ANTHROPIC_API_KEY=... npx tsx scripts/run-clue-pilot.ts
 */

const OUT_DIR = join(process.cwd(), "data", "clues");

/** Two clues for 50 words, plus JSON scaffolding. Generous, not streaming. */
const MAX_TOKENS = 8000;

interface ClueRow {
  answer: string;
  clue1: string;
  clue2: string;
}

interface ModelRun {
  model: string;
  label: string;
  lang: Lang;
  clues: ClueRow[];
  usage: { input: number; output: number };
  costUsd: number;
  ms: number;
}

function priceOf(model: (typeof PILOT_MODELS)[number], input: number, output: number): number {
  return (input / 1e6) * model.inPerM + (output / 1e6) * model.outPerM;
}

async function runOne(
  client: Anthropic,
  model: (typeof PILOT_MODELS)[number],
  lang: Lang,
  words: Picked[],
): Promise<ModelRun> {
  const started = Date.now();
  const response = await client.messages.create({
    model: model.id,
    max_tokens: MAX_TOKENS,
    system: systemPrompt(lang),
    messages: [{ role: "user", content: userPrompt(words) }],
    output_config: {
      // Haiku 4.5 does not accept `effort`; the others run it low, since this
      // is short-form writing rather than reasoning.
      ...(model.effort ? { effort: model.effort } : {}),
      format: { type: "json_schema", schema: CLUE_SCHEMA },
    },
  } as Anthropic.MessageCreateParamsNonStreaming);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let clues: ClueRow[] = [];
  try {
    clues = (JSON.parse(text) as { clues: ClueRow[] }).clues ?? [];
  } catch {
    console.error(`  ${model.label} ${lang}: response was not valid JSON`);
  }

  return {
    model: model.id,
    label: model.label,
    lang,
    clues,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    costUsd: priceOf(model, response.usage.input_tokens, response.usage.output_tokens),
    ms: Date.now() - started,
  };
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  const client = new Anthropic();
  const sample = JSON.parse(
    readFileSync(join(OUT_DIR, "pilot-sample.json"), "utf8"),
  ) as Record<Lang, Picked[]>;

  const runs: ModelRun[] = [];
  for (const lang of LANGS) {
    for (const model of PILOT_MODELS) {
      process.stderr.write(`  running ${model.label} ${lang}...\n`);
      runs.push(await runOne(client, model, lang, sample[lang]));
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "pilot-results.json"), `${JSON.stringify(runs, null, 2)}\n`);

  // --- Cost ---------------------------------------------------------------
  console.log("\n  MEASURED PILOT COST");
  let total = 0;
  for (const run of runs) {
    total += run.costUsd;
    console.log(
      `    ${run.label.padEnd(10)} ${run.lang}  in ${String(run.usage.input).padStart(5)}` +
        `  out ${String(run.usage.output).padStart(5)}  $${run.costUsd.toFixed(4)}` +
        `  ${(run.ms / 1000).toFixed(1)}s`,
    );
  }
  console.log(`    total $${total.toFixed(4)}`);

  // --- Mechanical checks --------------------------------------------------
  console.log("\n  RULE VIOLATIONS (checked in code, not by a model)");
  for (const run of runs) {
    const problems: string[] = [];
    for (const row of run.clues) {
      for (const [n, clue] of [row.clue1, row.clue2].entries()) {
        for (const p of checkClue(clue, row.answer, run.lang)) {
          problems.push(`${row.answer}#${n + 1} ${p.kind}(${p.detail})`);
        }
        for (const crude of checkCrude(clue, run.lang)) {
          problems.push(`${row.answer}#${n + 1} crude(${crude})`);
        }
      }
    }
    console.log(
      `    ${run.label.padEnd(10)} ${run.lang}  ${run.clues.length} words, ` +
        `${problems.length} violations${problems.length ? `: ${problems.slice(0, 8).join(", ")}` : ""}`,
    );
  }

  // --- Side by side -------------------------------------------------------
  for (const lang of LANGS) {
    const byModel = PILOT_MODELS.map((m) => runs.find((r) => r.lang === lang && r.model === m.id));
    console.log(`\n  ${"=".repeat(100)}\n  ${lang.toUpperCase()} — first clue per word, same words across models\n  ${"=".repeat(100)}`);
    for (const picked of sample[lang]) {
      console.log(`\n    ${picked.word.toUpperCase()}  (${picked.reason}, ${picked.neighbours} neighbours)`);
      for (const [i, run] of byModel.entries()) {
        const row = run?.clues.find((c) => c.answer.toLowerCase() === picked.word);
        console.log(`      ${PILOT_MODELS[i]!.label.padEnd(10)} ${row?.clue1 ?? "(missing)"}`);
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
