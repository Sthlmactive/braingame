"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A countdown in whole seconds. Driven off wall-clock time rather than by
 * counting ticks, so backgrounding Safari does not leave the timer behind.
 * Pass 0 seconds for an untimed level and it never fires.
 */
export function useCountdown(seconds: number, onExpire: () => void): number {
  const [remaining, setRemaining] = useState(seconds);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  const fired = useRef(false);

  useEffect(() => {
    if (seconds <= 0) return;
    fired.current = false;
    setRemaining(seconds);
    const endsAt = Date.now() + seconds * 1000;

    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !fired.current) {
        fired.current = true;
        expire.current();
      }
    };

    const id = window.setInterval(tick, 250);
    // Coming back from the background must not show a stale number.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [seconds]);

  return seconds > 0 ? remaining : 0;
}

/** A stopwatch in milliseconds, for games scored on elapsed time. */
export function useStopwatch(running: boolean): () => number {
  const start = useRef(Date.now());
  const stopped = useRef<number | null>(null);
  useEffect(() => {
    if (!running && stopped.current === null) stopped.current = Date.now();
  }, [running]);
  return () => (stopped.current ?? Date.now()) - start.current;
}
