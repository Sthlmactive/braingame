import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

/**
 * Downloads the two upstream sources the word pipeline needs into
 * scripts/.cache, which is never committed. Both were checked for licence
 * before being depended on:
 *
 *   saldom.xml   SALDO morphology, Språkbanken, Göteborgs universitet.
 *                CC BY 4.0. ~254 MB. Full Swedish inflection with POS tags.
 *   *_50k.txt    OpenSubtitles 2018 frequency counts, hermitdave/FrequencyWords.
 *                MIT. Used only to rank words into difficulty bands.
 *
 * The English word list comes from the `wordlist-english` npm package (SCOWL,
 * Kevin Atkinson's permissive licence) and needs no download.
 */

const CACHE = join(process.cwd(), "scripts", ".cache");

const SOURCES: Array<{ name: string; url: string; minBytes: number }> = [
  {
    name: "saldom.xml",
    url: "https://svn.spraakbanken.gu.se/sb-arkiv/pub/lmf/saldom/saldom.xml",
    minBytes: 200_000_000,
  },
  {
    name: "en_50k.txt",
    url: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt",
    minBytes: 400_000,
  },
  {
    name: "sv_50k.txt",
    url: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/sv/sv_50k.txt",
    minBytes: 400_000,
  },
];

async function fetchOne(name: string, url: string, minBytes: number): Promise<void> {
  const dest = join(CACHE, name);
  if (existsSync(dest) && statSync(dest).size >= minBytes) {
    console.log(`${name}: already cached`);
    return;
  }
  console.log(`${name}: downloading…`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`${name}: ${res.status} ${res.statusText} from ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
  const size = statSync(dest).size;
  if (size < minBytes) {
    throw new Error(
      `${name}: downloaded only ${size} bytes, expected at least ${minBytes}. ` +
        `The upstream source may have moved.`,
    );
  }
  console.log(`${name}: ${(size / 1e6).toFixed(1)} MB`);
}

async function main(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  for (const s of SOURCES) await fetchOne(s.name, s.url, s.minBytes);
  console.log("\nSources ready. Run `npm run data:words` next.");
}

void main();
