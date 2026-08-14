import type { GameId } from "@/lib/games";

/**
 * A miniature of each game's actual board, so the home screen says what you are
 * walking into. Monochrome in `--line`: a glyph is navigation, and colour only
 * ever means game state.
 *
 * Getting the shape right matters more than getting it pretty. Hive is a
 * flower, not a diagonal; Rush is an interlocking fragment, not a full grid.
 */

export const GLYPH_SIZE = 34;

/** A primitive in the 34x34 glyph box. */
export type GlyphShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; heavy?: boolean }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "hex"; cx: number; cy: number; r: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; heavy?: boolean };

const S = GLYPH_SIZE;

/** Five: one row of five squares, the board in miniature. */
function five(): GlyphShape[] {
  const w = 5.6;
  const gap = 1.4;
  const total = 5 * w + 4 * gap;
  const x0 = (S - total) / 2;
  return Array.from({ length: 5 }, (_, i) => ({
    kind: "rect" as const,
    x: x0 + i * (w + gap),
    y: (S - w) / 2,
    w,
    h: w,
  }));
}

/** Hive: seven hexes in a flower, one centre and six around it. */
function hive(): GlyphShape[] {
  const r = 5;
  const cx = S / 2;
  const cy = S / 2;
  // Flat-topped neighbours sit at 30, 90, 150, 210, 270, 330 degrees.
  const ring = Array.from({ length: 6 }, (_, i) => {
    const a = ((30 + i * 60) * Math.PI) / 180;
    const d = r * Math.sqrt(3);
    return {
      kind: "hex" as const,
      cx: cx + Math.cos(a) * d,
      cy: cy + Math.sin(a) * d,
      r,
    };
  });
  return [{ kind: "hex", cx, cy, r }, ...ring];
}

/** Grid: a five by five square grid. */
function grid(): GlyphShape[] {
  const n = 5;
  const w = 5;
  const gap = 1.25;
  const total = n * w + (n - 1) * gap;
  const o = (S - total) / 2;
  const out: GlyphShape[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out.push({
        kind: "rect",
        x: o + c * (w + gap),
        y: o + r * (w + gap),
        w,
        h: w,
      });
    }
  }
  return out;
}

/** Loop: six dots evenly spaced on a circle. */
function loop(): GlyphShape[] {
  const cx = S / 2;
  const cy = S / 2;
  const ring = 12;
  return Array.from({ length: 6 }, (_, i) => {
    // Start at the top so the ring reads as a wheel rather than a hexagon.
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return {
      kind: "circle" as const,
      cx: cx + Math.cos(a) * ring,
      cy: cy + Math.sin(a) * ring,
      r: 2.6,
    };
  });
}

/** Ordoku: a four by four grid with the two by two subgrid lines heavier. */
function ordoku(): GlyphShape[] {
  const n = 4;
  const cell = 6.5;
  const total = n * cell;
  const o = (S - total) / 2;
  const out: GlyphShape[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out.push({ kind: "rect", x: o + c * cell, y: o + r * cell, w: cell, h: cell });
    }
  }
  // The subgrid divide, drawn heavier so the sudoku structure reads.
  out.push({
    kind: "line",
    x1: o + 2 * cell,
    y1: o,
    x2: o + 2 * cell,
    y2: o + total,
    heavy: true,
  });
  out.push({
    kind: "line",
    x1: o,
    y1: o + 2 * cell,
    x2: o + total,
    y2: o + 2 * cell,
    heavy: true,
  });
  return out;
}

/** Rush: an interlocking crossword fragment, deliberately not a full grid. */
function rush(): GlyphShape[] {
  const cell = 6.5;
  const o = 4;
  // A four across, crossed by a three down through its second square.
  const across = [0, 1, 2, 3].map((c) => ({
    kind: "rect" as const,
    x: o + c * cell,
    y: o + 1 * cell,
    w: cell,
    h: cell,
  }));
  const down = [0, 2, 3].map((r) => ({
    kind: "rect" as const,
    x: o + 1 * cell,
    y: o + r * cell,
    w: cell,
    h: cell,
  }));
  return [...across, ...down];
}

/** Tiles: the three by three corner of a board. */
function tiles(): GlyphShape[] {
  const n = 3;
  const cell = 8;
  const o = 5;
  const out: GlyphShape[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out.push({ kind: "rect", x: o + c * cell, y: o + r * cell, w: cell, h: cell });
    }
  }
  return out;
}

const BUILDERS: Record<GameId, () => GlyphShape[]> = {
  five,
  hive,
  grid,
  loop,
  ordoku,
  rush,
  tiles,
};

/**
 * The primitives for one game's glyph. Throws on an unknown id rather than
 * rendering an empty box, so a new game cannot ship without a glyph.
 */
export function glyphShapes(game: string): GlyphShape[] {
  const build = BUILDERS[game as GameId];
  if (!build) throw new Error(`BoardGlyph: no glyph for game "${game}"`);
  return build();
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 30) * Math.PI) / 180;
    return `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
  }).join(" ");
}

export function BoardGlyph({
  game,
  size = GLYPH_SIZE,
  className = "",
}: {
  game: string;
  size?: number;
  className?: string;
}) {
  const shapes = glyphShapes(game);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${S} ${S}`}
      className={className}
      fill="none"
      stroke="var(--line)"
      aria-hidden
      focusable="false"
    >
      {shapes.map((s, i) => {
        if (s.kind === "rect") {
          return (
            <rect
              key={i}
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              rx={1}
              strokeWidth={s.heavy ? 1.6 : 1}
            />
          );
        }
        if (s.kind === "circle") {
          return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} strokeWidth={1} />;
        }
        if (s.kind === "hex") {
          return <polygon key={i} points={hexPoints(s.cx, s.cy, s.r)} strokeWidth={1} />;
        }
        return (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            strokeWidth={s.heavy ? 1.6 : 1}
            strokeLinecap="square"
          />
        );
      })}
    </svg>
  );
}
