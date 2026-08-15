"use client";

import { Sheet, SheetButton } from "@/components/Sheet";
import type { T } from "@/lib/i18n";

/**
 * Grid's rules are not guessable from the board, so they are shown once
 * before the first game and stay reachable from the header afterwards.
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
    <Sheet open={open} dismissable={false} title={t("howToPlay")}>
      <ol className="flex list-none flex-col gap-3 pb-4">
        {[t("gridRule1"), t("gridRule2"), t("gridRule3")].map((line, i) => (
          <li key={i} className="flex gap-3">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold"
              style={{ background: "var(--ink)", color: "var(--paper)" }}
            >
              {i + 1}
            </span>
            <span className="text-sm leading-snug text-[var(--muted)]">{line}</span>
          </li>
        ))}
      </ol>

      <Example />

      <div className="pt-4 pb-2">
        <SheetButton variant="loud" onClick={onClose}>
          {t("startPlaying")}
        </SheetButton>
      </div>
    </Sheet>
  );
}

/**
 * A guess of "s t o n e" filling the two cells whose column already held an
 * "s". Pure CSS, looping, so it explains the column rule without words.
 */
function Example() {
  const guess = ["s", "t", "o", "n", "e"];
  const rows = [
    ["s", "h", "o", "r", "e"],
    ["c", "r", "a", "n", "e"],
    ["s", "t", "a", "l", "l"],
  ];
  // Cells that the guess reveals: column 0 on rows 0 and 2, column 4 on row 0
  // and 1, column 3 on row 1.
  const hits = new Set(["0-0", "2-0", "0-4", "1-4", "1-3"]);

  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--raised)", border: "1px solid var(--line)" }}
    >
      <div className="mx-auto flex w-max flex-col gap-1">
        <div className="flex gap-1 pb-1">
          {guess.map((ch, c) => (
            <span
              key={c}
              className="grid h-6 w-6 place-items-center rounded-[3px] text-[0.7rem] font-bold uppercase"
              style={{ background: "var(--raised)", color: "var(--ink)" }}
            >
              {ch}
            </span>
          ))}
        </div>
        {rows.map((row, r) => (
          <div key={r} className="flex gap-1">
            {row.map((ch, c) => {
              const on = hits.has(`${r}-${c}`);
              return (
                <span
                  key={c}
                  className="grid h-6 w-6 place-items-center rounded-[3px] text-[0.7rem] font-bold uppercase"
                  style={{
                    background: on ? "var(--correct)" : "var(--absent)",
                    color: on ? "var(--on-state)" : "transparent",
                    animation: on
                      ? `grid-demo 2.6s ${c * 0.06}s var(--ease-soft) infinite`
                      : undefined,
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
