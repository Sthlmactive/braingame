"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Screen } from "@/components/Screen";
import { NotFound } from "@/components/NotFound";
import { formatTime } from "@/games/mini/MiniResult";
import { DIFFICULTIES, type Difficulty } from "@/lib/difficulty";
import { isLang, type StringKey } from "@/lib/i18n";
import { MINI_BLACKS, MINI_SIZE } from "@/lib/mini";
import { play } from "@/lib/sound";

const NAME_KEY: Record<Difficulty, StringKey> = {
  easy: "diffEasy",
  medium: "diffMedium",
  hard: "diffHard",
  extreme: "diffExtreme",
};

const DESC_KEY: Record<Difficulty, StringKey> = {
  easy: "miniDiffEasyDesc",
  medium: "miniDiffMediumDesc",
  hard: "miniDiffHardDesc",
  extreme: "miniDiffExtremeDesc",
};

/**
 * Step two of Mini: four rows, each led by a miniature of that difficulty's
 * actual grid. What is being chosen is a shape — 4x4 open, 5x5 with black
 * squares, 5x5 fully checked — so the row shows the shape rather than naming
 * it, the same way Five's picker shows word length as a row of tiles.
 */
export function MiniDifficultyScreen({ lang }: { lang: string }) {
  const router = useRouter();
  const { t, miniStat, ready } = useApp();

  if (!isLang(lang)) return <NotFound />;

  return (
    <Screen title={t("miniName")} subtitle={t("miniTagline")} backHref="/">
      <div className="flex flex-1 flex-col pb-10">
        <h2 className="t-title pt-1 pb-4">{t("chooseDifficulty")}</h2>
        {DIFFICULTIES.map((difficulty, i) => {
          const stat = ready ? miniStat(lang, difficulty) : null;
          return (
            <button
              key={difficulty}
              type="button"
              onClick={() => {
                play("tap");
                router.push(`/mini/${lang}/${difficulty}`);
              }}
              className="flex items-center gap-4 py-4 text-left"
              style={{
                borderTop: i === 0 ? "1px solid var(--line)" : undefined,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <GridGlyph difficulty={difficulty} />
              <div className="min-w-0 flex-1">
                <div className="t-row">{t(NAME_KEY[difficulty])}</div>
                <div className="t-body mt-0.5 text-[var(--muted)]">
                  {t(DESC_KEY[difficulty])}
                </div>
              </div>
              {stat && stat.bestSeconds > 0 ? (
                <div className="shrink-0 text-right">
                  <div className="t-row tnum">{formatTime(stat.bestSeconds)}</div>
                  <div className="t-caption text-[var(--muted)]">{t("miniBestTime")}</div>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </Screen>
  );
}

/** A 4x4 or 5x5 of hairline cells, with this difficulty's black squares. */
function GridGlyph({ difficulty }: { difficulty: Difficulty }) {
  const size = MINI_SIZE[difficulty];
  const blacks = MINI_BLACKS[difficulty][0] ?? 0;
  const cell = 6;
  const gap = 1;

  // Which cells are black is illustrative, not the real mask: opposite
  // corners for two, plus the centre for an odd count.
  const dark = new Set<number>();
  const total = size * size;
  for (let k = 0; k < Math.floor(blacks / 2); k++) {
    dark.add(k === 0 ? 0 : k * (size + 1));
    dark.add(total - 1 - (k === 0 ? 0 : k * (size + 1)));
  }
  if (blacks % 2 === 1) dark.add((total - 1) / 2);

  return (
    <div
      className="shrink-0"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${size}, ${cell}px)`,
        gap,
      }}
      aria-hidden
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: cell,
            height: cell,
            background: dark.has(i) ? "var(--line)" : "transparent",
            outline: "1px solid var(--line)",
          }}
        />
      ))}
    </div>
  );
}
