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
  createdAt?: string;
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
  authorType?: string;
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
