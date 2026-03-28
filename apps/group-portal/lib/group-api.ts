// =============================================================================
// Group Portal — API helpers (JWT Bearer auth per trackingId)
// =============================================================================

import { API_BASE } from "./api";
import { getGroupToken } from "./auth";
import type {
  ApiResponse,
  PortalInitData,
  PortalRole,
  RsvpPayload,
  RsvpResponse,
  SelfRegisterPayload,
  SelfRegisterResponse,
  GroupAnnouncementData,
  GroupGuestData,
  GroupPhotoData,
  PollData,
} from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

// Session expiry callback -- configured from _layout.tsx
let onGroupSessionExpired: (() => void) | null = null;

export function configureGroupApi(cb: { onSessionExpired: () => void }) {
  onGroupSessionExpired = cb.onSessionExpired;
}

export async function groupFetch<T>(
  trackingId: string,
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const token = await getGroupToken();
    const url = `${API_BASE}/api/portal/${encodeURIComponent(trackingId)}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(typeof options.headers === 'object' && options.headers !== null ? (options.headers as Record<string, string>) : {}),
      },
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      onGroupSessionExpired?.();
      return { status: "error", errorMessage: "Session expired" };
    }

    const json = await res.json() as ApiResponse<T>;
    return json;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "error", errorMessage: "Request timed out" };
    }
    return {
      status: "error",
      errorMessage: err instanceof Error ? err.message : "Network error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPortalInit(
  trackingId: string,
): Promise<ApiResponse<PortalInitData>> {
  return groupFetch<PortalInitData>(trackingId, "/init");
}

export async function loginByLink(
  trackingId: string,
): Promise<ApiResponse<{ token: string; role: PortalRole; hotelName?: string; guest: { id: string; firstName: string; lastName?: string; rsvpStatus: string } | null; rsvpToken?: string | null }>> {
  return groupFetch(trackingId, "/auth-by-link", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function verifyPin(
  trackingId: string,
  pin: string,
  email: string,
): Promise<ApiResponse<{ token: string; role: PortalRole; email?: string | null; guest: { id: string; firstName: string; lastName?: string; rsvpStatus: string } | null; rsvpToken?: string | null }>> {
  return groupFetch(trackingId, "/verify-pin", {
    method: "POST",
    body: JSON.stringify({ pin, email }),
  });
}

// ── Portal Info (public, no auth) ----

export async function fetchPortalInfo(
  trackingId: string,
): Promise<ApiResponse<{ pinRequired: boolean; hotelName: string; eventName: string | null }>> {
  // This endpoint doesn't need JWT -- call directly
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `${API_BASE}/api/portal/${encodeURIComponent(trackingId)}/info`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    return await res.json() as ApiResponse<{ pinRequired: boolean; hotelName: string; eventName: string | null }>;
  } catch {
    return { status: "error", errorMessage: "Network error" };
  } finally {
    clearTimeout(timeout);
  }
}

// ── RSVP ----

export async function submitRsvp(
  trackingId: string,
  guestId: string,
  payload: RsvpPayload,
): Promise<ApiResponse<RsvpResponse>> {
  return groupFetch(trackingId, `/guests/${encodeURIComponent(guestId)}/rsvp`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ── Self-Registration ----

export async function selfRegister(
  trackingId: string,
  payload: SelfRegisterPayload,
): Promise<ApiResponse<SelfRegisterResponse>> {
  return groupFetch(trackingId, "/guests/self-register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Guest CRUD (organizer only) ----

export interface AddGuestPayload {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dietaryNeeds?: string;
  allergies?: string;
}

export interface EditGuestPayload {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  dietaryNeeds?: string | null;
  allergies?: string | null;
}

export async function addGuest(
  trackingId: string,
  payload: AddGuestPayload,
): Promise<ApiResponse<GroupGuestData>> {
  return groupFetch(trackingId, "/guests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function editGuest(
  trackingId: string,
  guestId: string,
  payload: EditGuestPayload,
): Promise<ApiResponse<GroupGuestData>> {
  return groupFetch(
    trackingId,
    `/guests/${encodeURIComponent(guestId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteGuest(
  trackingId: string,
  guestId: string,
): Promise<ApiResponse<void>> {
  return groupFetch(
    trackingId,
    `/guests/${encodeURIComponent(guestId)}`,
    { method: "DELETE" },
  );
}

// ── Guest CSV Import (organizer only) ----

export interface ImportGuestsPayload {
  guests: Array<{
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    dietaryNeeds?: string;
    allergies?: string;
  }>;
}

export interface ImportGuestsResponse {
  imported: number;
  skipped: number;
}

export async function importGuests(
  trackingId: string,
  payload: ImportGuestsPayload,
): Promise<ApiResponse<ImportGuestsResponse>> {
  return groupFetch(trackingId, "/guests/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Guest Invitation (organizer only) ----

export interface SendInvitationPayload {
  guestIds: string[];
  customMessage?: string;
}

export interface SendInvitationResponse {
  sent: number;
  failed: string[];
  total: number;
}

export async function sendInvitation(
  trackingId: string,
  payload: SendInvitationPayload,
): Promise<ApiResponse<SendInvitationResponse>> {
  return groupFetch(trackingId, "/guests/invite", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Announcements ----

export async function fetchAnnouncements(
  trackingId: string,
): Promise<ApiResponse<GroupAnnouncementData[]>> {
  return groupFetch(trackingId, "/announcements");
}

export async function createAnnouncement(
  trackingId: string,
  payload: { content: string; isPinned: boolean },
): Promise<ApiResponse<GroupAnnouncementData>> {
  return groupFetch(trackingId, "/announcements", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteAnnouncement(
  trackingId: string,
  announcementId: string,
): Promise<ApiResponse<void>> {
  return groupFetch(
    trackingId,
    `/announcements/${encodeURIComponent(announcementId)}`,
    { method: "DELETE" },
  );
}

// ── Photos ----

export async function fetchPhotos(
  trackingId: string,
): Promise<ApiResponse<GroupPhotoData[]>> {
  return groupFetch(trackingId, "/photos");
}

// ── Polls ----

export async function fetchPolls(
  trackingId: string,
): Promise<ApiResponse<PollData[]>> {
  return groupFetch(trackingId, "/polls");
}

export async function createPoll(
  trackingId: string,
  payload: { question: string; options: string[] },
): Promise<ApiResponse<PollData>> {
  return groupFetch(trackingId, "/polls", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function votePoll(
  trackingId: string,
  pollId: string,
  optionIdx: number,
  deviceId: string,
): Promise<ApiResponse<{ totalVotes: number; voteCounts: number[] }>> {
  return groupFetch(
    trackingId,
    `/polls/${encodeURIComponent(pollId)}/vote`,
    {
      method: "POST",
      body: JSON.stringify({ optionIdx, deviceId }),
    },
  );
}

export async function closePoll(
  trackingId: string,
  pollId: string,
): Promise<ApiResponse<void>> {
  return groupFetch(
    trackingId,
    `/polls/${encodeURIComponent(pollId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ isActive: false }),
    },
  );
}

export async function deletePoll(
  trackingId: string,
  pollId: string,
): Promise<ApiResponse<void>> {
  return groupFetch(
    trackingId,
    `/polls/${encodeURIComponent(pollId)}`,
    { method: "DELETE" },
  );
}
