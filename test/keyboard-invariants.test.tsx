// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Keyboard } from "@/components/Keyboard";
import { hintKey } from "@/games/mini/engine";
import { DIFFICULTIES } from "@/lib/difficulty";
import { LANGS, translator } from "@/lib/i18n";
import { MINI_HINTS } from "@/lib/mini";

/**
 * The keyboard does not change shape mid-round.
 *
 * The bug: the Enter key rendered as `{isLast && onEnter ? … : null}`, so its
 * *presence* was inferred from whether the callback happened to be defined at
 * that moment. Mini passed `onEnter={hintsLeft > 0 ? onHint : undefined}`, so
 * spending the last hint unmounted the key and the remaining keys spread out
 * to fill the row — the key you were aiming at moved while you were typing.
 *
 * Nothing here measures pixels; jsdom has no layout. It measures the two
 * things that decide the layout: which keys exist, and what is written on
 * them. If both are invariant across the round, the row cannot reflow.
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Every key in the bottom row, as written on it. */
function bottomRowKeys(): string[] {
  const rows = container!.querySelectorAll(":scope > div > div");
  const last = rows[rows.length - 1];
  if (!last) throw new Error("no rows rendered");
  return Array.from(last.querySelectorAll("button")).map(
    (b) => b.textContent ?? "",
  );
}

function disabledKeys(): string[] {
  const rows = container!.querySelectorAll(":scope > div > div");
  const last = rows[rows.length - 1];
  return Array.from(last!.querySelectorAll("button"))
    .filter((b) => b.disabled)
    .map((b) => b.textContent ?? "");
}

function renderKeyboard(props: {
  onEnter?: () => void;
  enterLabel?: string;
}): void {
  const t = translator("sv");
  act(() => {
    root!.render(
      <Keyboard
        lang="sv"
        t={t}
        onLetter={() => {}}
        onDelete={() => {}}
        showStates={false}
        captureHardware={false}
        {...props}
      />,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("the Enter slot", () => {
  it("stays in the row when its action goes away, if it is labelled", () => {
    renderKeyboard({ onEnter: () => {}, enterLabel: "Ledtråd 2" });
    const before = bottomRowKeys();
    expect(before).toContain("Ledtråd 2");
    expect(disabledKeys()).toEqual([]);

    // The last hint is spent: no action left, same key.
    renderKeyboard({ onEnter: undefined, enterLabel: "Ledtråd 0" });
    const after = bottomRowKeys();
    expect(after).toHaveLength(before.length);
    expect(disabledKeys()).toEqual(["Ledtråd 0"]);
  });

  it("reproduces the old fault when the label is absent", () => {
    // Not a regression guard — a record of the shape of the bug. Without a
    // label the key is still inferred from the callback, which is what Five
    // and Grid rely on, and they always pass one.
    renderKeyboard({ onEnter: () => {} });
    const withAction = bottomRowKeys().length;
    renderKeyboard({ onEnter: undefined });
    expect(bottomRowKeys().length).toBe(withAction - 1);
  });

  it("is absent all round when there is no label and no action", () => {
    renderKeyboard({});
    expect(bottomRowKeys().every((k) => !k.startsWith("Ledtråd"))).toBe(true);
  });
});

describe("Mini's hint key across a whole round", () => {
  it.each(DIFFICULTIES)(
    "%s keeps one key set from first keystroke to last hint",
    (difficulty) => {
      const granted = MINI_HINTS[difficulty];
      const t = translator("sv");

      // Walk the round: full hints down to none.
      const states = Array.from({ length: granted + 1 }, (_, i) =>
        hintKey(granted, granted - i, t("hint")),
      );

      if (granted === 0) {
        // Absent for the entire round is consistent; absent sometimes is not.
        expect(states.every((s) => s === null)).toBe(true);
        return;
      }

      // Present at every point in the round.
      expect(states.every((s) => s !== null)).toBe(true);
      // Identical width at every point: same label length, digits only.
      const lengths = new Set(states.map((s) => s!.label.length));
      expect(lengths.size, `labels: ${states.map((s) => s!.label).join(", ")}`).toBe(1);
      // Enabled until the last one is spent, then disabled — never gone.
      expect(states.map((s) => s!.enabled)).toEqual([
        ...Array.from({ length: granted }, () => true),
        false,
      ]);
    },
  );

  it.each(LANGS)("renders the same key count in %s at every difficulty", (lang) => {
    const t = translator(lang);
    for (const difficulty of DIFFICULTIES) {
      const granted = MINI_HINTS[difficulty];
      const counts = new Set<number>();
      const labels = new Set<string>();
      for (let left = granted; left >= 0; left--) {
        const hint = hintKey(granted, left, t("hint"));
        renderKeyboard({
          onEnter: hint?.enabled ? () => {} : undefined,
          enterLabel: hint?.label,
        });
        counts.add(bottomRowKeys().length);
        labels.add(bottomRowKeys().join("|").replace(/\d/g, "#"));
      }
      expect(counts.size, `${lang}/${difficulty} changed key count`).toBe(1);
      expect(labels.size, `${lang}/${difficulty} changed key labels`).toBe(1);
    }
  });

  it("says what it does, and does not say Klar", () => {
    for (const lang of LANGS) {
      const t = translator(lang);
      const key = hintKey(2, 2, t("hint"));
      expect(key!.label).toContain(t("hint"));
      expect(key!.label).not.toContain(t("submit"));
      expect(key!.label).toMatch(/\d$/);
    }
  });
});

describe("Five's Enter key", () => {
  it("is present throughout, because its action never goes away", () => {
    // Five submits a guess, so `onEnter` is stable for the whole game and the
    // key is unconditionally present. Guarding it here so a future change that
    // makes Five's Enter conditional trips this rather than shipping.
    renderKeyboard({ onEnter: () => {} });
    const keys = bottomRowKeys();
    const t = translator("sv");
    expect(keys).toContain(t("submit"));
    expect(keys).toContain("⌫");
  });
});
