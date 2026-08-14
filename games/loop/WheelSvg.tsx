"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  HUB_RADIUS,
  WHEEL_CENTRE,
  WHEEL_VIEW,
  extendSelection,
  hitTest,
  letterRadius,
  wheelSlots,
  type WheelSlot,
} from "./wheel";

export type TrailFeedback = "shake" | "pulse" | "flash" | null;

export interface WheelLetter {
  id: number;
  letter: string;
}

/** Convert a client point into the svg's own user space. */
export function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** Convert a point in the svg's user space into client coordinates. */
export function svgToClient(
  svg: SVGSVGElement,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(x, y).matrixTransform(ctm);
  return { x: p.x, y: p.y };
}

/**
 * Where each letter currently sits. `slotOf[id]` is the ring position a letter
 * has been shuffled into, which is what lets a shuffle glide the letters to
 * new places instead of swapping their contents.
 */
export function slotsForLetters(
  letters: readonly WheelLetter[],
  slotOf: readonly number[],
): WheelSlot[] {
  const ring = wheelSlots(letters.length);
  return letters.map((l) => {
    const slot = ring[slotOf[l.id] ?? l.id] ?? ring[0]!;
    return { index: l.id, cx: slot.cx, cy: slot.cy };
  });
}

export function WheelSvg({
  svgRef,
  letters,
  slotOf,
  selected,
  onSelectionChange,
  onRelease,
  feedback,
  trail,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  letters: WheelLetter[];
  slotOf: number[];
  selected: number[];
  onSelectionChange: (next: number[]) => void;
  /** Called with true when the gesture was a drag, false for a bare tap. */
  onRelease: (wasDrag: boolean) => void;
  feedback: TrailFeedback;
  /** The trail to draw while a feedback animation plays. */
  trail: number[];
}) {
  const n = letters.length;
  const radius = letterRadius(n);
  const positions = slotsForLetters(letters, slotOf);
  const byId = new Map(positions.map((p) => [p.index, p]));

  const dragging = useRef(false);
  const moved = useRef(false);
  const live = useRef<{ x: number; y: number } | null>(null);
  const liveLine = useRef<SVGLineElement | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Dragging must never scroll the page or start an iOS selection. React
  // attaches touch listeners passively, so this one is bound by hand.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, [svgRef]);

  const pointAt = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    return clientToSvg(svg, clientX, clientY);
  };

  const finish = () => {
    if (!dragging.current) return;
    dragging.current = false;
    live.current = null;
    if (liveLine.current) liveLine.current.setAttribute("visibility", "hidden");
    onRelease(moved.current);
  };

  const drawLive = () => {
    const line = liveLine.current;
    if (!line) return;
    const sel = selectedRef.current;
    const last = sel.length > 0 ? byId.get(sel[sel.length - 1]!) : undefined;
    if (!last || !live.current || !dragging.current) {
      line.setAttribute("visibility", "hidden");
      return;
    }
    line.setAttribute("x1", String(last.cx));
    line.setAttribute("y1", String(last.cy));
    line.setAttribute("x2", String(live.current.x));
    line.setAttribute("y2", String(live.current.y));
    line.setAttribute("visibility", "visible");
  };

  const trailPoints = (ids: number[]) =>
    ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((p) => `${p!.cx},${p!.cy}`)
      .join(" ");

  const shownTrail = feedback ? trail : selected;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WHEEL_VIEW} ${WHEEL_VIEW}`}
      preserveAspectRatio="xMidYMid meet"
      className="mx-auto block h-auto w-full max-w-[300px] select-none"
      style={{
        touchAction: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
      }}
      role="group"
      onPointerDown={(e) => {
        const p = pointAt(e.clientX, e.clientY);
        if (!p) return;
        // Capture on the root, not the circles. Once the pointer is captured,
        // enter and over never fire on children, so every hit is worked out
        // by distance instead.
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        moved.current = false;
        live.current = p;

        const hit = hitTest(p.x, p.y, positions, radius);
        if (hit === null) return;
        const sel = selectedRef.current;
        // Tapping the last selected letter again submits, which is the
        // keyboard-free way to play without dragging.
        if (sel.length > 0 && sel[sel.length - 1] === hit) {
          dragging.current = false;
          onRelease(true);
          return;
        }
        onSelectionChange(extendSelection(sel, hit));
        drawLive();
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const p = pointAt(e.clientX, e.clientY);
        if (!p) return;
        live.current = p;
        const hit = hitTest(p.x, p.y, positions, radius);
        const next = extendSelection(selectedRef.current, hit);
        if (next !== selectedRef.current && next.length !== selectedRef.current.length) {
          moved.current = true;
          onSelectionChange(next);
        }
        drawLive();
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={finish}
    >
      <circle
        cx={WHEEL_CENTRE}
        cy={WHEEL_CENTRE}
        r={HUB_RADIUS}
        fill="var(--surface)"
      />

      {/* The trail sits under the letters, so a letter is never obscured. */}
      <g
        className={
          feedback === "shake"
            ? "trail-shake"
            : feedback === "pulse"
              ? "trail-pulse"
              : feedback === "flash"
                ? "trail-flash"
                : undefined
        }
        style={{ pointerEvents: "none" }}
      >
        {shownTrail.length > 1 ? (
          <polyline
            points={trailPoints(shownTrail)}
            fill="none"
            stroke={feedback === "pulse" ? "var(--muted)" : "var(--accent)"}
            strokeOpacity={0.6}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        <line
          ref={liveLine}
          visibility="hidden"
          stroke="var(--accent)"
          strokeOpacity={0.6}
          strokeWidth={6}
          strokeLinecap="round"
        />
      </g>

      {letters.map((l) => {
        const pos = byId.get(l.id)!;
        const on = shownTrail.includes(l.id);
        return (
          <g
            key={l.id}
            // Translating the group, rather than animating cx and cy, is what
            // makes a shuffle glide reliably in Safari.
            transform={`translate(${pos.cx} ${pos.cy})`}
            style={{
              transition: "transform 200ms var(--ease-soft)",
              pointerEvents: "none",
            }}
          >
            <circle
              r={radius}
              fill={on ? "var(--accent)" : "var(--on-state)"}
              stroke={on ? "var(--accent)" : "var(--line)"}
              strokeWidth={2}
            />
            <text
              x={0}
              // Uppercase glyphs sit low in the em box, so lift them slightly.
              y={-2}
              textAnchor="middle"
              dominantBaseline="central"
              fill={on ? "var(--on-state)" : "var(--text)"}
              style={{
                fontFamily: "var(--font-ui)",
                fontWeight: 700,
                fontSize: Math.round(radius * 1.05),
              }}
            >
              {l.letter.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
