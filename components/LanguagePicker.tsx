"use client";

import { useApp } from "@/components/AppProvider";
import { LANGS, type Lang } from "@/lib/i18n";
import { CARD_GAP_PX, CARD_PAD_PX } from "@/lib/picker";

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

const ALPHABET: Record<Lang, string> = {
  sv: "A – Ö",
  en: "A – Z",
};

/** Letterspacing pushes the last letter off centre; the indent puts it back. */
const ALPHABET_TRACKING = "0.22em";

export function LanguagePicker({ onSelect }: { onSelect: (lang: Lang) => void }) {
  const { t } = useApp();

  return (
    <div
      className="safe-bottom flex min-h-0 min-w-0 flex-1 flex-col pt-1 pb-2"
      style={{ gap: CARD_GAP_PX }}
    >
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onSelect(code)}
          className="press flex min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden"
          style={{
            padding: CARD_PAD_PX,
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
