import { GAME_IDS } from "@/lib/games";
import { LanguageScreen } from "./LanguageScreen";

export function generateStaticParams() {
  return GAME_IDS.map((game) => ({ game }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  return <LanguageScreen game={game} />;
}
