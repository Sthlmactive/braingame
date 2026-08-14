import { describe, expect, it } from "vitest";
import {
  HIT_TOLERANCE,
  HUB_RADIUS,
  ORBIT_RADIUS,
  WHEEL_CENTRE,
  WHEEL_VIEW,
  extendSelection,
  hitTest,
  isSubmittable,
  letterRadius,
  selectionWord,
  wheelSlots,
} from "@/games/loop/wheel";

describe("wheel geometry", () => {
  it("puts the first letter at the top of the orbit", () => {
    const [first] = wheelSlots(6);
    expect(first!.cx).toBeCloseTo(WHEEL_CENTRE, 5);
    expect(first!.cy).toBeCloseTo(WHEEL_CENTRE - ORBIT_RADIUS, 5);
  });

  it("spaces letters evenly around the orbit", () => {
    for (const n of [4, 5, 6, 7, 8]) {
      const slots = wheelSlots(n);
      expect(slots).toHaveLength(n);
      for (const s of slots) {
        const d = Math.hypot(s.cx - WHEEL_CENTRE, s.cy - WHEEL_CENTRE);
        expect(d).toBeCloseTo(ORBIT_RADIUS, 5);
      }
      // Neighbours are all the same distance apart.
      const gaps = slots.map((s, i) => {
        const next = slots[(i + 1) % n]!;
        return Math.hypot(s.cx - next.cx, s.cy - next.cy);
      });
      for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!, 5);
    }
  });

  it("never draws a letter outside the viewBox", () => {
    for (const n of [4, 5, 6, 7, 8]) {
      const r = letterRadius(n);
      for (const s of wheelSlots(n)) {
        expect(s.cx - r, `n=${n}`).toBeGreaterThanOrEqual(0);
        expect(s.cy - r, `n=${n}`).toBeGreaterThanOrEqual(0);
        expect(s.cx + r, `n=${n}`).toBeLessThanOrEqual(WHEEL_VIEW);
        expect(s.cy + r, `n=${n}`).toBeLessThanOrEqual(WHEEL_VIEW);
      }
    }
  });

  it("never lets neighbouring letters overlap", () => {
    for (const n of [4, 5, 6, 7, 8]) {
      const slots = wheelSlots(n);
      const r = letterRadius(n);
      for (let i = 0; i < n; i++) {
        const next = slots[(i + 1) % n]!;
        const gap = Math.hypot(slots[i]!.cx - next.cx, slots[i]!.cy - next.cy);
        expect(gap, `n=${n}`).toBeGreaterThan(r * 2);
      }
    }
  });

  it("keeps the letters clear of the hub", () => {
    for (const n of [4, 5, 6, 7, 8]) {
      // Letters sit on the orbit; the hub must not swallow them.
      expect(ORBIT_RADIUS - letterRadius(n)).toBeLessThan(HUB_RADIUS);
      expect(ORBIT_RADIUS).toBeGreaterThan(HUB_RADIUS * 0.9);
    }
  });
});

describe("hitTest", () => {
  const n = 6;
  const slots = wheelSlots(n);
  const r = letterRadius(n);

  it("hits a letter at its centre", () => {
    for (const s of slots) {
      expect(hitTest(s.cx, s.cy, slots, r)).toBe(s.index);
    }
  });

  it("hits just inside the tolerance and misses just outside", () => {
    const s = slots[0]!;
    const inside = r * HIT_TOLERANCE - 0.5;
    const outside = r * HIT_TOLERANCE + 0.5;
    expect(hitTest(s.cx + inside, s.cy, slots, r)).toBe(0);
    expect(hitTest(s.cx + outside, s.cy, slots, r)).toBeNull();
  });

  it("returns null in the middle of the hub", () => {
    expect(hitTest(WHEEL_CENTRE, WHEEL_CENTRE, slots, r)).toBeNull();
  });

  it("returns null outside the wheel entirely", () => {
    expect(hitTest(5, 5, slots, r)).toBeNull();
  });

  it("picks the nearest when two are in range", () => {
    const a = slots[0]!;
    const b = slots[1]!;
    // A point on the line between them, biased towards a.
    const x = a.cx + (b.cx - a.cx) * 0.3;
    const y = a.cy + (b.cy - a.cy) * 0.3;
    expect(hitTest(x, y, slots, r * 3)).toBe(0);
  });

  it("works for every wheel size the game uses", () => {
    for (const size of [4, 5, 6, 7, 8]) {
      const s = wheelSlots(size);
      const rad = letterRadius(size);
      for (const slot of s) {
        expect(hitTest(slot.cx, slot.cy, s, rad), `n=${size}`).toBe(slot.index);
      }
    }
  });
});

describe("extendSelection", () => {
  it("appends a new letter", () => {
    expect(extendSelection([], 2)).toEqual([2]);
    expect(extendSelection([2], 5)).toEqual([2, 5]);
  });

  it("ignores a null hit", () => {
    expect(extendSelection([1, 2], null)).toEqual([1, 2]);
  });

  it("ignores the letter already under the pointer", () => {
    expect(extendSelection([1, 2], 2)).toEqual([1, 2]);
  });

  it("backtracks when the pointer returns to the previous letter", () => {
    expect(extendSelection([1, 2, 3], 2)).toEqual([1, 2]);
    expect(extendSelection([1, 2], 1)).toEqual([1]);
  });

  it("backtracks repeatedly, all the way to one letter", () => {
    let sel = [4, 1, 7, 3];
    sel = extendSelection(sel, 7);
    expect(sel).toEqual([4, 1, 7]);
    sel = extendSelection(sel, 1);
    expect(sel).toEqual([4, 1]);
    sel = extendSelection(sel, 4);
    expect(sel).toEqual([4]);
  });

  it("does not backtrack past the first letter", () => {
    expect(extendSelection([4], 4)).toEqual([4]);
  });

  it("re-extends after a backtrack", () => {
    let sel = extendSelection([1, 2, 3], 2); // [1,2]
    sel = extendSelection(sel, 5);
    expect(sel).toEqual([1, 2, 5]);
  });

  it("never uses a letter twice", () => {
    // 1 is in the selection but is not the one before last, so it is ignored.
    expect(extendSelection([1, 2, 3], 1)).toEqual([1, 2, 3]);
    const sel = extendSelection([1, 2, 3], 1);
    expect(new Set(sel).size).toBe(sel.length);
  });

  it("does not mutate the selection it was given", () => {
    const original = [1, 2, 3];
    const copy = [...original];
    extendSelection(original, 4);
    extendSelection(original, 2);
    expect(original).toEqual(copy);
  });
});

describe("selectionWord", () => {
  it("spells the selection in order", () => {
    expect(selectionWord([2, 0, 1], ["a", "b", "c"])).toBe("cab");
  });

  it("is empty for an empty selection", () => {
    expect(selectionWord([], ["a"])).toBe("");
  });
});

describe("isSubmittable", () => {
  it("needs three letters", () => {
    expect(isSubmittable([])).toBe(false);
    expect(isSubmittable([1])).toBe(false);
    expect(isSubmittable([1, 2])).toBe(false);
    expect(isSubmittable([1, 2, 3])).toBe(true);
  });
});
