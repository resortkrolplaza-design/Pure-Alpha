// =============================================================================
// Loyal App -- TypeScript Types
// Matches the API response shape from GET /api/loyal/portal/{token}
// =============================================================================

// -- API Response Envelope ----------------------------------------------------

export interface ApiResponse<T> {
  status: "success" | "error";
  data?: T;
  errorMessage?: string;
  errors?: Record<string, string[]>;
}

// -- Portal Data (full GET / response) ----------------------------------------

export interface PortalData {
  member: MemberData;
  hotel: HotelData;
  program: ProgramData;
  tier: TierData | null;
  tiers: TierData[];
  recentTransactions: TransactionData[];
  recentRedemptions: RedemptionData[];
  gallery: GalleryImageData[];
  faq: FaqData[];
  attractions: AttractionData[];
  services: ServiceData[];
  socialLinks: SocialLinkData[];
  expiringPoints: ExpiringPointsData | null;
  cheapestReward: CheapestRewardData | null;
  nextTier: NextTierData | null;
  globalTier: GlobalTierData | null;
  globalTiers: GlobalTierData[];
  globalStats: GlobalStatsData | null;
  nextGlobalTier: GlobalTierData | null;
}

// -- Member -------------------------------------------------------------------

export interface MemberData {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  memberNumber: string;
  totalPoints: number;
  availablePoints: number;
  lifetimePoints: number;
  pendingPoints: number;
  totalSpent: number;
  totalStays: number;
  enrolledAt: string;
  lastEarnedAt: string | null;
  lastRedeemedAt: string | null;
  pointsExpireAt: string | null;
  preferredLanguage: string | null;
}

// -- Tier ---------------------------------------------------------------------

export interface TierData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  badgeColor: string | null;
  badgeIcon: string | null;
  minPoints: number;
  minSpent: number | null;
  minStays: number | null;
  multiplier: number;
  discountPercent: number | null;
  benefits: unknown;
  sortOrder: number;
}

// -- Next Tier (progress display) --------------------------------------------

export interface NextTierData {
  id: string;
  name: string;
  slug: string;
  minPoints: number;
  minSpent: number | null;
  minStays: number | null;
  multiplier: number;
  discountPercent: number | null;
  benefits: unknown;
  badgeColor: string | null;
  sortOrder: number;
}

// -- Hotel --------------------------------------------------------------------

export interface HotelData {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
}

// -- Program ------------------------------------------------------------------

export interface ProgramData {
  id: string;
  programName: string;
  pointsName: string;
  pointsNameSingular: string | null;
  earningRules: unknown;
  portalWelcomeMessage: string | null;
  portalLanguage: string | null;
  portalThemeConfig: unknown;
  currencyToPointsRatio: number;
  pointsToCurrencyRatio: number;
  pointsExpireAfterDays: number | null;
  currency: string | null;
}

// -- Transaction --------------------------------------------------------------

export interface TransactionData {
  id: string;
  type: "EARN" | "REDEEM" | "EXPIRE" | "ADJUST" | "TRANSFER";
  source: string;
  points: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  multiplier: number | null;
  createdAt: string;
}

// -- Redemption ---------------------------------------------------------------

export interface RedemptionData {
  id: string;
  rewardName: string;
  rewardCategory: string | null;
  rewardImageUrl: string | null;
  pointsSpent: number;
  status: "PENDING" | "FULFILLED" | "CANCELLED" | "EXPIRED";
  redemptionCode: string;
  fulfilledAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// -- Expiring Points ----------------------------------------------------------

export interface ExpiringPointsData {
  totalPoints: number;
  earliestExpiry: string;
}

// -- Cheapest Reward ----------------------------------------------------------

export interface CheapestRewardData {
  pointsCost: number;
  name: string;
}

// -- Reward -------------------------------------------------------------------

export interface RewardData {
  id: string;
  name: string;
  description: string | null;
  category: string;
  pointsCost: number;
  imageUrl: string | null;
  status: string;
  totalStock: number | null;
  usedStock: number;
  sortOrder: number;
  featured: boolean;
  minTierSlug: string | null;
  estimatedValue: number | null;
  canRedeem: boolean;
  reasonsBlocked: string[];
  validFrom: string | null;
  validUntil: string | null;
}

// -- Challenge ----------------------------------------------------------------

export interface ChallengeData {
  id: string;
  name: string;
  description: string | null;
  type: string;
  targetValue: number;
  rewardPoints: number;
  startDate: string | null;
  endDate: string | null;
  imageUrl: string | null;
  progress: {
    currentValue: number;
    completedAt: string | null;
    rewardedAt: string | null;
  } | null;
  percentComplete: number;
}

// -- Badge --------------------------------------------------------------------

export interface BadgeData {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  emoji: string | null;
  category: string | null;
  isEarned: boolean;
  earnedAt: string | null;
}

// -- Scratch Card -------------------------------------------------------------

export interface ScratchCardData {
  id: string;
  prizeType: string;
  prizeValue: number;
  prizeLabel: string | null;
  expiresAt: string | null;
  scratchedAt: string | null;
  claimedAt: string | null;
  createdAt: string;
}

/** Derive display status from scratch card date fields. */
export function deriveScratchCardStatus(
  card: ScratchCardData,
): "AVAILABLE" | "SCRATCHED" | "CLAIMED" | "EXPIRED" {
  if (card.claimedAt) return "CLAIMED";
  if (card.expiresAt && new Date(card.expiresAt) < new Date()) return "EXPIRED";
  if (card.scratchedAt) return "SCRATCHED";
  return "AVAILABLE";
}

// -- Message ------------------------------------------------------------------

export interface MessageData {
  id: string;
  body: string;
  isGuest: boolean;
  sender: {
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
  };
  createdAt: string;
}

// -- Gallery Image ------------------------------------------------------------

export interface GalleryImageData {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  alt: string | null;
  caption: string | null;
  category: string | null;
}

// -- FAQ ----------------------------------------------------------------------

export interface FaqData {
  id: string;
  question: string;
  answer: string;
}

// -- Attraction ---------------------------------------------------------------

export interface AttractionData {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  distance: string | null;
  category: string | null;
  mapUrl: string | null;
  websiteUrl: string | null;
}

// -- Service ------------------------------------------------------------------

export interface ServiceData {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  category: string | null;
  images: unknown;
}

// -- Global Tier Definition ---------------------------------------------------

export interface GlobalTierData {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  minPoints: number;
  badgeColor: string;
  badgeIcon: string | null;
  benefits: unknown;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// -- Global Stats (cross-hotel) -----------------------------------------------

export interface GlobalStatsData {
  lifetimePoints: number;
  totalSpent: number;
  totalStays: number;
}

// -- Offer (exclusive, tier-gated) --------------------------------------------

export interface OfferData {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  minGlobalTierSlug: string | null;
  category: string;
  bookingUrl: string | null;
  promoCode: string | null;
  discountPercent: number | null;
  discountFixed: number | null;
  validFrom: string | null;
  validUntil: string | null;
  maxRedemptions: number | null;
  usedCount: number;
  sortOrder: number;
  featured: boolean;
  isUnlocked: boolean;
  reasonsBlocked: string[];
}

// -- Social Link --------------------------------------------------------------

export interface SocialLinkData {
  id: string;
  platform: string;
  url: string;
  accountUsername: string | null;
}
