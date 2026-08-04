"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Lang } from "@/lib/i18n";
import { translator, type T } from "@/lib/i18n";
import type { GameId, Level } from "@/lib/games";
import {
  clearState,
  defaultState,
  getRecord,
  highestCleared,
  loadState,
  recordRun,
  saveState,
  type AppState,
  type LevelRecord,
  type MotionPref,
  type RunResult,
  type Settings,
} from "@/lib/storage";
import { primeAudio, setSoundEnabled } from "@/lib/sound";

interface AppContextValue {
  ready: boolean;
  settings: Settings;
  lang: Lang;
  t: T;
  setLang: (lang: Lang) => void;
  setSound: (on: boolean) => void;
  setMotion: (pref: MotionPref) => void;
  record: (
    game: GameId,
    lang: Lang,
    level: Level,
    result: RunResult,
  ) => { record: LevelRecord; isBestScore: boolean };
  getRecordFor: (game: GameId, lang: Lang, level: Level) => LevelRecord;
  highest: (game: GameId, lang: Lang) => number;
  resetAll: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Render defaults on the server, then hydrate from localStorage. `ready`
  // lets screens hold back progress dependent chrome for one frame instead of
  // flashing the wrong state.
  const [state, setState] = useState<AppState>(defaultState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    setSoundEnabled(loaded.settings.sound);
    setReady(true);
  }, []);

  // Persist and mirror settings that the CSS needs onto <html>.
  useEffect(() => {
    if (!ready) return;
    saveState(state);
    setSoundEnabled(state.settings.sound);
    const el = document.documentElement;
    el.lang = state.settings.lang;
    if (state.settings.motion === "system") {
      delete el.dataset.reduceMotion;
    } else {
      el.dataset.reduceMotion =
        state.settings.motion === "reduced" ? "true" : "false";
    }
  }, [state, ready]);

  // The first tap anywhere unlocks audio on iOS.
  useEffect(() => {
    const once = () => primeAudio();
    window.addEventListener("pointerdown", once, { once: true });
    return () => window.removeEventListener("pointerdown", once);
  }, []);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  }, []);

  const value = useMemo<AppContextValue>(() => {
    const lang = state.settings.lang;
    return {
      ready,
      settings: state.settings,
      lang,
      t: translator(lang),
      setLang: (l) => patchSettings({ lang: l }),
      setSound: (on) => patchSettings({ sound: on }),
      setMotion: (m) => patchSettings({ motion: m }),
      record: (game, l, level, result) => {
        const next = recordRun(state, game, l, level, result);
        setState(next.state);
        return { record: next.record, isBestScore: next.isBestScore };
      },
      getRecordFor: (game, l, level) => getRecord(state, game, l, level),
      highest: (game, l) => highestCleared(state, game, l),
      resetAll: () => {
        clearState();
        setState({ ...defaultState(), settings: state.settings });
      },
    };
  }, [state, ready, patchSettings]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(AppContext);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}
