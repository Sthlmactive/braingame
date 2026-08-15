"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";

/**
 * Shared page chrome. Every screen gets a visible back control, and the
 * browser's own back gesture works because navigation is real routing rather
 * than swapped component state.
 */
export function Screen({
  title,
  subtitle,
  right,
  children,
  onBack,
  backHref,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  onBack?: () => void;
  /**
   * Where the chevron goes. Navigation is up the hierarchy, never backwards
   * through history: see the navigation rule in docs/design.md. Given a href
   * it renders a real link; the six unmigrated games still fall through to
   * router.back().
   */
  backHref?: string;
  padded?: boolean;
}) {
  const { t } = useApp();

  return (
    <main
      className={`page-enter game-surface mx-auto flex min-h-dvh w-full max-w-[560px] flex-col ${
        padded ? "safe-x" : ""
      }`}
    >
      <header className="safe-top flex shrink-0 items-center gap-2 pt-2 pb-3">
        <BackControl href={backHref} onBack={onBack} label={t("back")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </BackControl>
        <div className="min-w-0 flex-1">
          {title ? (
            <h1 className="t-title truncate">
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className="t-caption truncate text-[var(--muted)]">{subtitle}</p>
          ) : null}
        </div>
        {right}
      </header>
      {children}
    </main>
  );
}

/**
 * The chevron. A destination renders a real link, which is what up-navigation
 * is; the six unmigrated games still pass neither and fall through to history.
 */
function BackControl({
  href,
  onBack,
  label,
  children,
}: {
  href?: string;
  onBack?: () => void;
  label: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const className =
    "tap -ml-2 grid place-items-center rounded-full text-[var(--muted)]";
  if (href) {
    return (
      <Link href={href} className={className} aria-label={label}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => (onBack ? onBack() : router.back())}
      aria-label={label}
    >
      {children}
    </button>
  );
}
