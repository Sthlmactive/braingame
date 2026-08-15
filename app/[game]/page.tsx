import { LEVELLED_GAME_IDS } from "@/lib/games";
import { GameLanguageScreen } from "./GameLanguageScreen";

export function generateStaticParams() {
  return LEVELLED_GAME_IDS.map((game) => ({ game }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  return <GameLanguageScreen game={game} />;
}
