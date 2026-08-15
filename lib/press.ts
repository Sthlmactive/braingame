/**
 * Press feedback, for every control at once.
 *
 * A control that does not move under the finger does not feel like a control.
 * Before this, `.tap` only set a 44px hit target: the board tiles and the
 * keyboard keys had their own pointer handlers and dipped when pressed, and
 * every other button in the app — sheet actions, back chevrons, difficulty
 * rows, the clue bar — was inert until it navigated.
 *
 * This is one delegated listener rather than a hook wired into forty call
 * sites, for two reasons. It cannot be forgotten on the forty-first, and it
 * uses pointer events, which fire the same way on touch and mouse; CSS
 * `:active` is the obvious alternative and is unreliable on iOS Safari for
 * anything that is not a link.
 *
 * The visual is in globals.css, keyed off `data-pressed`. This file only
 * decides when a control is being pressed.
 */

/** Controls that respond to a press. `.tap` also sets the 44px hit target. */
const SELECTOR = ".tap, .press";

/**
 * How far the finger may stray outside the control before the press is
 * abandoned. Matching the platform: sliding off a button and letting go there
 * does not fire it, and the button should stop looking pressed on the way out
 * rather than at the end.
 */
const SLOP = 12;

function isDisabled(el: Element): boolean {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute("aria-disabled") === "true"
  );
}

/**
 * Start watching for presses. Returns a cleanup function.
 *
 * Installed once, from AppProvider.
 */
export function installPressFeedback(doc: Document = document): () => void {
  let active: HTMLElement | null = null;
  let pointerId: number | null = null;

  const release = (): void => {
    if (active) delete active.dataset.pressed;
    active = null;
    pointerId = null;
  };

  const onDown = (e: PointerEvent): void => {
    // Secondary buttons open menus rather than pressing things.
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const target = e.target as Element | null;
    const el = target?.closest?.(SELECTOR) as HTMLElement | null;
    if (!el || isDisabled(el)) return;
    release();
    active = el;
    pointerId = e.pointerId;
    el.dataset.pressed = "true";
  };

  const onMove = (e: PointerEvent): void => {
    if (!active || e.pointerId !== pointerId) return;
    const r = active.getBoundingClientRect();
    const outside =
      e.clientX < r.left - SLOP ||
      e.clientX > r.right + SLOP ||
      e.clientY < r.top - SLOP ||
      e.clientY > r.bottom + SLOP;
    if (outside) release();
  };

  const onUp = (e: PointerEvent): void => {
    if (pointerId !== null && e.pointerId !== pointerId) return;
    release();
  };

  // `pointercancel` is the one that matters on touch: it fires the moment a
  // press turns into a scroll, and without it the control stays dented while
  // the page moves away underneath it.
  doc.addEventListener("pointerdown", onDown, true);
  doc.addEventListener("pointermove", onMove, true);
  doc.addEventListener("pointerup", onUp, true);
  doc.addEventListener("pointercancel", onUp, true);
  doc.defaultView?.addEventListener("blur", release);

  return () => {
    doc.removeEventListener("pointerdown", onDown, true);
    doc.removeEventListener("pointermove", onMove, true);
    doc.removeEventListener("pointerup", onUp, true);
    doc.removeEventListener("pointercancel", onUp, true);
    doc.defaultView?.removeEventListener("blur", release);
    release();
  };
}
