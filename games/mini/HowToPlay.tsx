"use client";

import { Sheet, SheetButton } from "@/components/Sheet";
import type { T } from "@/lib/i18n";

/**
 * Mini's rules, shown once before the first puzzle and reachable from the
 * header afterwards.
 *
 * Grid's sheet exists because its rules are not guessable from the board.
 * Mini's exists for a narrower reason: most people have never solved a
 * crossword on a phone, and the two things they will not guess are that
 * tapping the same square twice switches direction, and that nothing is
 * checked until the grid is full. Someone who has done a mini before can
 * dismiss it in one tap.
 */
export function HowToPlay({
  open,
  onClose,
  t,
}: {
  open: boolean;
  onClose: () => void;
  t: T;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={t("howToPlay")}>
      <ul className="flex flex-col gap-3 pt-1 pb-5">
        <Rule n={1} text={t("miniRule1")} />
        <Rule n={2} text={t("miniRule2")} />
        <Rule n={3} text={t("miniRule3")} />
      </ul>
      <div className="pb-2">
        <SheetButton onClick={onClose} variant="loud">
          {t("startPlaying")}
        </SheetButton>
      </div>
    </Sheet>
  );
}

function Rule({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex gap-3">
      <span
        className="t-caption tnum grid h-6 w-6 shrink-0 place-items-center font-semibold"
        style={{
          background: "var(--raised)",
          borderRadius: "var(--radius-tile)",
        }}
      >
        {n}
      </span>
      <span className="t-body">{text}</span>
    </li>
  );
}
