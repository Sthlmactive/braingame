"use client";

import Link from "next/link";
import { useApp } from "./AppProvider";

/** Shown when a route carries a game, language or level that does not exist. */
export function NotFound() {
  const { t } = useApp();
  return (
    <main className="page-enter safe-x mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center gap-3 text-center">
      <h1 className="font-display text-2xl font-bold">{t("notFound")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("notFoundBody")}</p>
      <Link
        href="/"
        className="tap mt-2 rounded-xl px-5 py-3 text-sm font-semibold"
        style={{ background: "var(--accent)", color: "var(--ink)" }}
      >
        {t("home")}
      </Link>
    </main>
  );
}

/** Shown when the word data could not be fetched. */
export function DataError({ onRetry }: { onRetry: () => void }) {
  const { t } = useApp();
  return (
    <main className="page-enter safe-x mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center gap-3 text-center">
      <h1 className="font-display text-xl font-bold">{t("dataError")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("dataErrorBody")}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="tap rounded-xl px-5 py-3 text-sm font-semibold"
          style={{ background: "var(--accent)", color: "var(--ink)" }}
        >
          {t("retry")}
        </button>
        <Link
          href="/"
          className="tap rounded-xl px-5 py-3 text-sm font-semibold"
          style={{ border: "1px solid var(--line)" }}
        >
          {t("home")}
        </Link>
      </div>
    </main>
  );
}

/** Shown when a generator could not produce a puzzle for this level. */
export function PuzzleError({ onRetry }: { onRetry: () => void }) {
  const { t } = useApp();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-16 text-center">
      <h2 className="font-display text-lg font-bold">{t("puzzleError")}</h2>
      <p className="text-sm text-[var(--muted)]">{t("puzzleErrorBody")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="tap mt-1 rounded-xl px-5 py-3 text-sm font-semibold"
        style={{ background: "var(--accent)", color: "var(--ink)" }}
      >
        {t("retry")}
      </button>
    </div>
  );
}

/** The one loading state, used while a language's data streams in. */
export function Loading() {
  const { t } = useApp();
  return (
    <div
      className="flex flex-1 items-center justify-center pb-16 text-sm text-[var(--muted)]"
      role="status"
    >
      {t("loading")}
    </div>
  );
}
