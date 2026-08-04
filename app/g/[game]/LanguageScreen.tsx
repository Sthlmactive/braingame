"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Screen } from "@/components/Screen";
import { Tile } from "@/components/Tile";
import { NotFound } from "@/components/NotFound";
import { GAMES, isGameId } from "@/lib/games";
import { LANGS, type Lang } from "@/lib/i18n";
import { play } from "@/lib/sound";

/**
 * Language is always shown rather than remembered silently, so it can be
 * changed in one tap, but the last choice is pre-selected.
 */
export function LanguageScreen({ game }: { game: string }) {
  const router = useRouter();
  const { t, lang, setLang, highest } = useApp();

  if (!isGameId(game)) return <NotFound />;
  const meta = GAMES[game];

  const choose = (next: Lang) => {
    play("tap");
    setLang(next);
    router.push(`/g/${game}/${next}`);
  };

  return (
    <Screen title={t(meta.nameKey)} subtitle={t(meta.descKey)} game={game}>
      <div className="flex flex-1 flex-col justify-center gap-3 pb-10">
        <h2 className="font-display pb-1 text-2xl font-bold">
          {t("chooseLanguage")}
        </h2>
        {LANGS.map((code) => {
          const cleared = highest(game, code);
          const selected = code === lang;
          return (
            <button
              key={code}
              type="button"
              onClick={() => choose(code)}
              className="hairline flex items-center gap-4 p-4 text-left"
              style={{
                background: "var(--surface)",
                borderRadius: "var(--radius-card)",
                borderColor: selected ? "var(--accent)" : "var(--line)",
              }}
            >
              <Tile
                letter={code === "sv" ? "å" : "w"}
                state={selected ? "accent" : "muted"}
                size="md"
              />
              <div className="flex-1">
                <div className="font-display text-lg font-bold">
                  {t(code === "sv" ? "langSv" : "langEn")}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {cleared > 0
                    ? t("levelsCleared", { n: cleared })
                    : t(code === "sv" ? "langSvNative" : "langEnNative")}
                </div>
              </div>
              {selected ? (
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
