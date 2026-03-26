// =============================================================================
// Shared helpers for portal data mapping
// =============================================================================

import type {
  PortalInitData, MemberData, TierData, ProgramData, HotelData,
  GalleryImageData, FaqData, AttractionData, ServiceData, SocialLinkData,
} from "./types";

// Map raw API /portal/init response to typed PortalInitData shape.
// Used in both auto-resume (index.tsx) and guest login (login.tsx).
export function mapInitResponse(raw: Record<string, unknown>): PortalInitData {
  return {
    member: {
      ...(raw.member as MemberData),
      tier: (raw.tier as TierData) ?? null,
      expiringPoints: (raw.expiringPoints as MemberData["expiringPoints"]) ?? null,
      cheapestReward: (raw.cheapestReward as MemberData["cheapestReward"]) ?? null,
    },
    program: raw.program as ProgramData,
    hotel: raw.hotel as HotelData,
    tiers: (raw.tiers as TierData[]) ?? [],
    nextTier: (raw.nextTier as TierData) ?? null,
    gallery: (raw.gallery as GalleryImageData[]) ?? [],
    faq: (raw.faq as FaqData[]) ?? [],
    attractions: (raw.attractions as AttractionData[]) ?? [],
    services: (raw.services as ServiceData[]) ?? [],
    socialLinks: (raw.socialLinks as SocialLinkData[]) ?? [],
  };
}
