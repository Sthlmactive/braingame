"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Screen } from "@/components/Screen";
import { Tile } from "@/components/Tile";
import { LANGS, type Lang } from "@/lib/i18n";
import { play } from "@/lib/sound";

/** Step one of Five: which language. The last choice is pre-selected. */
export function FiveLanguageScreen() {
  const router = useRouter();
  const { t, lang, setLang } = useApp();

  const choose = (next: Lang) => {
    play("tap");
    setLang(next);
    router.push(`/five/${next}`);
  };

  return (
    <Screen title={t("gameFive")} subtitle={t("gameFiveDesc")} backHref="/">
      <div className="flex flex-1 flex-col pb-10">
        <h2 className="t-title pt-1 pb-4">{t("chooseLanguage")}</h2>
        {LANGS.map((code) => {
          const selected = code === lang;
          return (
            <button
              key={code}
              type="button"
              onClick={() => choose(code)}
              className="flex items-center gap-4 py-4 text-left"
              style={{
                borderTop: code === LANGS[0] ? "1px solid var(--line)" : undefined,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <Tile
                letter={code === "sv" ? "å" : "w"}
                state={selected ? "typed" : "empty"}
                px={26}
              />
              <div className="flex-1">
                <div className="t-row">
                  {t(code === "sv" ? "langSv" : "langEn")}
                </div>
                <div className="t-body mt-0.5 text-[var(--muted)]">
                  {t(code === "sv" ? "langSvNative" : "langEnNative")}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
