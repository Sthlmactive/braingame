"use client";

import type { ReactNode } from "react";
import type { Difficulty } from "@/lib/difficulty";
import {
  CARD_GAP_PX,
  CARD_PAD_PX,
  NAME_GAP_PX,
  PREVIEW_GAP_PX,
} from "@/lib/picker";

/**
 * The difficulty picker, shared by Five and Mini.
 *
 * It was four thin rows stacked under the header, ending a third of the way
 * down the screen. Making them fill the height was not enough on its own: the
 * content did not fill with them, so each card had its preview pinned to the
 * top and its name to the bottom with a void between. Void is not whitespace.
 *
 * So the card holds one block, optically centred, in reading order:
 *
 *   Lätt                    <- the name, and the thing being chosen
 *   Vanliga ord. Två ledtrådar.
 *   ▢▢▢▢▢                  <- a supporting detail, not the headline
 *
 * The preview earned demotion. Five empty squares are visually loud and
 * semantically empty, and at 36px they dominated a card whose actual content
 * is the word "Lätt". At 15px they still answer five-or-six at a glance,
 * which is the only question they exist to answer.
 *
 * The record sits top right and is absolutely positioned, so a card that has
 * one and a card that does not centre their content identically. A zero
 * streak is absent rather than shown: nothing to report is not a report.
 */

/**
 * The gaps are set for Swedish. 3px and 12px were measured against "Easy" and
 * "Hard", which reach no higher than a cap; "Lätt" and "Svår" stack a
 * diacritic above the cap line and land on the line above. The leading in
 * globals.css does most of the work — see the note on the type scale — and
 * these two gaps do the rest.
 *
 * All of them live in lib/picker.ts so the layout test measures the same
 * numbers the component renders.
 */

export interface DifficultyOption {
  difficulty: Difficulty;
  name: string;
  description: string;
  /** The shape being chosen — a row of tiles, or a grid at its real size. */
  preview: ReactNode;
  /** A personal record, or null when there is nothing to report yet. */
  stat?: { value: string; label: string } | null;
}

export function DifficultyPicker({
  options,
  onSelect,
}: {
  options: readonly DifficultyOption[];
  onSelect: (difficulty: Difficulty) => void;
}) {
  return (
    // min-w-0 the whole way down: a flex item defaults to min-width:auto, which
    // refuses to shrink below its content and pushes the card past the viewport.
    <div
      className="safe-bottom flex min-h-0 min-w-0 flex-1 flex-col pt-1 pb-2"
      style={{ gap: CARD_GAP_PX }}
    >
      {options.map((option) => (
        <button
          key={option.difficulty}
          type="button"
          onClick={() => onSelect(option.difficulty)}
          // No `min-h-0` and no explicit `min-height`, on purpose. Both
          // replace the flex item's automatic minimum, which is its content —
          // and with `overflow-hidden` on the card, a screen too short to hold
          // four of them would then silently crop the preview off the bottom
          // instead of letting the page scroll. Cropping is the worse failure.
          // MIN_CARD_PX is a design floor the content already clears; the
          // layout test asserts that rather than the CSS enforcing it.
          className="press relative flex min-w-0 flex-1 flex-col justify-center overflow-hidden text-left"
          style={{
            padding: CARD_PAD_PX,
            background: "var(--raised)",
            borderRadius: "var(--radius-panel)",
          }}
        >
          {/* Stacked, not inline. Half the width of "1 Svit" on one line, so
              it is not the thing that runs off the edge if anything upstream
              regresses. Absolute, so a card with a record and a card without
              centre their content identically. */}
          {option.stat ? (
            <span
              className="absolute flex flex-col items-end text-right"
              style={{ top: CARD_PAD_PX, right: CARD_PAD_PX }}
            >
              <span className="t-row tnum">{option.stat.value}</span>
              <span className="t-caption text-[var(--muted)]">
                {option.stat.label}
              </span>
            </span>
          ) : null}

          <span className="block min-w-0">
            <span className="t-option block">{option.name}</span>
            <span
              className="t-body block text-[var(--muted)]"
              style={{ marginTop: NAME_GAP_PX }}
            >
              {option.description}
            </span>
            <span className="flex" style={{ marginTop: PREVIEW_GAP_PX }} aria-hidden>
              {option.preview}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
