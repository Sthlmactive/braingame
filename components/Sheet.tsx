"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  driveSpring,
  projectMomentum,
  rubberBand,
  Spring,
  SPRING_SHEET,
} from "@/lib/spring";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * A bottom sheet. Used by settings, results, rules and confirmations.
 *
 * The sheet used to slide in on a CSS keyframe and then vanish — `if (!open)
 * return null` — which meant it arrived from somewhere and left from nowhere.
 * A thing that appears from the bottom edge has told you where it lives; it
 * has to go back there, or the second time you open it you have no idea where
 * it came from.
 *
 * It is sprung rather than timed because it can be grabbed. A duration has
 * nowhere to put a velocity: flick the sheet down hard and a 220ms animation
 * will still take 220ms, which feels like the sheet ignoring you. The spring
 * takes the finger's speed as its own and carries it out.
 *
 * The drag handle is the header — the grip and the title. Deliberately not the
 * whole panel: a sheet whose body drags would fight its own buttons.
 */

/** Past this fraction of the sheet's height, letting go dismisses. */
const DISMISS_FRACTION = 0.3;
/** …as does a flick faster than this, however short. */
const DISMISS_VELOCITY = 550;
/** Velocity samples older than this are stale by the time the finger lifts. */
const VELOCITY_WINDOW_MS = 100;

export function Sheet({
  open,
  onClose,
  title,
  children,
  dismissable = true,
}: {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
  dismissable?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  // Stays true through the exit, which is the entire point of it existing.
  const [rendered, setRendered] = useState(open);

  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const spring = useRef<Spring | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const height = useRef(0);
  const drag = useRef<{
    pointerId: number;
    startY: number;
    startOffset: number;
    lastY: number;
    lastT: number;
    velocity: number;
  } | null>(null);

  /** Offset in px below the resting position. 0 is fully open. */
  const paint = useCallback((y: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transform = `translate3d(0, ${y}px, 0)`;
    const scrim = scrimRef.current;
    if (scrim && height.current > 0) {
      scrim.style.opacity = String(Math.max(0, 1 - y / height.current));
    }
  }, []);

  const stopDriver = useCallback(() => {
    cancel.current?.();
    cancel.current = null;
  }, []);

  const springTo = useCallback(
    (target: number, onRest?: () => void) => {
      stopDriver();
      const s = spring.current;
      if (!s) return;
      s.setTarget(target);
      if (reduceMotion) {
        // No travel, but the same end state: the sheet is simply there, or
        // simply gone. A 0.01ms slide is still a slide.
        s.handoff(target, 0);
        paint(target);
        onRest?.();
        return;
      }
      cancel.current = driveSpring(s, paint, () => {
        cancel.current = null;
        onRest?.();
      });
    },
    [paint, reduceMotion, stopDriver],
  );

  // Opening mounts the panel. Closing does not unmount it — the effect below
  // does that, once the exit has actually finished travelling.
  useEffect(() => {
    if (open) setRendered(true);
  }, [open]);

  // Fly in, or fly out and unmount. The panel is rendered already parked off
  // screen by its inline transform, so there is no frame where it sits visible
  // at rest before the spring takes over.
  useEffect(() => {
    if (!rendered) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (open) height.current = panel.offsetHeight;
    if (!spring.current) {
      spring.current = new Spring(height.current, SPRING_SHEET);
    }
    if (open) springTo(0);
    else springTo(height.current, () => setRendered(false));
    return stopDriver;
  }, [rendered, open, springTo, stopDriver]);

  useEffect(() => {
    if (!open || !dismissable || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissable, onClose]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dismissable || !onClose || !spring.current) return;
    // Interruptible: take the sheet wherever the spring had got to, with
    // whatever speed it had, rather than snapping it to a resting position.
    stopDriver();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startOffset: spring.current.value,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) {
      const instant = ((e.clientY - d.lastY) / dt) * 1000;
      // Smoothed, so one jittery sample cannot decide a dismissal.
      d.velocity = dt > VELOCITY_WINDOW_MS ? instant : d.velocity * 0.7 + instant * 0.3;
      d.lastY = e.clientY;
      d.lastT = e.timeStamp;
    }
    const raw = d.startOffset + (e.clientY - d.startY);
    // 1:1 downward; upward the sheet resists, because there is nothing above
    // the open position to go to.
    const y = raw >= 0 ? raw : rubberBand(raw, height.current);
    spring.current?.handoff(y, d.velocity);
    paint(y);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    const s = spring.current;
    if (!s) return;
    const projected = s.value + projectMomentum(d.velocity);
    const dismiss =
      d.velocity > DISMISS_VELOCITY ||
      projected > height.current * DISMISS_FRACTION;
    if (dismiss) {
      // onClose flips `open`, and the close effect springs on from here with
      // the flick's velocity already in the spring.
      onClose?.();
    } else {
      springTo(0);
    }
  };

  if (!rendered) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      // On the way out it is scenery: taps go to the screen underneath, which
      // is where the eye already is.
      style={{ pointerEvents: open ? undefined : "none" }}
    >
      <div
        ref={scrimRef}
        className="absolute inset-0"
        style={{ background: "var(--scrim)", opacity: 0 }}
        onClick={dismissable ? onClose : undefined}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        className="relative w-full max-w-[560px]"
        style={{
          // Parked off screen until the spring has measured the panel.
          transform: "translate3d(0, 100%, 0)",
          background: "var(--material-sheet)",
          backdropFilter: "blur(var(--material-blur))",
          WebkitBackdropFilter: "blur(var(--material-blur))",
          borderTopLeftRadius: "var(--radius-sheet)",
          borderTopRightRadius: "var(--radius-sheet)",
          borderTop: "1px solid var(--line)",
          paddingBottom: "max(var(--safe-b), 16px)",
          paddingLeft: "max(var(--safe-l), 20px)",
          paddingRight: "max(var(--safe-r), 20px)",
        }}
      >
        <div
          data-sheet-grip
          onPointerDown={dismissable ? onPointerDown : undefined}
          onPointerMove={dismissable ? onPointerMove : undefined}
          onPointerUp={dismissable ? endDrag : undefined}
          onPointerCancel={dismissable ? endDrag : undefined}
          style={{ touchAction: dismissable ? "none" : undefined }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <span
              className="block h-1 w-9 rounded-full"
              style={{ background: "var(--line)" }}
            />
          </div>
          {title ? (
            <h2 className="t-title pt-2 pb-3">{title}</h2>
          ) : (
            <div className="pt-1" />
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** The standard full width action used inside sheets. */
export function SheetButton({
  children,
  onClick,
  variant = "quiet",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "loud" | "quiet" | "danger";
  disabled?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    // Ink on paper, not the accent. `--accent` resolves to `--ink` on every
    // screen outside the six games that still set one, and `--on-state` is a
    // fixed dark — so a loud button was black text on a black fill in light
    // mode. It shipped that way on Mini's rules sheet and Five's.
    loud: { background: "var(--ink)", color: "var(--paper)" },
    quiet: {
      background: "transparent",
      color: "var(--ink)",
      border: "1px solid var(--line)",
    },
    danger: {
      background: "transparent",
      color: "var(--danger)",
      border: "1px solid var(--danger)",
    },
  };
  return (
    <button
      type="button"
      className="t-row tap w-full px-4 py-3 text-center disabled:opacity-40"
      style={{ ...styles[variant], borderRadius: "var(--radius-card)" }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
