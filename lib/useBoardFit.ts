"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The boards only ever render on the client, but a static export prerenders
// the tree, and useLayoutEffect warns if it is ever reached on the server.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface FitInput {
  width: number;
  height: number;
  cols: number;
  rows: number;
  gap?: number;
  max?: number;
  min?: number;
  reserveWidth?: number;
}

/**
 * The tile size arithmetic, with no DOM in it, so the geometry can be tested
 * against real phone widths instead of eyeballed on a device.
 *
 * Tile size comes from the column count in the width direction and the row
 * count in the height direction, and the smaller of the two wins. That is what
 * makes a six column board shrink its tiles rather than overflow the screen.
 */
export function fitTile({
  width,
  height,
  cols,
  rows,
  gap = 6,
  max = 58,
  min = 18,
  reserveWidth = 0,
}: FitInput): number {
  const w = width - reserveWidth;
  const byWidth = (w - (cols - 1) * gap) / cols;
  const byHeight = (height - (rows - 1) * gap) / rows;
  return Math.max(min, Math.floor(Math.min(max, byWidth, byHeight)));
}

/** Total width a row of `cols` tiles occupies at a given tile size. */
export function rowWidth(tilePx: number, cols: number, gap = 6): number {
  return cols * tilePx + (cols - 1) * gap;
}

/**
 * Size a board's tiles from the space actually available, in both directions.
 *
 * Picking a tile size from the width alone is not enough: Five's Svår board is
 * six columns wide and six rows tall, and a width-derived tile would run off
 * the bottom of an iPhone SE. Measuring also means a Pro Max gets bigger tiles
 * rather than the same ones with more empty space.
 */
export function useBoardFit(
  cols: number,
  rows: number,
  {
    gap = 6,
    max = 58,
    min = 18,
    /** Width taken by something beside the board, e.g. Grid's hint column. */
    reserveWidth = 0,
  }: { gap?: number; max?: number; min?: number; reserveWidth?: number } = {},
): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [px, setPx] = useState(min);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width - reserveWidth <= 0 || height <= 0) return;
      setPx(fitTile({ width, height, cols, rows, gap, max, min, reserveWidth }));
    };

    measure();
    // The viewport changes on rotation and when the iOS toolbars slide away.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols, rows, gap, max, min, reserveWidth]);

  return [ref, px];
}
