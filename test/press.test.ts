// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installPressFeedback } from "@/lib/press";

/**
 * Press feedback, exercised through real pointer events.
 *
 * The behaviour worth protecting is not "the attribute gets set" — it is
 * everything that has to clear it. A control left looking pressed after the
 * finger has gone is worse than no feedback at all, and every one of those
 * cases is a different event: lifting, sliding off, the browser turning the
 * press into a scroll, the window losing focus.
 */

let uninstall: (() => void) | null = null;

/** jsdom has no layout, so every rect is zero unless one is supplied. */
function withRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 100, bottom: 44, ...rect }) as DOMRect;
}

function button(className = "tap"): HTMLButtonElement {
  const el = document.createElement("button");
  el.className = className;
  withRect(el, {});
  document.body.appendChild(el);
  return el;
}

function pointer(
  el: EventTarget,
  type: string,
  init: PointerEventInit = {},
): void {
  el.dispatchEvent(
    new window.PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      button: 0,
      ...init,
    }),
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
  uninstall = installPressFeedback(document);
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
});

describe("press feedback", () => {
  it("marks a .tap control while the pointer is down", () => {
    const el = button();
    pointer(el, "pointerdown", { clientX: 10, clientY: 10 });
    expect(el.dataset.pressed).toBe("true");
    pointer(el, "pointerup", { clientX: 10, clientY: 10 });
    expect(el.dataset.pressed).toBeUndefined();
  });

  it("marks a .press control too", () => {
    const el = button("press");
    pointer(el, "pointerdown", { clientX: 10, clientY: 10 });
    expect(el.dataset.pressed).toBe("true");
  });

  it("marks the control when the press lands on something inside it", () => {
    const el = button();
    const label = document.createElement("span");
    el.appendChild(label);
    pointer(label, "pointerdown", { clientX: 10, clientY: 10 });
    expect(el.dataset.pressed).toBe("true");
  });

  it("ignores a disabled control", () => {
    const el = button();
    el.disabled = true;
    pointer(el, "pointerdown", { clientX: 10, clientY: 10 });
    expect(el.dataset.pressed).toBeUndefined();
  });

  it("ignores an aria-disabled control", () => {
    const el = button();
    el.setAttribute("aria-disabled", "true");
    pointer(el, "pointerdown", { clientX: 10, clientY: 10 });
    expect(el.dataset.pressed).toBeUndefined();
  });

  it("releases when a press turns into a scroll", () => {
    const el = button();
    pointer(el, "pointerdown", { clientX: 10, clientY: 10 });
    pointer(el, "pointercancel", { clientX: 10, clientY: 10 });
    expect(el.dataset.pressed).toBeUndefined();
  });

  it("releases when the finger slides off the control", () => {
    const el = button();
    pointer(el, "pointerdown", { clientX: 10, clientY: 10 });
    // Still within the slop, so still pressed.
    pointer(document, "pointermove", { clientX: 10, clientY: 50 });
    expect(el.dataset.pressed).toBe("true");
    pointer(document, "pointermove", { clientX: 10, clientY: 200 });
    expect(el.dataset.pressed).toBeUndefined();
  });

  it("releases when the window loses focus mid press", () => {
    const el = button();
    pointer(el, "pointerdown", { clientX: 10, clientY: 10 });
    window.dispatchEvent(new Event("blur"));
    expect(el.dataset.pressed).toBeUndefined();
  });

  it("never leaves two controls pressed at once", () => {
    const a = button();
    const b = button();
    pointer(a, "pointerdown", { clientX: 10, clientY: 10 });
    pointer(b, "pointerdown", { clientX: 10, clientY: 10, pointerId: 2 });
    expect(a.dataset.pressed).toBeUndefined();
    expect(b.dataset.pressed).toBe("true");
  });

  it("ignores a right click", () => {
    const el = button();
    pointer(el, "pointerdown", {
      clientX: 10,
      clientY: 10,
      button: 2,
      pointerType: "mouse",
    });
    expect(el.dataset.pressed).toBeUndefined();
  });

  it("does nothing to a plain element", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    pointer(el, "pointerdown", { clientX: 10, clientY: 10 });
    expect(el.dataset.pressed).toBeUndefined();
  });

  it("stops listening once uninstalled", () => {
    const el = button();
    uninstall?.();
    uninstall = null;
    pointer(el, "pointerdown", { clientX: 10, clientY: 10 });
    expect(el.dataset.pressed).toBeUndefined();
  });
});
