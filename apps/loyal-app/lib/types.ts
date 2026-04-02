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
  tier: TierData;
  tiers: TierData[];
  transactions: TransactionData[];
  redemptions: RedemptionData[];
  rewards: RewardData[];
  challenges: ChallengeData[];
  badges: BadgeData[];
  scratchCards: ScratchCardData[];
  gallery: GalleryImageData[];
  faq: FaqData[];
  attractions: AttractionData[];
  services: ServiceData[];
  socialLinks: SocialLinkData[];
  messages: MessageData[];
  hasMoreTransactions: boolean;
  totalTransactions: number;
}

// -- Member -------------------------------------------------------------------

export interface MemberData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  memberSince: string;
  totalStays: number;
  pointsAvailable: number;
  pointsLifetime: number;
  pointsPending: number;
  totalSpend: number;
  tierId: string;
  tierName: string;
  tierColor: string | null;
  tierIcon: string | null;
  multiplier: number;
  discount: number;
  benefits: string[];
  nextTier: {
    name: string;
    pointsRequired: number;
    spendRequired: number;
    staysRequired: number;
    pointsRemaining: number;
    spendRemaining: number;
    staysRemaining: number;
  } | null;
  pointsExpiry: {
    amount: number;
    expiresAt: string;
  } | null;
}

// -- Tier ---------------------------------------------------------------------

export interface TierData {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  minPoints: number;
  minSpend: number;
  minStays: number;
  multiplier: number;
  discount: number;
  benefits: string[];
  isCurrent: boolean;
}

// -- Hotel --------------------------------------------------------------------

export interface HotelData {
  id: string;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  currency: string;
}

// -- Program ------------------------------------------------------------------

export interface ProgramData {
  id: string;
  name: string;
  pointsName: string;
  description: string | null;
  termsUrl: string | null;
  isActive: boolean;
}

// -- Transaction --------------------------------------------------------------

export interface TransactionData {
  id: string;
  type: "EARN" | "REDEEM" | "EXPIRE" | "ADJUST" | "TRANSFER";
  source: string;
  amount: number;
  balance: number;
  description: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

// -- Redemption ---------------------------------------------------------------

export interface RedemptionData {
  id: string;
  rewardId: string;
  rewardName: string;
  pointsCost: number;
  redemptionCode: string;
  status: "PENDING" | "FULFILLED" | "CANCELLED" | "EXPIRED";
  createdAt: string;
  fulfilledAt: string | null;
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
  alt: string | null;
  caption: string | null;
  order: number;
}

// -- FAQ ----------------------------------------------------------------------

export interface FaqData {
  id: string;
  question: string;
  answer: string;
  order: number;
}

// -- Attraction ---------------------------------------------------------------

export interface AttractionData {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  distance: string | null;
  category: string | null;
  order: number;
}

// -- Service ------------------------------------------------------------------

export interface ServiceData {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  category: string | null;
  order: number;
}

// -- Social Link --------------------------------------------------------------

export interface SocialLinkData {
  id: string;
  platform: string;
  url: string;
  label: string | null;
}
