import { DIFFICULTIES } from "@/lib/difficulty";
import { LANGS } from "@/lib/i18n";
import { MiniGameScreen } from "./MiniGameScreen";

export function generateStaticParams() {
  return LANGS.flatMap((lang) =>
    DIFFICULTIES.map((difficulty) => ({ lang, difficulty })),
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; difficulty: string }>;
}) {
  const { lang, difficulty } = await params;
  return <MiniGameScreen lang={lang} difficulty={difficulty} />;
}
