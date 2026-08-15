import { LEVELLED_GAME_IDS } from "@/lib/games";
import { LANGS } from "@/lib/i18n";
import { GameDifficultyScreen } from "./GameDifficultyScreen";

export function generateStaticParams() {
  return LEVELLED_GAME_IDS.flatMap((game) =>
    LANGS.map((lang) => ({ game, lang })),
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ game: string; lang: string }>;
}) {
  const { game, lang } = await params;
  return <GameDifficultyScreen game={game} lang={lang} />;
}
