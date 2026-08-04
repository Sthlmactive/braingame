"use client";

import { useCallback, useEffect } from "react";
import type { Lang, T } from "@/lib/i18n";

/**
 * The on screen keyboard. No native <input> is ever used for letter entry, so
 * the iOS keyboard never appears and never resizes the viewport mid game.
 *
 * Swedish is the real Swedish layout: Å closes the top row, Ö and Ä close the
 * home row. English is plain QWERTY.
 */

export type KeyState = "unknown" | "correct" | "present" | "absent";

const LAYOUTS: Record<Lang, string[][]> = {
  en: [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"],
  ],
  sv: [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "å"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ö", "ä"],
    ["z", "x", "c", "v", "b", "n", "m"],
  ],
};

const KEY_BG: Record<KeyState, string> = {
  unknown: "var(--surface)",
  correct: "var(--correct)",
  present: "var(--present)",
  absent: "var(--absent)",
};

const KEY_FG: Record<KeyState, string> = {
  unknown: "var(--text)",
  correct: "var(--ink)",
  present: "var(--ink)",
  absent: "var(--muted)",
};

export interface KeyboardProps {
  lang: Lang;
  t: T;
  onLetter: (letter: string) => void;
  onEnter?: () => void;
  onDelete?: () => void;
  /** Per letter feedback. Ignored entirely when `showStates` is false. */
  states?: Record<string, KeyState>;
  /** Level 10 of Five turns the letter colours off. */
  showStates?: boolean;
  /** Letters that cannot be played at all, e.g. outside a Hive's seven. */
  enabledLetters?: ReadonlySet<string>;
  disabled?: boolean;
  /** Hardware keyboard support, handy on a desktop but never required. */
  captureHardware?: boolean;
}

export function Keyboard({
  lang,
  t,
  onLetter,
  onEnter,
  onDelete,
  states,
  showStates = true,
  enabledLetters,
  disabled = false,
  captureHardware = true,
}: KeyboardProps) {
  const rows = LAYOUTS[lang];

  const handleLetter = useCallback(
    (l: string) => {
      if (disabled) return;
      if (enabledLetters && !enabledLetters.has(l)) return;
      onLetter(l);
    },
    [disabled, enabledLetters, onLetter],
  );

  useEffect(() => {
    if (!captureHardware) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        if (onEnter) {
          e.preventDefault();
          if (!disabled) onEnter();
        }
        return;
      }
      if (e.key === "Backspace") {
        if (onDelete) {
          e.preventDefault();
          if (!disabled) onDelete();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k.length === 1 && LAYOUTS[lang].some((r) => r.includes(k))) {
        e.preventDefault();
        handleLetter(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lang, onEnter, onDelete, handleLetter, disabled, captureHardware]);

  return (
    <div
      className="game-surface w-full select-none px-1"
      style={{ paddingBottom: "max(var(--safe-b), 6px)" }}
      role="group"
      aria-label={t("submit")}
    >
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        return (
          <div key={i} className="mb-[6px] flex w-full justify-center gap-[5px]">
            {isLast && onDelete ? (
              <ActionKey
                label={t("del")}
                glyph="⌫"
                onPress={onDelete}
                disabled={disabled}
              />
            ) : null}
            {row.map((letter) => {
              const st = showStates ? (states?.[letter] ?? "unknown") : "unknown";
              const off = Boolean(enabledLetters && !enabledLetters.has(letter));
              return (
                <button
                  key={letter}
                  type="button"
                  className="tile min-w-0 flex-1 text-[1.05rem] font-semibold"
                  style={{
                    height: 50,
                    maxWidth: 46,
                    backgroundColor: off ? "transparent" : KEY_BG[st],
                    color: off ? "var(--line)" : KEY_FG[st],
                    borderRadius: 8,
                  }}
                  onPointerDown={(e) => {
                    e.currentTarget.dataset.pressed = "true";
                  }}
                  onPointerUp={(e) => {
                    delete e.currentTarget.dataset.pressed;
                  }}
                  onPointerCancel={(e) => {
                    delete e.currentTarget.dataset.pressed;
                  }}
                  onPointerLeave={(e) => {
                    delete e.currentTarget.dataset.pressed;
                  }}
                  onClick={() => handleLetter(letter)}
                  disabled={disabled || off}
                  aria-label={letter}
                >
                  <span className="tile-glyph uppercase">{letter}</span>
                </button>
              );
            })}
            {isLast && onEnter ? (
              <ActionKey
                label={t("submit")}
                glyph={t("submit")}
                onPress={onEnter}
                disabled={disabled}
                wide
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ActionKey({
  label,
  glyph,
  onPress,
  disabled,
  wide = false,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  disabled: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className="tile shrink-0 px-2 font-semibold"
      style={{
        height: 50,
        minWidth: wide ? 62 : 50,
        fontSize: wide ? "0.78rem" : "1.05rem",
        backgroundColor: "var(--surface)",
        color: "var(--text)",
        borderRadius: 8,
        textTransform: wide ? "uppercase" : "none",
        letterSpacing: wide ? "0.04em" : undefined,
      }}
      onPointerDown={(e) => {
        e.currentTarget.dataset.pressed = "true";
      }}
      onPointerUp={(e) => {
        delete e.currentTarget.dataset.pressed;
      }}
      onPointerCancel={(e) => {
        delete e.currentTarget.dataset.pressed;
      }}
      onPointerLeave={(e) => {
        delete e.currentTarget.dataset.pressed;
      }}
      onClick={() => {
        if (!disabled) onPress();
      }}
      disabled={disabled}
      aria-label={label}
    >
      <span className="tile-glyph">{glyph}</span>
    </button>
  );
}

/** The set of letters a language's keyboard can produce. */
export function keyboardLetters(lang: Lang): string[] {
  return LAYOUTS[lang].flat();
}
