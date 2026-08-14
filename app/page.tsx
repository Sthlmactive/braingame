"use client";

import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { BoardGlyph } from "@/components/BoardGlyph";
import { GAME_LIST } from "@/lib/games";

/**
 * Seven rows, hairline between each, and not one coloured pixel.
 *
 * The old grid spent colour on seven decorative badges, which left the board's
 * own feedback with nothing to be louder than. Each row now leads with a
 * miniature of that game's real board instead.
 */
export default function HomePage() {
  const { t, fiveLast } = useApp();

  // Five has no levels, so its row goes straight back to the last language and
  // difficulty played. Both pickers stay one tap away from the game itself.
  const fiveHref = fiveLast
    ? `/five/${fiveLast.lang}/${fiveLast.difficulty}`
    : "/five";

  return (
    <main className="page-enter safe-x mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
      <header className="safe-top flex items-start justify-between pt-5 pb-6">
        <div>
          <h1 className="t-wordmark">{t("appName")}</h1>
          <p className="t-body mt-1 text-[var(--muted)]">{t("tagline")}</p>
        </div>
        <Link
          href="/settings"
          className="tap -mr-2 grid place-items-center text-[var(--muted)]"
          aria-label={t("settings")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M12 2.8v2.4M12 18.8v2.4M4.7 7.5l2 1.2M17.3 15.3l2 1.2M4.7 16.5l2-1.2M17.3 8.7l2-1.2"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </header>

      <nav className="flex flex-1 flex-col pb-8">
        {GAME_LIST.map((g, i) => (
          <Link
            key={g.id}
            href={g.id === "five" ? fiveHref : `/g/${g.id}`}
            className="flex items-center gap-4 py-4"
            style={{
              borderTop: i === 0 ? "1px solid var(--line)" : undefined,
              borderBottom: "1px solid var(--line)",
            }}
          >
            <BoardGlyph game={g.id} />
            <div className="min-w-0 flex-1">
              <div className="t-row">{t(g.nameKey)}</div>
              <div className="t-body mt-0.5 text-[var(--muted)]">
                {t(g.descKey)}
              </div>
            </div>
          </Link>
        ))}
      </nav>
    </main>
  );
}
