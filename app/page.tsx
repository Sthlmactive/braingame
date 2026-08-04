"use client";

import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { GAME_LIST } from "@/lib/games";
import { Tile } from "@/components/Tile";

export default function HomePage() {
  const { t } = useApp();

  return (
    <main className="page-enter safe-x mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
      <header className="safe-top flex items-end justify-between pt-4 pb-6">
        <div>
          <h1 className="font-display text-[2.6rem] leading-none font-extrabold">
            {t("appName")}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("tagline")}</p>
        </div>
        <Link
          href="/settings"
          className="tap grid place-items-center rounded-full text-[var(--muted)]"
          aria-label={t("settings")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M12 2.8v2.4M12 18.8v2.4M4.7 7.5l2 1.2M17.3 15.3l2 1.2M4.7 16.5l2-1.2M17.3 8.7l2-1.2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </header>

      <div className="grid flex-1 grid-cols-2 content-start gap-3 pb-8">
        {GAME_LIST.map((g, i) => (
          <Link
            key={g.id}
            href={`/g/${g.id}`}
            className="hairline flex flex-col items-start justify-between p-4 text-left"
            style={{
              // Each card lights only its own accent, and nowhere else.
              ["--accent" as string]: g.accent,
              backgroundColor: "var(--surface)",
              borderRadius: "var(--radius-card)",
              minHeight: 128,
              // The last card spans both columns so the grid never dangles.
              gridColumn: i === GAME_LIST.length - 1 ? "span 2" : undefined,
            }}
          >
            <Tile letter={t(g.nameKey).charAt(0)} state="accent" size="sm" />
            <div className="mt-3">
              <div className="font-display text-xl leading-tight font-bold">
                {t(g.nameKey)}
              </div>
              <div className="mt-0.5 text-[0.78rem] leading-snug text-[var(--muted)]">
                {t(g.descKey)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
