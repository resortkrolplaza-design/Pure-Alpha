// =============================================================================
// Group Portal — API helpers (JWT Bearer auth per trackingId)
// =============================================================================

import { API_BASE } from "./api";
import { getGroupToken, setGroupToken, decodeBase64 } from "./auth";
import type {
  ApiResponse,
  PortalInitData,
  PortalRole,
  RsvpPayload,
  RsvpResponse,
  SelfRegisterPayload,
  SelfRegisterResponse,
  GroupAnnouncementData,
  GroupDocumentData,
  GroupGuestData,
  GroupPhotoData,
  PollData,
} from "./types";

const REQUEST_TIMEOUT_MS = 15_000;
const PROACTIVE_REFRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours before exp

// Session expiry callback -- configured from _layout.tsx
let onGroupSessionExpired: (() => void) | null = null;
let proactiveRefreshPromise: Promise<void> | null = null;

export function configureGroupApi(cb: { onSessionExpired: () => void }) {
  onGroupSessionExpired = cb.onSessionExpired;
}

function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(decodeBase64(parts[1]));
  } catch {
    return null;
  }
}

async function _doProactiveRefresh(trackingId: string): Promise<void> {
  try {
    const token = await getGroupToken();
    if (!token) return;

    const payload = decodeTokenPayload(token);
    if (!payload || typeof payload.exp !== "number") return;

    const expiresAt = payload.exp * 1000;
    const remaining = expiresAt - Date.now();

    // Only refresh if token expires within threshold and is still valid
    if (remaining > PROACTIVE_REFRESH_THRESHOLD_MS || remaining <= 0) return;

    const controller = new AbortController();
    const refreshTimeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const url = `${API_BASE}/api/portal/${encodeURIComponent(trackingId)}/auth/refresh`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      if (!res.ok) return;

      const json = await res.json();
      if (json.status === "success" && json.data?.token) {
        await setGroupToken(json.data.token);
      }
    } finally {
      clearTimeout(refreshTimeout);
    }
  } catch {
    // Silently ignore -- continue with current token
  }
}

function _maybeRefreshToken(trackingId: string): Promise<void> {
  if (proactiveRefreshPromise) return proactiveRefreshPromise;
  proactiveRefreshPromise = _doProactiveRefresh(trackingId).finally(() => {
    proactiveRefreshPromise = null;
  });
  return proactiveRefreshPromise;
}

export async function groupFetch<T>(
  trackingId: string,
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  // Proactive token refresh before making the request
  await _maybeRefreshToken(trackingId);

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
        // Caller headers first, then auth on top -- prevents Authorization override
        ...(typeof options.headers === 'object' && options.headers !== null ? (options.headers as Record<string, string>) : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });

    // Clear timeout after fetch succeeds -- prevents false "timeout" if json() is slow
    clearTimeout(timeout);

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

// Expose session-expiry trigger for raw-fetch callsites (e.g. photo upload)
export function triggerSessionExpired() {
  onGroupSessionExpired?.();
}

export async function fetchPortalInit(
  trackingId: string,
): Promise<ApiResponse<PortalInitData>> {
  return groupFetch<PortalInitData>(trackingId, "/init");
}

// Pre-auth helper — bypasses groupFetch 401 interceptor (which would trigger
// logout on a wrong-PIN 401 instead of showing the error message).
async function preAuthFetch<T>(
  trackingId: string,
  path: string,
  body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `${API_BASE}/api/portal/${encodeURIComponent(trackingId)}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return (await res.json()) as ApiResponse<T>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "error", errorMessage: "Request timed out" };
    }
    return { status: "error", errorMessage: err instanceof Error ? err.message : "Network error" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function loginByLink(
  trackingId: string,
  email?: string,
): Promise<ApiResponse<{ token: string; role: PortalRole; hotelName?: string; guest: { id: string; firstName: string; lastName?: string; rsvpStatus: string } | null; rsvpToken?: string | null }>> {
  return preAuthFetch(trackingId, "/auth-by-link", email ? { email: email.trim().toLowerCase() } : {});
}

export async function verifyPin(
  trackingId: string,
  pin: string,
  email?: string,
): Promise<ApiResponse<{ token: string; role: PortalRole; email?: string | null; guest: { id: string; firstName: string; lastName?: string; rsvpStatus: string } | null; rsvpToken?: string | null }>> {
  return preAuthFetch(trackingId, "/verify-pin", email ? { pin, email } : { pin });
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
  roomPreference?: string;
  specialRequests?: string;
  marketingConsent?: boolean;
}

export interface EditGuestPayload {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  dietaryNeeds?: string | null;
  allergies?: string | null;
  roomPreference?: string | null;
  specialRequests?: string | null;
  marketingConsent?: boolean;
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
    roomPreference?: string;
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

// ── Documents (organizer only) ----

export interface AddDocumentPayload {
  title: string;
  category: string;
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export async function addDocument(
  trackingId: string,
  payload: AddDocumentPayload,
): Promise<ApiResponse<GroupDocumentData>> {
  return groupFetch(trackingId, "/documents", {
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
  payload: { content: string; isPinned: boolean; imageUrl?: string },
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

export async function toggleAnnouncementPin(
  trackingId: string,
  announcementId: string,
  isPinned: boolean,
): Promise<ApiResponse<GroupAnnouncementData>> {
  return groupFetch(
    trackingId,
    `/announcements/${encodeURIComponent(announcementId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ id: announcementId, isPinned }),
    },
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
  payload: { question: string; options: string[]; showAsPopup?: boolean },
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
