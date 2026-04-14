// =============================================================================
// Loyal App -- Zustand Store
// =============================================================================

import { create } from "zustand";

interface LoyalState {
  isAuthenticated: boolean;
  token: string | null;
  guestJwt: string | null;
  lang: "pl" | "en";
  memberName: string | null;
  hotelName: string | null;
  programName: string | null;
  sessionExpired: boolean;
  // setters
  setAuthenticated: (v: boolean) => void;
  setToken: (v: string | null) => void;
  setGuestJwt: (v: string | null) => void;
  setLang: (v: "pl" | "en") => void;
  setMemberName: (v: string | null) => void;
  setHotelName: (v: string | null) => void;
  setProgramName: (v: string | null) => void;
  setSessionExpired: (v: boolean) => void;
  reset: () => void;
}

const initialState = {
  isAuthenticated: false,
  token: null as string | null,
  guestJwt: null as string | null,
  lang: "pl" as const,
  memberName: null as string | null,
  hotelName: null as string | null,
  programName: null as string | null,
  sessionExpired: false,
};

export const useAppStore = create<LoyalState>((set) => ({
  ...initialState,
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setToken: (token) => set({ token }),
  setGuestJwt: (guestJwt) => set({ guestJwt }),
  setLang: (lang) => set({ lang }),
  setMemberName: (memberName) => set({ memberName }),
  setHotelName: (hotelName) => set({ hotelName }),
  setProgramName: (programName) => set({ programName }),
  setSessionExpired: (sessionExpired) => set({ sessionExpired }),
  reset: () => set(initialState),
}));
