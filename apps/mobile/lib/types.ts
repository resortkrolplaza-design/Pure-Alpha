// =============================================================================
// Pure Alpha Mobile — TypeScript Types (mirrored from web API responses)
// =============================================================================

// ── API Response Envelope ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  status: "success" | "error";
  data?: T;
  errorMessage?: string;
  errors?: Record<string, string[]>;
}

// ── App Mode ─────────────────────────────────────────────────────────────────

export type AppMode = "guest" | "group" | "employee";

// ── Pure Loyal (Guest Portal) ────────────────────────────────────────────────

export interface TierData {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  minPoints: number;
  minSpent?: number | null;
  minStays?: number | null;
  multiplier: number;
  discountPercent?: number | null;
  benefits: string[] | null;
  badgeColor: string;
  badgeIcon: string | null;
  sortOrder: number;
}

export interface MemberData {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  memberNumber: string;
  availablePoints: number;
  lifetimePoints: number;
  totalPoints?: number;
  pendingPoints: number;
  totalSpent: number;
  totalStays: number;
  enrolledAt: string;
  tier: TierData | null;
  expiringPoints: { totalPoints: number; earliestExpiry: string } | null;
  cheapestReward: { pointsCost: number; name: string } | null;
}

export interface ProgramData {
  id: string;
  programName: string;
  pointsName: string;
  pointsNameSingular: string;
  portalWelcomeMessage: string | null;
  earningRules: Record<string, unknown>;
  tierEvaluationField?: string;
  portalLanguage: "pl" | "en";
  currency?: string;
}

export interface HotelData {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  city?: string;
  phone: string | null;
  email: string | null;
}

export interface GalleryImageData {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  alt: string | null;
  caption: string | null;
  category: string | null;
}

export interface FaqData {
  id: string;
  question: string;
  answer: string;
}

export interface AttractionData {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  address: string | null;
  distance: string | null;
  mapUrl: string | null;
  websiteUrl: string | null;
}

export interface ServiceData {
  id: string;
  name: string;
  description: string | null;
  publicDescription?: string | null;
  price: number | null;
  currency: string | null;
  images?: unknown;
  category?: string;
}

export interface SocialLinkData {
  id: string;
  platform: string;
  accountUsername: string | null;
  accountName?: string | null;
  url: string;
}

export interface Transaction {
  id: string;
  type: string;
  source: string;
  points: number;
  description: string | null;
  createdAt: string;
}

export interface ChallengeWithProgress {
  id: string;
  name: string;
  description: string | null;
  type: string;
  targetValue: number;
  rewardPoints: number;
  startDate: string | null;
  endDate: string | null;
  progress: { currentValue: number; completedAt: string | null } | null;
  percentComplete: number;
}

export interface BadgeEarned {
  id: string;
  badgeId: string;
  name: string;
  emoji: string | null;
  description: string | null;
  category: string;
  sortOrder: number;
  earnedAt: string;
}

export interface BadgeAvailable {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  category: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  category: string;
  pointsCost: number;
  imageUrl: string | null;
  minTierSlug: string | null;
  status: string;
  totalStock: number | null;
  usedStock: number;
  canRedeem: boolean;
  reasonsBlocked: string[];
}

export interface Message {
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

export interface ScratchCardData {
  id: string;
  status: string;
  createdAt: string;
}

export interface Prize {
  type: "POINTS" | "REWARD" | "DISCOUNT" | "NONE";
  value: number;
  label: string;
}

// ── Portal Init Response ─────────────────────────────────────────────────────

export interface PortalInitData {
  member: MemberData;
  program: ProgramData;
  hotel: HotelData;
  tiers: TierData[];
  nextTier: TierData | null;
  gallery?: GalleryImageData[];
  faq?: FaqData[];
  attractions?: AttractionData[];
  services?: ServiceData[];
  socialLinks?: SocialLinkData[];
}

// ── Group Portal ─────────────────────────────────────────────────────────────

export interface GroupPortalData {
  id: string;
  trackingId: string;
  title: string;
  status: string;
  guestListEnabled: boolean;
  dietaryEnabled: boolean;
  documentsEnabled: boolean;
  messagingEnabled: boolean;
  selfRegistrationEnabled: boolean;
  galleryEnabled: boolean;
  maxGuests: number | null;
  portalLanguage: string;
}

export interface GroupDealData {
  companyName: string;
  contactPerson: string | null;
  eventName: string | null;
  eventType: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  guestCount: number | null;
}

export interface GroupGuestData {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dietaryNeeds: string | null;
  allergies: string | null;
  specialRequests: string | null;
  isOrganizer: boolean;
  status: string;
  rsvpStatus: string;
  rsvpAt: string | null;
}

export interface GroupDocumentData {
  id: string;
  title: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  category: string;
  createdAt: string;
}

export interface GroupAnnouncementData {
  id: string;
  content: string;
  isPinned: boolean;
  createdBy: string;
  authorType?: "organizer" | "system";
  createdAt: string;
  imageUrl?: string | null;
}

export interface GroupPhotoData {
  id: string;
  imageUrl: string;
  caption: string | null;
  uploadedBy: string;
  createdAt: string;
}

export interface AgendaItemData {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  description: string | null;
  location: string | null;
  category: string | null;
}

export interface GroupMessage {
  id: string;
  body: string;
  isOrganizer: boolean;
  isParticipant?: boolean;
  sender: {
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
  };
  createdAt: string;
}

// ── Employee App ─────────────────────────────────────────────────────────────

export interface ShiftData {
  id: string;
  employeeId: string;
  employeeName: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  status: string;
  department: string;
  position: string | null;
  isOwnShift: boolean;
}

export interface DashboardData {
  todayShift: ShiftData | null;
  upcomingShifts: ShiftData[];
  weekStats: {
    scheduledHours: number;
    completedShifts: number;
    totalShifts: number;
  };
}
