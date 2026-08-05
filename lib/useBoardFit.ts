"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The boards only ever render on the client, but a static export prerenders
// the tree, and useLayoutEffect warns if it is ever reached on the server.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Size a board's tiles from the space actually available, in both directions.
 *
 * Picking a tile size from the width alone is not enough: Five at level 1 is
 * only four columns wide but eight rows tall, and a width-derived tile would
 * run off the bottom of an iPhone SE. Measuring also means a Pro Max gets
 * bigger tiles rather than the same ones with more empty space.
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
      const w = el.clientWidth - reserveWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const byWidth = (w - (cols - 1) * gap) / cols;
      const byHeight = (h - (rows - 1) * gap) / rows;
      setPx(Math.max(min, Math.floor(Math.min(max, byWidth, byHeight))));
    };

    measure();
    // The viewport changes on rotation and when the iOS toolbars slide away.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols, rows, gap, max, min, reserveWidth]);

  return [ref, px];
}
