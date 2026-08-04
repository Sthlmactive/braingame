"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Screen } from "@/components/Screen";
import { LevelDial } from "@/components/LevelDial";
import { NotFound } from "@/components/NotFound";
import { GAMES, LEVELS, isGameId, type Level } from "@/lib/games";
import { isLang } from "@/lib/i18n";
import type { LevelRecord } from "@/lib/storage";

export function LevelScreen({ game, lang }: { game: string; lang: string }) {
  const router = useRouter();
  const { t, getRecordFor, highest, ready } = useApp();

  if (!isGameId(game) || !isLang(lang)) return <NotFound />;
  const meta = GAMES[game];

  const records = Object.fromEntries(
    LEVELS.map((l) => [l, getRecordFor(game, lang, l)]),
  ) as Record<Level, LevelRecord>;

  // Start the dial on the next level to play rather than always at one.
  const done = highest(game, lang);
  const initial = (Math.min(10, done + 1) || 1) as Level;

  return (
    <Screen
      title={t(meta.nameKey)}
      subtitle={t(lang === "sv" ? "langSv" : "langEn")}
      game={game}
    >
      {ready ? (
        <LevelDial
          records={records}
          initial={initial}
          t={t}
          onPlay={(level) => router.push(`/g/${game}/${lang}/${level}`)}
        />
      ) : (
        <div className="flex-1" />
      )}
    </Screen>
  );
}
