// =============================================================================
// Group Portal — Zustand Store
// =============================================================================

import { create } from "zustand";
import type { PortalRole } from "./types";

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
  portalRole: PortalRole;
  setMode: (mode: "group") => void;
  setAuthenticated: (auth: boolean) => void;
  setGroupTrackingId: (id: string | null) => void;
  setLang: (lang: "pl" | "en") => void;
  setGuest: (guest: GuestIdentity | null) => void;
  setRsvpTokenState: (token: string | null) => void;
  setPortalRole: (role: PortalRole) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: null,
  isAuthenticated: false,
  groupTrackingId: null,
  lang: "pl",
  guest: null,
  rsvpToken: null,
  portalRole: "participant" as PortalRole,
  setMode: (mode) => set({ mode }),
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setGroupTrackingId: (groupTrackingId) => set({ groupTrackingId }),
  setLang: (lang) => set({ lang }),
  setGuest: (guest) => set({ guest }),
  setRsvpTokenState: (rsvpToken) => set({ rsvpToken }),
  setPortalRole: (portalRole) => set({ portalRole }),
  reset: () => set({ mode: null, isAuthenticated: false, groupTrackingId: null, lang: "pl", guest: null, rsvpToken: null, portalRole: "participant" as PortalRole }),
}));
