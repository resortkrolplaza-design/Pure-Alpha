// =============================================================================
// Loyal App -- API helpers (token-in-URL auth, no Authorization header)
// + Guest Account API (email/password auth, JWT Bearer)
// =============================================================================

import { t, type Lang } from "./i18n";
import { useAppStore } from "./store";
import type { ApiResponse, PortalData, RewardData, TransactionData, ChallengeData, BadgeData, ScratchCardData, MessageData } from "./types";

const API_BASE = "https://purealphahotel.pl";

const REQUEST_TIMEOUT_MS = 15_000;

function getLang(): Lang {
  return useAppStore.getState().lang ?? "pl";
}

// -- Core fetch wrapper -------------------------------------------------------
// Token-in-URL auth: /api/loyal/portal/{token}{path}
// No Authorization header needed.

export async function loyalFetch<T>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const lang = getLang();

  try {
    const url = `${API_BASE}/api/loyal/portal/${token}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...((options.headers as Record<string, string>) ?? {}),
      },
      signal: controller.signal,
    });

    const json = (await res.json()) as ApiResponse<T>;
    return json;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "error", errorMessage: t(lang, "common.error") };
    }
    return {
      status: "error",
      errorMessage: t(lang, "common.networkError"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// =============================================================================
// Guest Account API (email/password auth)
// =============================================================================

interface GuestLoginResponse {
  jwt: string;
  guestAccountId: string;
  firstName: string | null;
  hotelId: string | null;
  hotels?: { id: string; name: string }[];
  message?: string;
}

interface GuestRegisterResponse {
  message: string;
}

interface GuestForgotPasswordResponse {
  message: string;
}

export interface GuestHotelData {
  memberId: string;
  portalToken: string | null;
  hotelId: string;
  hotelName: string;
  hotelLogo: string | null;
  hotelAddress: string | null;
  programName: string;
  pointsName: string;
  memberNumber: string;
  availablePoints: number;
  tierName: string | null;
  tierColor: string;
  guestName: string | null;
}

interface GuestHotelsResponse {
  hotels: GuestHotelData[];
}

// -- Guest fetch wrapper (no token in URL, uses base URL) ---------------------

async function guestFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const lang = getLang();

  try {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...((options.headers as Record<string, string>) ?? {}),
      },
      signal: controller.signal,
    });

    const json = (await res.json()) as ApiResponse<T>;
    return json;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "error", errorMessage: t(lang, "common.error") };
    }
    return {
      status: "error",
      errorMessage: t(lang, "common.networkError"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// -- Guest Login --------------------------------------------------------------

export async function guestLogin(
  email: string,
  password: string,
): Promise<ApiResponse<GuestLoginResponse>> {
  return guestFetch("/api/guest/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
}

// -- Guest Register -----------------------------------------------------------

export async function guestRegister(data: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<ApiResponse<GuestRegisterResponse>> {
  return guestFetch("/api/guest/register", {
    method: "POST",
    body: JSON.stringify({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      ...(data.firstName && { firstName: data.firstName.trim() }),
      ...(data.lastName && { lastName: data.lastName.trim() }),
    }),
  });
}

// -- Guest Forgot Password ----------------------------------------------------

export async function guestForgotPassword(
  email: string,
): Promise<ApiResponse<GuestForgotPasswordResponse>> {
  return guestFetch("/api/guest/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
}

// -- Fetch Guest Hotels (JWT Bearer auth) -------------------------------------

export async function fetchGuestHotels(
  jwt: string,
): Promise<ApiResponse<GuestHotelsResponse>> {
  return guestFetch("/api/guest/hotels", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });
}

// -- Endpoint wrappers --------------------------------------------------------

export async function fetchPortalData(
  token: string,
): Promise<ApiResponse<PortalData>> {
  return loyalFetch(token, "/");
}

export async function fetchRewards(
  token: string,
): Promise<ApiResponse<RewardData[]>> {
  return loyalFetch(token, "/rewards");
}

export async function redeemReward(
  token: string,
  rewardId: string,
): Promise<ApiResponse<{
  redemption: {
    id: string;
    rewardId: string;
    rewardName: string;
    pointsSpent: number;
    status: string;
    redemptionCode?: string | null;
    createdAt: string;
  };
  updatedBalance: number;
}>> {
  return loyalFetch(token, "/rewards/redeem", {
    method: "POST",
    body: JSON.stringify({ rewardId }),
  });
}

/** History response has `data` (array) + `pagination` at the same level. */
export interface HistoryApiResponse {
  status: "success" | "error";
  data?: TransactionData[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  errorMessage?: string;
}

export async function fetchHistory(
  token: string,
  page?: number,
  limit?: number,
): Promise<HistoryApiResponse> {
  const params = new URLSearchParams();
  if (page != null) params.set("page", String(page));
  if (limit != null) params.set("limit", String(limit));
  const qs = params.toString();
  // Use raw fetch since the response shape doesn't fit ApiResponse<T>
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const lang = getLang();

  try {
    const url = `${API_BASE}/api/loyal/portal/${token}/history${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    return (await res.json()) as HistoryApiResponse;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "error", errorMessage: t(lang, "common.error") };
    }
    return { status: "error", errorMessage: t(lang, "common.networkError") };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchChallenges(
  token: string,
): Promise<ApiResponse<ChallengeData[]>> {
  return loyalFetch(token, "/challenges");
}

/** API returns { earned: [...], available: [...] } -- NOT a flat array */
export interface BadgesApiData {
  earned: Array<{
    id: string;
    badgeId: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    emoji: string | null;
    category: string | null;
    sortOrder: number;
    earnedAt: string;
  }>;
  available: Array<{
    id: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    emoji: string | null;
    category: string | null;
    sortOrder: number;
  }>;
}

export async function fetchBadges(
  token: string,
): Promise<ApiResponse<BadgesApiData>> {
  return loyalFetch(token, "/badges");
}

export async function fetchScratchCards(
  token: string,
): Promise<ApiResponse<ScratchCardData[]>> {
  return loyalFetch(token, "/scratch-cards");
}

export async function scratchCard(
  token: string,
  cardId: string,
): Promise<ApiResponse<ScratchCardData>> {
  return loyalFetch(token, `/scratch-cards/${cardId}/scratch`, {
    method: "POST",
  });
}

export async function claimScratchCard(
  token: string,
  cardId: string,
): Promise<ApiResponse<{ claimed: boolean }>> {
  return loyalFetch(token, `/scratch-cards/${cardId}/claim`, {
    method: "POST",
  });
}

export async function fetchMessages(
  token: string,
  cursor?: string,
  limit?: number,
): Promise<ApiResponse<{ messages: MessageData[]; nextCursor: string | null }>> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (limit != null) params.set("limit", String(limit));
  const qs = params.toString();
  return loyalFetch(token, `/messages${qs ? `?${qs}` : ""}`);
}

export async function sendMessage(
  token: string,
  payload: { body: string },
): Promise<ApiResponse<MessageData>> {
  return loyalFetch(token, "/messages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function subscribePush(
  token: string,
  data: { pushToken: string; platform: string; deviceName?: string },
): Promise<ApiResponse<{ subscribed: boolean }>> {
  return loyalFetch(token, "/push-subscribe", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
