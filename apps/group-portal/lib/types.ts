// =============================================================================
// Group Portal — TypeScript Types (mirrored from web API responses)
// =============================================================================

// ── API Response Envelope ----

export interface ApiResponse<T> {
  status: "success" | "error";
  data?: T;
  errorMessage?: string;
  errors?: Record<string, string[]>;
}

// ── App Mode ----

export type AppMode = "group";

export type PortalRole = "organizer" | "participant";

// ── Group Guest ----

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
  rsvpAt?: string | null;
  roomPreference?: string | null;
  roomNote?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  addedBy?: string | null;
  invitationSentAt?: string | null;
  createdAt?: string;
}

export interface GroupDocumentData {
  id: string;
  title: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  category: string;
  createdAt: string;
}

export interface GroupAnnouncementData {
  id: string;
  content: string;
  isPinned: boolean;
  authorType: string;
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

export interface PortalInitData {
  portal: {
    id: string;
    title: string | null;
    status: string;
    portalLanguage: string;
    guestListEnabled: boolean;
    documentsEnabled: boolean;
    messagingEnabled: boolean;
    galleryEnabled: boolean;
    selfRegistrationEnabled: boolean;
    servicesEnabled: boolean;
    upsellEnabled: boolean;
    dietaryEnabled: boolean;
    pollsEnabled: boolean;
    photoWallEnabled: boolean;
    mapEnabled: boolean;
    attractionsEnabled: boolean;
    faqEnabled: boolean;
    agendaEnabled: boolean;
    timelineEnabled: boolean;
    timelineCheckpoints: Array<{
      label: string;
      labelEn?: string;
      date?: string;
      icon?: string;
      isComplete?: boolean;
    }>;
    notes?: string | null;
  };
  event: {
    name: string | null;
    type: string | null;
    checkInDate: string | null;
    checkOutDate: string | null;
    guestCount: number;
    companyName: string | null;
    contactPerson: string | null;
  };
  hotel: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
    coverImageUrl: string | null;
  };
  salesperson: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  socialLinks: Array<{ platform: string; username: string; url: string }>;
  faq: Array<{ id: string; question: string; answer: string }>;
  attractions: Array<{
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    category: string | null;
    distance: string | null;
    address: string | null;
    mapUrl: string | null;
    websiteUrl: string | null;
  }>;
  gallery: Array<{
    id: string;
    url: string;
    thumbnailUrl: string | null;
    alt: string | null;
    caption: string | null;
    category: string | null;
  }>;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    unit: string | null;
    currency: string | null;
    publicImages: unknown;
  }>;
  agendaItems: AgendaItemData[];
  announcements: GroupAnnouncementData[];
  totalGuestCount: number;
  documents: GroupDocumentData[];
}

// ── RSVP ----

export interface RsvpPayload {
  rsvpStatus: "confirmed" | "declined";
  dietaryNeeds?: string;
  allergies?: string;
  rsvpNote?: string;
  rsvpToken?: string;
  emailVerify?: string;
  marketingConsent?: boolean;
}

export interface RsvpResponse {
  id: string;
  rsvpStatus: string;
  rsvpAt: string;
}

// ── Self-Registration ----

export interface SelfRegisterPayload {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dietaryNeeds?: string;
  allergies?: string;
  specialRequests?: string;
  marketingConsent?: boolean;
}

export interface SelfRegisterResponse {
  guest: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
  rsvpToken: string;
}

// ── Polls ----

export interface PollOption {
  text: string;
  votes: number;
}

export interface PollData {
  id: string;
  question: string;
  options: string[];
  isActive: boolean;
  totalVotes: number;
  voteCounts: number[];
  createdAt: string;
  closedAt: string | null;
}

export interface GroupMessage {
  id: string;
  body: string;
  bodyType?: string;
  isOrganizer: boolean;
  isParticipant?: boolean;
  sender: {
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
  };
  createdAt: string;
}
