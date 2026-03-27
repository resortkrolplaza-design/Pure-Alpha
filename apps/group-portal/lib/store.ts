// =============================================================================
// Group Portal — Zustand Store
// =============================================================================

import { create } from "zustand";

// ── App Store (global mode + auth state) -----

interface GuestIdentity {
  id: string;
  firstName: string;
  lastName?: string;
  rsvpStatus: string;
}

interface AppState {
  mode: "group" | null;
  isAuthenticated: boolean;
  groupTrackingId: string | null;
  lang: "pl" | "en";
  guest: GuestIdentity | null;
  rsvpToken: string | null;
  setMode: (mode: "group") => void;
  setAuthenticated: (auth: boolean) => void;
  setGroupTrackingId: (id: string | null) => void;
  setLang: (lang: "pl" | "en") => void;
  setGuest: (guest: GuestIdentity | null) => void;
  setRsvpTokenState: (token: string | null) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: null,
  isAuthenticated: false,
  groupTrackingId: null,
  lang: "pl",
  guest: null,
  rsvpToken: null,
  setMode: (mode) => set({ mode }),
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setGroupTrackingId: (groupTrackingId) => set({ groupTrackingId }),
  setLang: (lang) => set({ lang }),
  setGuest: (guest) => set({ guest }),
  setRsvpTokenState: (rsvpToken) => set({ rsvpToken }),
  reset: () => set({ mode: null, isAuthenticated: false, groupTrackingId: null, guest: null, rsvpToken: null }),
}));
