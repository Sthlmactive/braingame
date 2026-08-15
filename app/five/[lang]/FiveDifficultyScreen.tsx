"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Screen } from "@/components/Screen";
import { DifficultyPicker } from "@/components/DifficultyPicker";
import { Tile } from "@/components/Tile";
import { NotFound } from "@/components/NotFound";
import { DIFFICULTIES, DIFFICULTY_LENGTH, type Difficulty } from "@/lib/difficulty";
import { isLang, type StringKey } from "@/lib/i18n";
import { PICKER_TILE_PX } from "@/lib/picker";
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

/**
 * Step two of Five: four cards filling the screen. Each carries its name, a
 * line of description, and a row of empty tiles at the real word length —
 * because the length is part of what is being chosen, and a shape says it
 * faster than "six letters" does.
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
      <DifficultyPicker
        onSelect={(d) => {
          play("tap");
          router.push(`/five/${lang}/${d}`);
        }}
        options={DIFFICULTIES.map((d) => {
          const stat = fiveStat(lang, d);
          return {
            difficulty: d,
            name: t(NAME_KEY[d]),
            description: t(DESC_KEY[d]),
            preview: (
              <span className="flex" style={{ gap: "var(--gap-tile)" }}>
                {Array.from({ length: DIFFICULTY_LENGTH[d] }, (_, c) => (
                  <Tile key={c} px={PICKER_TILE_PX} state="empty" />
                ))}
              </span>
            ),
            // Held back until storage has hydrated, so no wrong number flashes.
            stat:
              ready && stat.played > 0
                ? { value: String(stat.streak), label: t("currentStreak") }
                : null,
          };
        })}
      />
    </Screen>
  );
}
