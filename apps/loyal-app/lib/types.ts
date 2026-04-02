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
  isActive: boolean;
  canRedeem: boolean;
  reasonsBlocked: string[];
  stock: number | null;
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
  currentValue: number;
  rewardPoints: number;
  rewardDescription: string | null;
  startDate: string;
  endDate: string;
  isCompleted: boolean;
  completedAt: string | null;
  icon: string | null;
}

// -- Badge --------------------------------------------------------------------

export interface BadgeData {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  imageUrl: string | null;
  isEarned: boolean;
  earnedAt: string | null;
  criteria: string | null;
}

// -- Scratch Card -------------------------------------------------------------

export interface ScratchCardData {
  id: string;
  status: "AVAILABLE" | "SCRATCHED" | "CLAIMED" | "EXPIRED";
  prizeType: "POINTS" | "DISCOUNT" | "REWARD" | "NONE" | null;
  prizeValue: number | null;
  prizeDescription: string | null;
  expiresAt: string | null;
  scratchedAt: string | null;
  claimedAt: string | null;
}

// -- Message ------------------------------------------------------------------

export interface MessageData {
  id: string;
  content: string;
  senderType: "GUEST" | "HOTEL" | "SYSTEM";
  senderName: string | null;
  createdAt: string;
  readAt: string | null;
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

// -- Social Link --------------------------------------------------------------

export interface SocialLinkData {
  id: string;
  platform: string;
  url: string;
  accountUsername: string | null;
}
