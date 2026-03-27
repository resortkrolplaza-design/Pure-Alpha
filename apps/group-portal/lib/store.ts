// =============================================================================
// Group Portal — Zustand Store
// =============================================================================

import { create } from "zustand";

// ── App Store (global mode + auth state) -----

interface AppState {
  mode: "group" | null;
  isAuthenticated: boolean;
  groupTrackingId: string | null;
  lang: "pl" | "en";
  setMode: (mode: "group") => void;
  setAuthenticated: (auth: boolean) => void;
  setGroupTrackingId: (id: string | null) => void;
  setLang: (lang: "pl" | "en") => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: null,
  isAuthenticated: false,
  groupTrackingId: null,
  lang: "pl",
  setMode: (mode) => set({ mode }),
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setGroupTrackingId: (groupTrackingId) => set({ groupTrackingId }),
  setLang: (lang) => set({ lang }),
  reset: () => set({ mode: null, isAuthenticated: false, groupTrackingId: null }),
}));
