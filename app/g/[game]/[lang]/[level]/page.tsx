import { LEVELLED_GAME_IDS, LEVELS } from "@/lib/games";
import { LANGS } from "@/lib/i18n";
import { GameScreen } from "./GameScreen";

export function generateStaticParams() {
  return LEVELLED_GAME_IDS.flatMap((game) =>
    LANGS.flatMap((lang) =>
      LEVELS.map((level) => ({ game, lang, level: String(level) })),
    ),
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ game: string; lang: string; level: string }>;
}) {
  const { game, lang, level } = await params;
  return <GameScreen game={game} lang={lang} level={level} />;
}
