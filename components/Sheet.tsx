"use client";

import { useEffect, type ReactNode } from "react";

/** A bottom sheet. Used by settings, results and confirmations. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  dismissable = true,
}: {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!open || !dismissable || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissable, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="fade-enter absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--ink) 55%, transparent)" }}
        onClick={dismissable ? onClose : undefined}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-enter relative w-full max-w-[560px]"
        style={{
          background: "var(--paper)",
          borderTopLeftRadius: "var(--radius-sheet)",
          borderTopRightRadius: "var(--radius-sheet)",
          borderTop: "1px solid var(--line)",
          paddingBottom: "max(var(--safe-b), 16px)",
          paddingLeft: "max(var(--safe-l), 20px)",
          paddingRight: "max(var(--safe-r), 20px)",
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <span
            className="block h-1 w-9 rounded-full"
            style={{ background: "var(--line)" }}
          />
        </div>
        {title ? (
          <h2 className="t-title pt-2 pb-3">{title}</h2>
        ) : (
          <div className="pt-1" />
        )}
        {children}
      </div>
    </div>
  );
}

/** The standard full width action used inside sheets. */
export function SheetButton({
  children,
  onClick,
  variant = "quiet",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "loud" | "quiet" | "danger";
  disabled?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    loud: { background: "var(--accent)", color: "var(--on-state)" },
    quiet: {
      background: "transparent",
      color: "var(--text)",
      border: "1px solid var(--line)",
    },
    danger: {
      background: "transparent",
      color: "var(--danger)",
      border: "1px solid var(--danger)",
    },
  };
  return (
    <button
      type="button"
      className="tap w-full rounded-xl px-4 py-3 text-center text-[0.95rem] font-semibold disabled:opacity-40"
      style={styles[variant]}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
