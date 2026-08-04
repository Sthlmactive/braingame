import { GAME_IDS } from "@/lib/games";
import { LANGS } from "@/lib/i18n";
import { LevelScreen } from "./LevelScreen";

export function generateStaticParams() {
  return GAME_IDS.flatMap((game) => LANGS.map((lang) => ({ game, lang })));
}

export default async function Page({
  params,
}: {
  params: Promise<{ game: string; lang: string }>;
}) {
  const { game, lang } = await params;
  return <LevelScreen game={game} lang={lang} />;
}
