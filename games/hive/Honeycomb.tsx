"use client";

import { useState } from "react";

/**
 * The hive, as one SVG.
 *
 * Every cell lives in a single coordinate system, so the flower cannot drift
 * the way seven absolutely positioned divs did, and the whole thing scales
 * with its container instead of being pinned to pixel offsets.
 */

export const VIEW_W = 300;
export const VIEW_H = 289;

/** Circumradius of a cell. Drawn slightly smaller to leave the gap. */
const R = 50;
const DRAW_R = 47;

interface Slot {
  cx: number;
  cy: number;
}

/** Centre first, then the six around it. */
const CENTRE: Slot = { cx: 150, cy: 144.5 };

const OUTER: Slot[] = [
  { cx: 106.7, cy: 69.5 }, // NW
  { cx: 193.3, cy: 69.5 }, // NE
  { cx: 236.6, cy: 144.5 }, // E
  { cx: 193.3, cy: 219.5 }, // SE
  { cx: 106.7, cy: 219.5 }, // SW
  { cx: 63.4, cy: 144.5 }, // W
];

/**
 * A pointy top hexagon around (cx, cy). Derived rather than hardcoded so the
 * radius is the only thing to change.
 */
export function hexPoints(cx: number, cy: number, r: number): string {
  const dx = r * 0.866;
  const corners: Array<[number, number]> = [
    [cx, cy - r],
    [cx + dx, cy - r / 2],
    [cx + dx, cy + r / 2],
    [cx, cy + r],
    [cx - dx, cy + r / 2],
    [cx - dx, cy - r / 2],
  ];
  return corners.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function Honeycomb({
  centre,
  outer,
  onTap,
  disabled = false,
}: {
  centre: string;
  /** Exactly six letters, in ring order. */
  outer: string[];
  onTap: (letter: string) => void;
  disabled?: boolean;
}) {
  const [pressed, setPressed] = useState<string | null>(null);

  const cells: Array<{ key: string; slot: Slot; letter: string; isCentre: boolean }> =
    [
      { key: "centre", slot: CENTRE, letter: centre, isCentre: true },
      ...outer.map((letter, i) => ({
        key: `outer-${i}`,
        slot: OUTER[i] ?? CENTRE,
        letter,
        isCentre: false,
      })),
    ];

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-auto max-h-full w-full max-w-[300px]"
      role="group"
      aria-label={cells.map((c) => c.letter).join(" ")}
    >
      {cells.map(({ key, slot, letter, isCentre }) => (
        <g
          key={key}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={letter}
          aria-disabled={disabled || undefined}
          style={{
            cursor: disabled ? "default" : "pointer",
            // fill-box scales each cell about its own centre, so a press never
            // shifts a hex out of the flower.
            transformBox: "fill-box",
            transformOrigin: "center",
            transform: pressed === key ? "scale(0.94)" : "none",
            transition: "transform var(--dur-press) var(--ease-soft)",
            outline: "none",
          }}
          onPointerDown={() => !disabled && setPressed(key)}
          onPointerUp={() => setPressed(null)}
          onPointerCancel={() => setPressed(null)}
          onPointerLeave={() => setPressed(null)}
          onClick={() => !disabled && onTap(letter)}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onTap(letter);
            }
          }}
        >
          <polygon
            points={hexPoints(slot.cx, slot.cy, DRAW_R)}
            fill={isCentre ? "var(--accent)" : "var(--surface)"}
          />
          <text
            x={slot.cx}
            // Uppercase glyphs sit low in the em box, so lift them a couple
            // of units to look centred rather than measure centred.
            y={slot.cy - 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill={isCentre ? "var(--on-state)" : "var(--text)"}
            style={{
              fontFamily: "var(--font-ui)",
              fontWeight: 700,
              fontSize: 34,
              textTransform: "uppercase",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {letter.toUpperCase()}
          </text>
        </g>
      ))}
    </svg>
  );
}

export { R as HEX_RADIUS, OUTER as OUTER_SLOTS, CENTRE as CENTRE_SLOT };
