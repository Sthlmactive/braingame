"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Mini's clock.
 *
 * Its own hook rather than three `useState`s inside the board, because the
 * rules are fiddly enough to be worth testing on their own: it starts on the
 * first keystroke rather than on mount, it pauses while the tab is hidden, and
 * it must not catch up when the tab comes back.
 *
 * **It counts ticks it was present for; it never diffs wall time.** That is
 * what makes the resume behaviour correct by construction rather than by
 * arithmetic — there is no elapsed-time subtraction to get wrong.
 *
 * Two rules the implementation exists to obey:
 *
 * 1. The `setSeconds` updater is pure. Notifying the parent from inside it ran
 *    the callback during React's render phase, updating the parent while this
 *    component was rendering — "Cannot update a component while rendering a
 *    different component". The notification belongs in an effect, which runs
 *    after commit.
 * 2. `onTick` lives in a ref, so a parent that passes a new callback identity
 *    on every render does not tear down and restart the interval. Restarting
 *    it would drop the fraction of a second already elapsed, every time.
 */
export interface SolveClock {
  seconds: number;
  /** Called on the first keystroke. Idempotent. */
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSolveClock(onTick: (seconds: number) => void): SolveClock {
  const [seconds, setSeconds] = useState(0);
  const running = useRef(false);

  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  // Mounted once. No dependency on onTick, so the interval survives every
  // parent rerender.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!running.current || document.hidden) return;
      // Pure: compute and return, nothing else.
      setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // The parent is told after the commit, never during a render.
  useEffect(() => {
    onTickRef.current(seconds);
  }, [seconds]);

  const start = useCallback(() => {
    running.current = true;
  }, []);

  const stop = useCallback(() => {
    running.current = false;
  }, []);

  const reset = useCallback(() => {
    running.current = false;
    setSeconds(0);
  }, []);

  return { seconds, start, stop, reset };
}
