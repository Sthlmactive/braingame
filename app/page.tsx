"use client";

import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { BoardGlyph } from "@/components/BoardGlyph";
import { GAME_LIST } from "@/lib/games";

/**
 * A comfortable row, and a floor rather than a size: seven rows at 88 would
 * not fit a 667pt screen without scrolling, so they divide the height instead
 * and this only catches a phone shorter than any we measured.
 */
const ROW_MIN_PX = 64;

/** Up from 34. A row is half as tall again, so the glyph grows with it. */
const GLYPH_PX = 44;

/**
 * Seven rows, hairline between each, and not one coloured pixel.
 *
 * The old grid spent colour on seven decorative badges, which left the board's
 * own feedback with nothing to be louder than. Each row now leads with a
 * miniature of that game's real board instead.
 */
export default function HomePage() {
  const { t, fiveLast, miniLast } = useApp();

  // Five has no levels, so its row goes straight back to the last language and
  // difficulty played. Both pickers stay one tap away from the game itself.
  const fiveHref = fiveLast
    ? `/five/${fiveLast.lang}/${fiveLast.difficulty}`
    : "/five";
  const miniHref = miniLast
    ? `/mini/${miniLast.lang}/${miniLast.difficulty}`
    : "/mini";

  return (
    <main className="page-enter safe-x mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
      <header className="safe-top flex shrink-0 items-start justify-between pt-5 pb-6">
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

      {/* Seven rows dividing all the height there is, the same reasoning as the
          difficulty picker: the list is the screen, not a block sitting at the
          top of it. They stay hairline rows rather than becoming cards — seven
          bordered boxes is a lot of chrome, and this is a directory to scan,
          not four choices to weigh. */}
      <nav className="safe-bottom flex min-h-0 flex-1 flex-col">
        {GAME_LIST.map((g, i) => (
          <Link
            key={g.id}
            href={
              g.id === "five" ? fiveHref : g.id === "mini" ? miniHref : `/g/${g.id}`
            }
            className="press-flat flex min-h-0 flex-1 items-center gap-4 py-3"
            style={{
              minHeight: ROW_MIN_PX,
              borderTop: i === 0 ? "1px solid var(--line)" : undefined,
              borderBottom: "1px solid var(--line)",
            }}
          >
            <BoardGlyph game={g.id} size={GLYPH_PX} />
            <div className="min-w-0 flex-1">
              <div className="t-title">{t(g.nameKey)}</div>
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
