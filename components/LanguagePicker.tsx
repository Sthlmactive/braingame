"use client";

import { useApp } from "@/components/AppProvider";
import { LANGS, type Lang } from "@/lib/i18n";

/**
 * The language picker, shared by Five and Mini.
 *
 * Two choices, so two cards, each half of what is left under the header.
 *
 * Under each name sits the alphabet it plays with — "A – Ö" against "A – Z".
 * That is the whole difference between the two options as far as this app is
 * concerned: Swedish has three more letters, the keyboard changes shape, and
 * å ä ö are the letters you will be hunting for. A flag would say which
 * country; this says what changes.
 */

/** A comfortable target, for a screen too short for the cards to fill it. */
const MIN_CARD_PX = 88;

const ALPHABET: Record<Lang, string> = {
  sv: "A – Ö",
  en: "A – Z",
};

/** Letterspacing pushes the last letter off centre; the indent puts it back. */
const ALPHABET_TRACKING = "0.22em";

export function LanguagePicker({ onSelect }: { onSelect: (lang: Lang) => void }) {
  const { t } = useApp();

  return (
    <div className="safe-bottom flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 pt-1 pb-2">
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onSelect(code)}
          className="press flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden px-4 py-3"
          style={{
            minHeight: MIN_CARD_PX,
            background: "var(--raised)",
            borderRadius: "var(--radius-panel)",
          }}
        >
          <span className="t-choice">
            {t(code === "sv" ? "langSv" : "langEn")}
          </span>
          <span
            className="t-body text-[var(--muted)]"
            style={{
              letterSpacing: ALPHABET_TRACKING,
              textIndent: ALPHABET_TRACKING,
            }}
          >
            {ALPHABET[code]}
          </span>
        </button>
      ))}
    </div>
  );
}
