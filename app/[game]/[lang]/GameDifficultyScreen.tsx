"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Screen } from "@/components/Screen";
import { BoardGlyph } from "@/components/BoardGlyph";
import { DifficultyPicker } from "@/components/DifficultyPicker";
import { NotFound } from "@/components/NotFound";
import { DIFFICULTIES, type Difficulty } from "@/lib/difficulty";
import { GAMES, isLevelledGameId } from "@/lib/games";
import { isLang, type StringKey } from "@/lib/i18n";
import { play } from "@/lib/sound";

const NAME_KEY: Record<Difficulty, StringKey> = {
  easy: "diffEasy",
  medium: "diffMedium",
  hard: "diffHard",
  extreme: "diffExtreme",
};

const DESC_KEY: Record<Difficulty, StringKey> = {
  easy: "bandEasyDesc",
  medium: "bandMediumDesc",
  hard: "bandHardDesc",
  extreme: "bandExtremeDesc",
};

/** A miniature of this game's own board, the same idea as Mini's grid. */
const PREVIEW_PX = 30;

/**
 * Step two for the six banded games: which difficulty.
 *
 * The preview is the game's board glyph rather than a picture of the
 * difficulty, because at this point you have already chosen the game and what
 * changes between the four cards is written on them.
 */
export function GameDifficultyScreen({
  game,
  lang,
}: {
  game: string;
  lang: string;
}) {
  const router = useRouter();
  const { t } = useApp();

  if (!isLevelledGameId(game) || !isLang(lang)) return <NotFound />;
  const meta = GAMES[game];

  return (
    <Screen title={t(meta.nameKey)} subtitle={t(meta.descKey)} backHref="/">
      <DifficultyPicker
        onSelect={(difficulty) => {
          play("tap");
          router.push(`/${game}/${lang}/${difficulty}`);
        }}
        options={DIFFICULTIES.map((difficulty) => ({
          difficulty,
          name: t(NAME_KEY[difficulty]),
          description: t(DESC_KEY[difficulty]),
          preview: <BoardGlyph game={game} size={PREVIEW_PX} />,
          stat: null,
        }))}
      />
    </Screen>
  );
}
