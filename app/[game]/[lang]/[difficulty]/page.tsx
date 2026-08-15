import { DIFFICULTIES } from "@/lib/difficulty";
import { LEVELLED_GAME_IDS } from "@/lib/games";
import { LANGS } from "@/lib/i18n";
import { GameBoardScreen } from "./GameBoardScreen";

export function generateStaticParams() {
  return LEVELLED_GAME_IDS.flatMap((game) =>
    LANGS.flatMap((lang) =>
      DIFFICULTIES.map((difficulty) => ({ game, lang, difficulty })),
    ),
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ game: string; lang: string; difficulty: string }>;
}) {
  const { game, lang, difficulty } = await params;
  return <GameBoardScreen game={game} lang={lang} difficulty={difficulty} />;
}
