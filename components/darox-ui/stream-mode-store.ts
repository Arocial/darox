import { create } from "zustand";

export type StreamModePreference = "auto" | "full" | "concise";
export type StreamMode = Exclude<StreamModePreference, "auto">;

const STREAM_MODE_PREFERENCE_KEY = "darox_stream_mode_preference";
const MOBILE_VIEWPORT_QUERY = "(max-width: 767px)";

function getStartupAutoMode(): StreamMode {
  if (typeof window === "undefined") return "full";
  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches ? "concise" : "full";
}

function getSavedPreference(): StreamModePreference {
  if (typeof window === "undefined") return "auto";
  const saved = localStorage.getItem(STREAM_MODE_PREFERENCE_KEY);
  return saved === "full" || saved === "concise" ? saved : "auto";
}

const startupAutoMode = getStartupAutoMode();
const initialPreference = getSavedPreference();

function resolveMode(preference: StreamModePreference): StreamMode {
  return preference === "auto" ? startupAutoMode : preference;
}

type StreamModeState = {
  preference: StreamModePreference;
  resolvedMode: StreamMode;
  setPreference: (preference: StreamModePreference) => void;
};

export const useStreamModeStore = create<StreamModeState>((set) => ({
  preference: initialPreference,
  resolvedMode: resolveMode(initialPreference),
  setPreference: (preference) => {
    localStorage.setItem(STREAM_MODE_PREFERENCE_KEY, preference);
    set({ preference, resolvedMode: resolveMode(preference) });
  },
}));
