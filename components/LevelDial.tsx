"use client";

import { useEffect, useRef, useState } from "react";
import { LEVELS, type Level } from "@/lib/games";
import type { LevelRecord } from "@/lib/storage";
import type { T } from "@/lib/i18n";
import { formatTime } from "@/lib/i18n";
import { play } from "@/lib/sound";

/**
 * Not ten numbered buttons. A vertical dial of ten tiles that fill in as
 * levels are cleared, with the focused level enlarged and its accent lit.
 * Scrolling snaps, and the focused level tracks whatever is centred.
 */
export function LevelDial({
  records,
  initial,
  onPlay,
  t,
}: {
  records: Record<Level, LevelRecord>;
  initial: Level;
  onPlay: (level: Level) => void;
  t: T;
}) {
  const [focused, setFocused] = useState<Level>(initial);
  const scroller = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<Level, HTMLButtonElement>());
  const didInitialScroll = useRef(false);

  // Centre the starting level without animating on first paint.
  useEffect(() => {
    const el = items.current.get(initial);
    if (!el || didInitialScroll.current) return;
    didInitialScroll.current = true;
    el.scrollIntoView({ block: "center", behavior: "auto" });
  }, [initial]);

  // Whichever tile is nearest the centre of the strip becomes the focused one.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const mid = root.scrollTop + root.clientHeight / 2;
        let best: Level = 1;
        let bestDist = Infinity;
        for (const [level, el] of items.current) {
          const centre = el.offsetTop + el.offsetHeight / 2;
          const d = Math.abs(centre - mid);
          if (d < bestDist) {
            bestDist = d;
            best = level;
          }
        }
        setFocused((prev) => (prev === best ? prev : best));
      });
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const cleared = LEVELS.filter((l) => records[l].completed).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="pb-1 text-center text-xs text-[var(--muted)]">
        {t("levelsCleared", { n: cleared })}
      </p>

      <div
        ref={scroller}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{
          scrollSnapType: "y mandatory",
          // Half the strip in padding either end so 1 and 10 can reach centre.
          paddingBlock: "38vh",
          maskImage:
            "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
        }}
      >
        {LEVELS.map((level) => {
          const rec = records[level];
          const isFocused = level === focused;
          return (
            <button
              key={level}
              type="button"
              ref={(el) => {
                if (el) items.current.set(level, el);
                else items.current.delete(level);
              }}
              className="flex w-full items-center gap-4 px-2 py-1.5 text-left"
              style={{ scrollSnapAlign: "center" }}
              onClick={() => {
                if (isFocused) {
                  play("tap");
                  onPlay(level);
                } else {
                  items.current
                    .get(level)
                    ?.scrollIntoView({ block: "center", behavior: "smooth" });
                }
              }}
              aria-current={isFocused || undefined}
              aria-label={t("levelN", { n: level })}
            >
              <div
                className="tile shrink-0"
                data-state={rec.completed ? "accent" : "empty"}
                style={{
                  width: isFocused ? 74 : 50,
                  height: isFocused ? 74 : 50,
                  fontSize: isFocused ? "1.9rem" : "1.2rem",
                  backgroundColor: rec.completed
                    ? "var(--accent)"
                    : isFocused
                      ? "var(--surface)"
                      : "transparent",
                  color: rec.completed ? "var(--ink)" : "var(--text)",
                  border: `2px solid ${
                    isFocused
                      ? "var(--accent)"
                      : rec.completed
                        ? "var(--accent)"
                        : "var(--line)"
                  }`,
                  opacity: isFocused ? 1 : rec.completed ? 0.9 : 0.45,
                  transition:
                    "width 180ms var(--ease-soft), height 180ms var(--ease-soft), opacity 180ms linear, background-color 180ms linear",
                }}
              >
                <span className="tile-glyph font-display">{level}</span>
              </div>

              <div
                className="min-w-0 flex-1"
                style={{
                  opacity: isFocused ? 1 : 0.5,
                  transition: "opacity 180ms linear",
                }}
              >
                <div
                  className="font-display font-bold"
                  style={{ fontSize: isFocused ? "1.05rem" : "0.9rem" }}
                >
                  {t("levelN", { n: level })}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {rec.completed
                    ? [
                        rec.bestScore > 0 ? t("bestScore", { n: rec.bestScore }) : null,
                        rec.bestTimeMs > 0
                          ? t("bestTime", { t: formatTime(rec.bestTimeMs) })
                          : null,
                        rec.streak > 1 ? t("streak", { n: rec.streak }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || t("levelCleared")
                    : ""}
                </div>
              </div>

              {isFocused ? (
                <span
                  className="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold tracking-wide uppercase"
                  style={{ backgroundColor: "var(--accent)", color: "var(--ink)" }}
                >
                  {t("play")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
