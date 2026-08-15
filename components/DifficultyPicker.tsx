"use client";

import type { ReactNode } from "react";
import type { Difficulty } from "@/lib/difficulty";

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

/** A comfortable target, for a screen too short for the cards to fill it. */
const MIN_CARD_PX = 88;

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
    <div className="safe-bottom flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 pt-1 pb-2">
      {options.map((option) => (
        <button
          key={option.difficulty}
          type="button"
          onClick={() => onSelect(option.difficulty)}
          className="press relative flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-hidden px-4 py-3 text-left"
          style={{
            minHeight: MIN_CARD_PX,
            background: "var(--raised)",
            borderRadius: "var(--radius-panel)",
          }}
        >
          {option.stat ? (
            <span className="t-caption absolute top-3 right-4 text-[var(--muted)]">
              <span className="tnum">{option.stat.value}</span> {option.stat.label}
            </span>
          ) : null}

          <span className="block min-w-0">
            <span className="t-option block">{option.name}</span>
            <span
              className="t-body block text-[var(--muted)]"
              style={{ marginTop: 3 }}
            >
              {option.description}
            </span>
            <span className="flex" style={{ marginTop: 12 }} aria-hidden>
              {option.preview}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
