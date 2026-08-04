import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadLanguage, setFetcher } from "@/lib/dictionary";
import type { Lang } from "@/lib/i18n";

/** Tests read the built data straight off disk instead of over the network. */
setFetcher(async (path) => {
  const buf = await readFile(join(process.cwd(), "public", path));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
});

export async function useLanguage(lang: Lang) {
  return loadLanguage(lang);
}
