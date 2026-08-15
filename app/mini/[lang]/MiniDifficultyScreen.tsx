"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Screen } from "@/components/Screen";
import { DifficultyPicker } from "@/components/DifficultyPicker";
import { NotFound } from "@/components/NotFound";
import { formatTime } from "@/games/mini/MiniResult";
import { DIFFICULTIES, type Difficulty } from "@/lib/difficulty";
import { isLang, type StringKey } from "@/lib/i18n";
import { MINI_BLACKS, MINI_SIZE } from "@/lib/mini";
import { PICKER_CELL_GAP_PX, PICKER_CELL_PX } from "@/lib/picker";
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
 * Step two of Mini: four cards filling the screen, each led by a miniature of
 * that difficulty's actual grid. What is being chosen is a shape — 4x4 open,
 * 5x5 with black squares, 5x5 fully checked — so the card shows the shape
 * rather than naming it, the same way Five's picker shows word length as a
 * row of tiles.
 */
export function MiniDifficultyScreen({ lang }: { lang: string }) {
  const router = useRouter();
  const { t, miniStat, ready } = useApp();

  if (!isLang(lang)) return <NotFound />;

  return (
    <Screen title={t("miniName")} subtitle={t("miniTagline")} backHref="/">
      <DifficultyPicker
        onSelect={(difficulty) => {
          play("tap");
          router.push(`/mini/${lang}/${difficulty}`);
        }}
        options={DIFFICULTIES.map((difficulty) => {
          const stat = ready ? miniStat(lang, difficulty) : null;
          return {
            difficulty,
            name: t(NAME_KEY[difficulty]),
            description: t(DESC_KEY[difficulty]),
            preview: <GridGlyph difficulty={difficulty} />,
            stat:
              stat && stat.bestSeconds > 0
                ? {
                    value: formatTime(stat.bestSeconds),
                    label: t("miniBestTime"),
                  }
                : null,
          };
        })}
      />
    </Screen>
  );
}

/**
 * A 4x4 or 5x5 of hairline cells, with this difficulty's black squares.
 *
 * Bounded by height, not width: it is a square sitting under two lines of
 * text, and four of those plus 22px of card padding have to fit a phone.
 *
 * Drawn as one hairline grid — the container paints `--line` and the cells
 * paint over it, so every rule is exactly 1px. The previous version gave each
 * cell its own outline inside a 1px gap, which drew every interior line
 * twice and turned to mush as the cells got smaller.
 *
 * Black squares are `--ink`, matching the board. They were `--line`, which is
 * 1.35:1 against the card — invisible, in the one element whose whole job is
 * to show you where the black squares are.
 */
function GridGlyph({ difficulty }: { difficulty: Difficulty }) {
  const size = MINI_SIZE[difficulty];
  const blacks = MINI_BLACKS[difficulty][0] ?? 0;
  const cell = PICKER_CELL_PX;
  const gap = PICKER_CELL_GAP_PX;

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
    <span
      className="grid shrink-0"
      style={{
        gridTemplateColumns: `repeat(${size}, ${cell}px)`,
        gap,
        padding: gap,
        background: "var(--line)",
      }}
      aria-hidden
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: cell,
            height: cell,
            background: dark.has(i) ? "var(--ink)" : "var(--paper)",
          }}
        />
      ))}
    </span>
  );
}
