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
  if (!raw.member || !raw.program || !raw.hotel) {
    throw new Error("Invalid init response");
  }

  const program = raw.program as ProgramData;

  // Sanitize earningRules: flatten nested objects to primitives so React
  // never attempts to render an object like {flatPoints: 100} as a child.
  // The mobile app does not render earningRules, but Expo Router / RN Web
  // internals can traverse the entire store and crash on nested objects.
  const safeEarningRules: Record<string, unknown> = {};
  if (program.earningRules && typeof program.earningRules === "object") {
    for (const [key, val] of Object.entries(program.earningRules)) {
      if (val !== null && typeof val === "object") {
        // Extract flatPoints or first numeric value as the display-safe value
        const obj = val as Record<string, unknown>;
        safeEarningRules[key] = obj.flatPoints ?? obj.pointsPerCurrency ?? Object.values(obj).find(v => typeof v === "number") ?? 0;
      } else {
        safeEarningRules[key] = val;
      }
    }
  }

  return {
    member: {
      ...(raw.member as MemberData),
      tier: (raw.tier as TierData) ?? null,
      expiringPoints: (raw.expiringPoints as MemberData["expiringPoints"]) ?? null,
      cheapestReward: (raw.cheapestReward as MemberData["cheapestReward"]) ?? null,
    },
    program: {
      ...program,
      currency: program.currency ?? undefined,
      earningRules: safeEarningRules,
    },
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
