"use client";

import { useState } from "react";
import { Screen } from "@/components/Screen";
import { Sheet, SheetButton } from "@/components/Sheet";
import { useApp } from "@/components/AppProvider";
import { LANGS } from "@/lib/i18n";
import type { MotionPref } from "@/lib/storage";
import { play } from "@/lib/sound";

export default function SettingsPage() {
  const { t, settings, setLang, setSound, setMotion, resetAll } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <Screen title={t("settings")}>
      <div className="flex flex-1 flex-col gap-6 pt-2 pb-10">
        <Row label={t("language")}>
          <Segmented
            options={LANGS.map((l) => ({
              value: l,
              label: t(l === "sv" ? "langSv" : "langEn"),
            }))}
            value={settings.lang}
            onChange={(v) => {
              play("tap");
              setLang(v);
            }}
          />
        </Row>

        <Row label={t("sound")}>
          <Segmented
            options={[
              { value: "on", label: t("soundOn") },
              { value: "off", label: t("soundOff") },
            ]}
            value={settings.sound ? "on" : "off"}
            onChange={(v) => {
              setSound(v === "on");
              if (v === "on") play("tap");
            }}
          />
        </Row>

        <Row label={t("motion")}>
          <Segmented
            options={[
              { value: "system", label: t("motionSystem") },
              { value: "full", label: t("motionFull") },
              { value: "reduced", label: t("motionReduced") },
            ]}
            value={settings.motion}
            onChange={(v) => {
              play("tap");
              setMotion(v as MotionPref);
            }}
          />
        </Row>

        <div className="mt-auto pt-6">
          <div className="pb-2 text-xs tracking-wide text-[var(--muted)] uppercase">
            {t("wordData")}
          </div>
          <p className="pb-4 text-[0.7rem] leading-relaxed text-[var(--muted)]">
            {t("wordDataSv")}
            <br />
            {t("wordDataEn")}
            <br />
            {t("wordDataFreq")}
            <br />
            {t("wordDataFilter")}
          </p>
          {done ? (
            <p className="pb-2 text-center text-sm" style={{ color: "var(--correct)" }}>
              {t("progressReset")}
            </p>
          ) : null}
          <SheetButton variant="danger" onClick={() => setConfirming(true)}>
            {t("resetProgress")}
          </SheetButton>
        </div>
      </div>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t("resetProgress")}
      >
        <p className="pb-4 text-sm text-[var(--muted)]">{t("resetProgressBody")}</p>
        <div className="flex flex-col gap-2 pb-2">
          <SheetButton
            variant="danger"
            onClick={() => {
              resetAll();
              setConfirming(false);
              setDone(true);
            }}
          >
            {t("resetProgressDo")}
          </SheetButton>
          <SheetButton onClick={() => setConfirming(false)}>{t("cancel")}</SheetButton>
        </div>
      </Sheet>
    </Screen>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="pb-2 text-xs tracking-wide text-[var(--muted)] uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: V; label: string }>;
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <div
      className="flex gap-1 rounded-xl p-1"
      style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
      role="group"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            className="tap flex-1 rounded-lg px-3 py-2 text-sm font-semibold"
            style={{
              background: on ? "var(--accent)" : "transparent",
              color: on ? "var(--on-state)" : "var(--muted)",
            }}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
