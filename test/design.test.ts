import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardGlyph, glyphShapes } from "@/components/BoardGlyph";
import { GAME_IDS } from "@/lib/games";
import { revealTiming, FLIP_MS, STAGGER_MS, FADE_MS } from "@/lib/reveal";

/**
 * The design system, checked rather than eyeballed.
 *
 * There is deliberately no greyscale separation test here. The palette is
 * Wordle-conventional green and yellow, which sit close in lightness and would
 * not pass one; see docs/design.md. A threshold lowered until whatever ships
 * passes it would test nothing, so the check is absent rather than weakened.
 */

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/** The declarations inside one brace-balanced block starting at `from`. */
function blockAt(text: string, from: number): string {
  const open = text.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error("unbalanced CSS block");
}

function tokensIn(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

const lightTokens = tokensIn(blockAt(CSS, CSS.indexOf(":root")));
const darkTokens = tokensIn(
  blockAt(CSS, CSS.indexOf(":root", CSS.indexOf("prefers-color-scheme: dark"))),
);

/** Resolve a token to a hex, following one level of `var(--x)` indirection. */
function resolve(name: string, mode: "light" | "dark"): string {
  const table = mode === "dark" ? darkTokens : lightTokens;
  let value = table.get(name) ?? lightTokens.get(name);
  for (let i = 0; i < 4 && value && value.startsWith("var("); i++) {
    const inner = value.slice(4, value.indexOf(")")).trim();
    value = (mode === "dark" ? darkTokens.get(inner) : undefined) ?? lightTokens.get(inner);
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`token ${name} (${mode}) is not a hex: ${String(value)}`);
  }
  return value;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const MODES = ["light", "dark"] as const;

describe("contrast", () => {
  // Text on a state colour. `miss` is a light neutral by design, so it carries
  // its own foreground: white on it is 3.4:1, ink on it is 5.2:1.
  const pairs: Array<[fg: string, bg: string]> = [
    ["--on-state", "--hit"],
    ["--on-state", "--near"],
    ["--on-miss", "--miss"],
    ["--ink", "--paper"],
    ["--ink", "--raised"],
    ["--muted", "--paper"],
    ["--muted", "--raised"],
  ];

  it.each(MODES)("%s mode clears 4.5:1 on every text pair", (mode) => {
    for (const [fg, bg] of pairs) {
      const ratio = contrast(resolve(fg, mode), resolve(bg, mode));
      expect(
        ratio,
        `${fg} on ${bg} in ${mode} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("colour only ever means game state", () => {
  /**
   * The state tokens belong to the board, the keyboard keys reporting a
   * result, and the one result-sheet bar reporting the round just played.
   * Nothing else in the app may reach for them.
   */
  const ALLOWED = new Set([
    "components/Tile.tsx",
    "components/Keyboard.tsx",
    "games/five/FiveResult.tsx",
    // Mini's only coloured pixel: the time, when it is a personal best. The
    // board itself never reports state mid solve, so nothing there is
    // coloured — see docs/mini-spec.md.
    "games/mini/MiniResult.tsx",
  ]);

  const sources = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(join(process.cwd(), dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...sources(rel));
      else if (/\.tsx?$/.test(entry.name)) out.push(rel);
    }
    return out;
  };

  it("is not referenced by any other component", () => {
    const offenders = ["app", "components", "games", "lib"]
      .flatMap(sources)
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) =>
        /var\(--(hit|near|miss)\)/.test(readFileSync(join(process.cwd(), rel), "utf8")),
      );
    expect(offenders, `state colours leaked into: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });

  /**
   * Stricter, and scoped to the screens this pass redesigned: they may not
   * reach for a state colour under its legacy alias either, nor light a per
   * game accent. Chrome on these screens is ink, paper, raised, line, muted.
   */
  it("keeps home and Five free of every colour token", () => {
    const redesigned = [
      "app/page.tsx",
      ...sources("app/five"),
      ...sources("games/five"),
    ].filter((rel) => !ALLOWED.has(rel));
    const offenders = redesigned.filter((rel) =>
      /var\(--(hit|near|miss|correct|present|absent|accent[a-z-]*)\)/.test(
        readFileSync(join(process.cwd(), rel), "utf8"),
      ),
    );
    expect(offenders, `colour on a redesigned screen: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });
});

describe("board glyphs", () => {
  it.each(GAME_IDS)("%s has geometry", (id) => {
    const shapes = glyphShapes(id);
    expect(shapes.length).toBeGreaterThan(0);
  });

  it("throws on an unknown game rather than rendering an empty box", () => {
    expect(() => glyphShapes("sudoku")).toThrow(/no glyph/);
  });

  it.each(GAME_IDS)("%s renders monochrome svg", (id) => {
    const html = renderToStaticMarkup(createElement(BoardGlyph, { game: id }));
    expect(html).toContain("<svg");
    expect(html).toContain("var(--line)");
    // A glyph is navigation, so it may not carry a state colour.
    expect(html).not.toMatch(/var\(--(hit|near|miss)\)/);
  });

  it("draws Hive as a flower of seven hexes, not a diagonal", () => {
    const hexes = glyphShapes("hive").filter((s) => s.kind === "hex");
    expect(hexes).toHaveLength(7);
    // Six of them sit at one equal radius around the seventh.
    const centre = hexes[0]!;
    if (centre.kind !== "hex") throw new Error("expected hex");
    const radii = hexes.slice(1).map((s) => {
      if (s.kind !== "hex") throw new Error("expected hex");
      return Math.hypot(s.cx - centre.cx, s.cy - centre.cy);
    });
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 5);
  });

  it("draws Five as a single row of five", () => {
    const shapes = glyphShapes("five");
    expect(shapes).toHaveLength(5);
    const ys = new Set(shapes.map((s) => (s.kind === "rect" ? s.y : NaN)));
    expect(ys.size).toBe(1);
  });

  it("draws Rush as an interlocking fragment, not a full grid", () => {
    const shapes = glyphShapes("rush");
    // Four across plus three down, sharing one crossing square.
    expect(shapes).toHaveLength(7);
  });
});

describe("reveal cascade", () => {
  it("staggers a row left to right at full motion", () => {
    const t = revealTiming(false);
    expect(t.staggerMs).toBe(STAGGER_MS);
    expect(t.flipMs).toBe(FLIP_MS);
    expect(t.delayFor(0)).toBe(0);
    expect(t.delayFor(3)).toBe(3 * STAGGER_MS);
    // A six letter row lands in about a second.
    expect(t.rowMs(6)).toBe(5 * STAGGER_MS + FLIP_MS);
  });

  it("applies no stagger at all when motion is reduced", () => {
    const t = revealTiming(true);
    expect(t.staggerMs).toBe(0);
    expect(t.delayFor(0)).toBe(0);
    expect(t.delayFor(5)).toBe(0);
    expect(t.flip).toBe(false);
    expect(t.settle).toBe(false);
    // The colour still arrives, as a short fade.
    expect(t.flipMs).toBe(FADE_MS);
    expect(t.rowMs(6)).toBe(FADE_MS);
  });
});
