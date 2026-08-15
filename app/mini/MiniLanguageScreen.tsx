"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Screen } from "@/components/Screen";
import { LanguagePicker } from "@/components/LanguagePicker";
import type { Lang } from "@/lib/i18n";
import { play } from "@/lib/sound";

/** Step one of Mini: which language. Two cards, half the screen each. */
export function MiniLanguageScreen() {
  const router = useRouter();
  const { t, setLang } = useApp();

  const choose = (next: Lang) => {
    play("tap");
    setLang(next);
    router.push(`/mini/${next}`);
  };

  return (
    <Screen title={t("miniName")} subtitle={t("miniTagline")} backHref="/">
      <LanguagePicker onSelect={choose} />
    </Screen>
  );
}
