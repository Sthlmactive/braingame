import { LANGS } from "@/lib/i18n";
import { MiniDifficultyScreen } from "./MiniDifficultyScreen";

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return <MiniDifficultyScreen lang={lang} />;
}
