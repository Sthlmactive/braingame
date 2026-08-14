"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";

/**
 * Whether motion should be reduced right now.
 *
 * Two signals, and the in-app setting wins over the OS one in both directions:
 * choosing "reduced" reduces motion whatever the phone says, and choosing
 * "full" keeps motion even on a phone that asks for less. "system" defers.
 *
 * This mirrors the CSS in globals.css exactly. The CSS alone is not enough,
 * because the cascade's stagger is a JavaScript delay and no media query can
 * reach it.
 */
export function useReducedMotion(): boolean {
  const { settings } = useApp();
  const [systemPrefers, setSystemPrefers] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemPrefers(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemPrefers(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (settings.motion === "reduced") return true;
  if (settings.motion === "full") return false;
  return systemPrefers;
}
