"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Screen } from "@/components/Screen";
import { LanguagePicker } from "@/components/LanguagePicker";
import { NotFound } from "@/components/NotFound";
import { GAMES, isLevelledGameId } from "@/lib/games";
import type { Lang } from "@/lib/i18n";
import { play } from "@/lib/sound";

/** Step one for the six banded games: which language. */
export function GameLanguageScreen({ game }: { game: string }) {
  const router = useRouter();
  const { t, setLang } = useApp();

  if (!isLevelledGameId(game)) return <NotFound />;
  const meta = GAMES[game];

  const choose = (next: Lang) => {
    play("tap");
    setLang(next);
    router.push(`/${game}/${next}`);
  };

  return (
    <Screen title={t(meta.nameKey)} subtitle={t(meta.descKey)} backHref="/">
      <LanguagePicker onSelect={choose} />
    </Screen>
  );
}
