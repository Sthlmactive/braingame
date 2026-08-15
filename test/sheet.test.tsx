// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/components/AppProvider";
import { Sheet } from "@/components/Sheet";

/**
 * The sheet's lifecycle, mounted.
 *
 * One regression above all others is worth a test here: the sheet used to be
 * `if (!open) return null`, so closing it removed it from the document in the
 * same frame. There is no way to see that from a pure test and no way to see
 * it from a type — the component still rendered, it just teleported. So the
 * assertions below are mostly about *when* the dialog stops existing.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const HEIGHT = 400;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function dialog(): HTMLElement | null {
  return document.querySelector("[role=dialog]");
}

function grip(): HTMLElement {
  const el = document.querySelector("[data-sheet-grip]");
  if (!el) throw new Error("no grip");
  return el as HTMLElement;
}

/** Translation in px below the resting position, read off the inline style. */
function offset(): number {
  const t = dialog()?.style.transform ?? "";
  const m = /translate3d\(0(?:px)?, ([-\d.]+)px, 0\)/.exec(t);
  if (!m) throw new Error(`unexpected transform: ${t}`);
  return Number(m[1]);
}

function render(props: { open: boolean; onClose?: () => void }): void {
  act(() => {
    root!.render(
      <AppProvider>
        <Sheet open={props.open} onClose={props.onClose} title="Test">
          <p>body</p>
        </Sheet>
      </AppProvider>,
    );
  });
}

/** Run the spring for `frames` animation frames. */
function frames(n: number): void {
  for (let i = 0; i < n; i++) {
    act(() => {
      vi.advanceTimersByTime(16);
    });
  }
}

function drag(from: number, to: number): void {
  const el = grip();
  act(() => {
    el.dispatchEvent(
      new window.PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        clientY: from,
      }),
    );
    el.dispatchEvent(
      new window.PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientY: to,
      }),
    );
    el.dispatchEvent(
      new window.PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientY: to,
      }),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom lays nothing out, and the sheet's whole geometry is its height.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return this.getAttribute("role") === "dialog" ? HEIGHT : 0;
    },
  });
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

describe("the sheet", () => {
  it("renders nothing when closed", () => {
    render({ open: false });
    expect(dialog()).toBeNull();
  });

  it("arrives from the bottom edge rather than appearing at rest", () => {
    render({ open: true });
    // Parked off screen on the very first paint.
    expect(dialog()).not.toBeNull();
    frames(1);
    const first = offset();
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(HEIGHT);
    frames(60);
    expect(offset()).toBe(0);
  });

  it("stays in the document while it leaves, and leaves the way it came", () => {
    const onClose = vi.fn();
    render({ open: true, onClose });
    frames(60);

    render({ open: false, onClose });
    // The regression: it must still be here, on its way down.
    expect(dialog()).not.toBeNull();
    frames(3);
    expect(offset()).toBeGreaterThan(0);

    frames(90);
    expect(dialog()).toBeNull();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render({ open: true, onClose });
    frames(60);
    act(() => {
      window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close on Escape when it is not dismissable", () => {
    const onClose = vi.fn();
    act(() => {
      root!.render(
        <AppProvider>
          <Sheet open onClose={onClose} title="Test" dismissable={false}>
            <p>body</p>
          </Sheet>
        </AppProvider>,
      );
    });
    frames(60);
    act(() => {
      window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("tracks the finger one to one on the way down", () => {
    render({ open: true, onClose: vi.fn() });
    frames(60);
    const el = grip();
    act(() => {
      el.dispatchEvent(
        new window.PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 1,
          clientY: 100,
        }),
      );
      el.dispatchEvent(
        new window.PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientY: 170,
        }),
      );
    });
    expect(offset()).toBeCloseTo(70, 5);
  });

  it("resists being dragged upward instead of tracking it", () => {
    render({ open: true, onClose: vi.fn() });
    frames(60);
    const el = grip();
    act(() => {
      el.dispatchEvent(
        new window.PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 1,
          clientY: 100,
        }),
      );
      el.dispatchEvent(
        new window.PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientY: 20,
        }),
      );
    });
    const y = offset();
    // It moved, but nowhere near the 80px the finger did.
    expect(y).toBeLessThan(0);
    expect(y).toBeGreaterThan(-80);
  });

  it("dismisses when dragged past a third of its height", () => {
    const onClose = vi.fn();
    render({ open: true, onClose });
    frames(60);
    drag(100, 100 + HEIGHT * 0.5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("springs back when the drag was not far enough", () => {
    const onClose = vi.fn();
    render({ open: true, onClose });
    frames(60);
    drag(100, 130);
    expect(onClose).not.toHaveBeenCalled();
    frames(60);
    expect(offset()).toBe(0);
  });
});
