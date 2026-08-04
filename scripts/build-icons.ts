import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Canvas, hex, ring, roundedRect } from "./lib/png";

/**
 * The icon is the tile motif: an ink field, one accent tile, and the O of
 * Ordlek cut into it. Same shape at every size, with a wider margin on the
 * maskable variant so Android's circle crop never bites into the tile.
 */

const INK = "#0D1016";
const ACCENT = "#5B7CFF";
const TEXT = "#0D1016";

const OUT = join(process.cwd(), "public", "icons");

interface Opts {
  size: number;
  /** Fraction of the canvas the tile occupies. */
  scale: number;
  /** Draw the ink background, or leave it transparent. */
  background: boolean;
}

function draw({ size, scale, background }: Opts): Canvas {
  const c = new Canvas(size, size);
  if (background) c.fill(hex(INK));

  const cx = size / 2;
  const cy = size / 2;
  const half = (size * scale) / 2;
  const radius = half * 0.26;

  // The tile.
  c.fillSdf(roundedRect(cx, cy, half, half, radius), hex(ACCENT));

  // The O, knocked out in the ink colour so it still reads at 32px.
  const r = half * 0.44;
  const thickness = half * 0.28;
  c.fillSdf(ring(cx, cy, r, thickness), hex(TEXT));

  return c;
}

function svg(): string {
  const S = 512;
  const half = S * 0.34;
  const cx = S / 2;
  const r = half * 0.46;
  const w = half * 0.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="Ordlek">
  <rect width="${S}" height="${S}" fill="${INK}"/>
  <rect x="${cx - half}" y="${cx - half}" width="${half * 2}" height="${half * 2}" rx="${half * 0.26}" fill="${ACCENT}"/>
  <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${TEXT}" stroke-width="${w}"/>
</svg>
`;
}

function main(): void {
  mkdirSync(OUT, { recursive: true });

  writeFileSync(join(OUT, "icon.svg"), svg());

  const targets: Array<[string, Opts]> = [
    ["apple-touch-icon.png", { size: 180, scale: 0.68, background: true }],
    ["icon-192.png", { size: 192, scale: 0.68, background: true }],
    ["icon-512.png", { size: 512, scale: 0.68, background: true }],
    // Maskable keeps everything inside the 80% safe zone.
    ["maskable-512.png", { size: 512, scale: 0.5, background: true }],
    ["favicon-32.png", { size: 32, scale: 0.78, background: true }],
  ];

  for (const [name, opts] of targets) {
    writeFileSync(join(OUT, name), draw(opts).toPng());
    console.log(`wrote icons/${name} (${opts.size}px)`);
  }
  console.log("wrote icons/icon.svg");
}

main();
