"use client";

import dynamic from "next/dynamic";
import { Loading, NotFound } from "@/components/NotFound";
import { isDifficulty } from "@/lib/difficulty";
import { isLang } from "@/lib/i18n";

/** Five is its own chunk, exactly as the levelled games are. */
const Board = dynamic(
  () => import("@/games/five/FiveUnlimited").then((m) => m.FiveUnlimited),
  { loading: () => <Loading /> },
);

export function FiveGameScreen({
  lang,
  difficulty,
}: {
  lang: string;
  difficulty: string;
}) {
  if (!isLang(lang) || !isDifficulty(difficulty)) return <NotFound />;
  return <Board lang={lang} difficulty={difficulty} />;
}
