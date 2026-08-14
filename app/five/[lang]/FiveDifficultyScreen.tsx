"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Screen } from "@/components/Screen";
import { Tile } from "@/components/Tile";
import { NotFound } from "@/components/NotFound";
import { DIFFICULTIES, DIFFICULTY_LENGTH, type Difficulty } from "@/lib/difficulty";
import { isLang, type StringKey } from "@/lib/i18n";
import { play } from "@/lib/sound";

const NAME_KEY: Record<Difficulty, StringKey> = {
  easy: "diffEasy",
  medium: "diffMedium",
  hard: "diffHard",
  extreme: "diffExtreme",
};

const DESC_KEY: Record<Difficulty, StringKey> = {
  easy: "diffEasyDesc",
  medium: "diffMediumDesc",
  hard: "diffHardDesc",
  extreme: "diffExtremeDesc",
};

/** Small enough to sit beside two lines of text, large enough to count. */
const PICKER_TILE_PX = 16;

/**
 * Step two of Five: four rows, each led by a row of empty tiles at its real
 * width. The length is the thing being chosen, so it is shown as a shape
 * rather than described in words.
 */
export function FiveDifficultyScreen({ lang }: { lang: string }) {
  const router = useRouter();
  const { t, fiveStat, ready } = useApp();

  if (!isLang(lang)) return <NotFound />;

  return (
    <Screen
      title={t("gameFive")}
      backHref="/"
      right={
        <Link
          href="/five"
          className="t-caption hairline rounded-[var(--radius-card)] px-2.5 py-1.5 text-[var(--muted)]"
        >
          {t(lang === "sv" ? "langSv" : "langEn")}
        </Link>
      }
    >
      <div className="flex flex-1 flex-col pb-10">
        <h2 className="t-title pt-1 pb-4">{t("chooseDifficulty")}</h2>

        {DIFFICULTIES.map((d, i) => {
          const stat = fiveStat(lang, d);
          const length = DIFFICULTY_LENGTH[d];
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                play("tap");
                router.push(`/five/${lang}/${d}`);
              }}
              className="flex items-center gap-4 py-4 text-left"
              style={{
                borderTop: i === 0 ? "1px solid var(--line)" : undefined,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div
                className="flex shrink-0"
                style={{ gap: "var(--gap-tile)" }}
                aria-hidden
              >
                {Array.from({ length }, (_, c) => (
                  <Tile key={c} px={PICKER_TILE_PX} state="empty" />
                ))}
              </div>

              <div className="min-w-0 flex-1">
                <div className="t-row">{t(NAME_KEY[d])}</div>
                <div className="t-body mt-0.5 text-[var(--muted)]">
                  {t(DESC_KEY[d])}
                </div>
              </div>

              {/* Held back until storage has hydrated, so no wrong number flashes. */}
              {ready && stat.played > 0 ? (
                <div className="shrink-0 text-right">
                  <div className="t-row tnum">{stat.streak}</div>
                  <div className="t-caption text-[var(--muted)]">
                    {t("currentStreak")}
                  </div>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
