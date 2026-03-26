// =============================================================================
// Pure Alpha Mobile — Zustand Stores
// =============================================================================

import { create } from "zustand";
import type {
  AppMode, MemberData, ProgramData, HotelData, TierData, PortalInitData,
  GalleryImageData, FaqData, AttractionData, ServiceData, SocialLinkData,
} from "./types";

// ── App Store (global mode + auth state) ─────────────────────────────────────

interface AppState {
  mode: AppMode | null;
  isAuthenticated: boolean;
  portalToken: string | null;
  groupTrackingId: string | null;
  lang: "pl" | "en";
  setMode: (mode: AppMode) => void;
  setAuthenticated: (auth: boolean) => void;
  setPortalToken: (token: string | null) => void;
  setGroupTrackingId: (id: string | null) => void;
  setLang: (lang: "pl" | "en") => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: null,
  isAuthenticated: false,
  portalToken: null,
  groupTrackingId: null,
  lang: "pl",
  setMode: (mode) => set({ mode }),
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setPortalToken: (portalToken) => set({ portalToken }),
  setGroupTrackingId: (groupTrackingId) => set({ groupTrackingId }),
  setLang: (lang) => set({ lang }),
  reset: () => set({ mode: null, isAuthenticated: false, portalToken: null, groupTrackingId: null }),
}));

// ── Guest Portal Store ───────────────────────────────────────────────────────

interface GuestState {
  member: MemberData | null;
  program: ProgramData | null;
  hotel: HotelData | null;
  tiers: TierData[];
  nextTier: TierData | null;
  gallery: GalleryImageData[];
  faq: FaqData[];
  attractions: AttractionData[];
  services: ServiceData[];
  socialLinks: SocialLinkData[];
  setPortalData: (data: PortalInitData) => void;
  updateMember: (member: MemberData) => void;
  reset: () => void;
}

export const useGuestStore = create<GuestState>((set) => ({
  member: null,
  program: null,
  hotel: null,
  tiers: [],
  nextTier: null,
  gallery: [],
  faq: [],
  attractions: [],
  services: [],
  socialLinks: [],
  setPortalData: (data) =>
    set({
      member: data.member,
      program: data.program,
      hotel: data.hotel,
      tiers: data.tiers,
      nextTier: data.nextTier,
      gallery: data.gallery ?? [],
      faq: data.faq ?? [],
      attractions: data.attractions ?? [],
      services: data.services ?? [],
      socialLinks: data.socialLinks ?? [],
    }),
  updateMember: (member) => set({ member }),
  reset: () => set({
    member: null, program: null, hotel: null, tiers: [], nextTier: null,
    gallery: [], faq: [], attractions: [], services: [], socialLinks: [],
  }),
}));
