"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";
import type { GameId } from "@/lib/games";
import { GAMES } from "@/lib/games";

/**
 * Shared page chrome. Every screen gets a visible back control, and the
 * browser's own back gesture works because navigation is real routing rather
 * than swapped component state.
 */
export function Screen({
  title,
  subtitle,
  game,
  right,
  children,
  onBack,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  /** Lights this game's accent for the whole subtree, and nothing else. */
  game?: GameId;
  right?: ReactNode;
  children: ReactNode;
  onBack?: () => void;
  padded?: boolean;
}) {
  const router = useRouter();
  const { t } = useApp();

  const style = game
    ? ({ ["--accent" as string]: GAMES[game].accent } as React.CSSProperties)
    : undefined;

  return (
    <main
      className={`page-enter game-surface mx-auto flex min-h-dvh w-full max-w-[560px] flex-col ${
        padded ? "safe-x" : ""
      }`}
      style={style}
    >
      <header className="safe-top flex shrink-0 items-center gap-2 pt-2 pb-3">
        <button
          type="button"
          className="tap -ml-2 grid place-items-center rounded-full text-[var(--muted)]"
          onClick={() => (onBack ? onBack() : router.back())}
          aria-label={t("back")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          {title ? (
            <h1 className="font-display truncate text-lg leading-tight font-bold">
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>
          ) : null}
        </div>
        {right}
      </header>
      {children}
    </main>
  );
}
