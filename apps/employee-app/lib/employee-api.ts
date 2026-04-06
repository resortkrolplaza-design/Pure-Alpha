// =============================================================================
// Employee App -- API helpers (custom JWT auth)
// =============================================================================

import { getEmployeeToken, setEmployeeToken, isBiometricEnrolled, getCachedCredentials, getHotelId, decodeTokenPayload } from "./auth";
import { authenticateWithBiometric, checkBiometricAvailability } from "./biometric";
import { t, type Lang } from "./i18n";
import { useAppStore } from "./store";
import type { ApiResponse, LeaveRequest } from "./types";

const API_BASE = "https://purealphahotel.pl";

const REQUEST_TIMEOUT_MS = 15_000;
const PROACTIVE_REFRESH_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes before exp

// Session expiry callback -- configured from _layout.tsx
let onEmployeeSessionExpired: (() => void) | null = null;
let sessionRefreshPromise: Promise<boolean> | null = null;
let sessionExpiredFired = false;
let proactiveRefreshPromise: Promise<void> | null = null;

export function configureEmployeeApi(cb: { onSessionExpired: () => void }) {
  onEmployeeSessionExpired = cb.onSessionExpired;
  sessionExpiredFired = false;
}

/** Fire session expired callback at most once (until configureEmployeeApi resets). */
function fireSessionExpired(): void {
  if (sessionExpiredFired) return;
  sessionExpiredFired = true;
  onEmployeeSessionExpired?.();
}

function getLang(): Lang {
  return useAppStore.getState().lang ?? "pl";
}

/**
 * Try silent re-auth using cached biometric credentials.
 * Returns true if new token obtained, false if should proceed to logout.
 */
async function doSessionRefresh(): Promise<boolean> {
  try {
    const [enrolled, creds, hotelId] = await Promise.all([
      isBiometricEnrolled(),
      getCachedCredentials(),
      getHotelId(),
    ]);
    if (!enrolled || !creds || !hotelId) return false;

    // Require biometric verification before using cached credentials for re-auth.
    // If biometric hardware is unavailable but was enrolled, refuse silent re-auth
    // (security: stolen device with disabled biometrics must not silently refresh).
    const bio = await checkBiometricAvailability();
    if (!bio.available) return false;

    const success = await authenticateWithBiometric(t(getLang(), "auth.biometricRefresh"), {
      allowDeviceFallback: true,
    });
    if (!success) return false;

    const refreshController = new AbortController();
    const refreshTimeout = setTimeout(() => refreshController.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/employee-app/auth/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: creds.login, pin: creds.pin, hotelId }),
        signal: refreshController.signal,
      });
    } finally {
      clearTimeout(refreshTimeout);
    }
    if (!res.ok) {
      // 401 = stale PIN (changed server-side). Clear cached creds to prevent
      // progressive lockout from repeated retries with wrong PIN.
      if (res.status === 401) {
        const { clearBiometricCredentials } = await import("./auth");
        await clearBiometricCredentials();
      }
      return false;
    }

    const json = await res.json();
    if (json.status === "success" && json.data?.token) {
      await setEmployeeToken(json.data.token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Shared promise: all concurrent 401s wait for the same refresh attempt
function trySessionRefresh(): Promise<boolean> {
  if (sessionRefreshPromise) return sessionRefreshPromise;
  sessionRefreshPromise = doSessionRefresh().finally(() => {
    sessionRefreshPromise = null;
  });
  return sessionRefreshPromise;
}

/**
 * Proactively refresh token if it expires within 30 minutes.
 * Runs BEFORE the request (unlike trySessionRefresh which runs after 401).
 * Uses singleton promise to prevent concurrent refresh attempts.
 */
async function _doProactiveRefresh(): Promise<void> {
  try {
    const token = await getEmployeeToken();
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
      const res = await fetch(`${API_BASE}/api/employee-app/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      if (!res.ok) return; // Continue with current token

      const json = await res.json();
      if (json.status === "success" && json.data?.token) {
        await setEmployeeToken(json.data.token);
      }
    } finally {
      clearTimeout(refreshTimeout);
    }
  } catch {
    // Silently ignore -- continue with current token
  }
}

function _maybeRefreshToken(): Promise<void> {
  if (proactiveRefreshPromise) return proactiveRefreshPromise;
  proactiveRefreshPromise = _doProactiveRefresh().finally(() => {
    proactiveRefreshPromise = null;
  });
  return proactiveRefreshPromise;
}

export async function employeeFetch<T>(
  path: string,
  options: RequestInit = {},
  { authenticated = true }: { authenticated?: boolean } = {},
): Promise<ApiResponse<T>> {
  // Proactive token refresh before making the request
  if (authenticated) {
    await _maybeRefreshToken();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const lang = getLang();

  try {
    const token = authenticated ? await getEmployeeToken() : null;
    const url = `${API_BASE}/api/employee-app${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((options.headers as Record<string, string>) ?? {}),
      },
      signal: controller.signal,
    });

    if (res.status === 401) {
      // Try silent re-auth before giving up
      const refreshed = await trySessionRefresh();
      if (refreshed) {
        // Clear original timeout -- create fresh AbortController for retry
        // (original controller may already be aborted if request timed out)
        clearTimeout(timeout);
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), REQUEST_TIMEOUT_MS);
        try {
          const newToken = await getEmployeeToken();
          const retryRes = await fetch(url, {
            ...options,
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
              ...((options.headers as Record<string, string>) ?? {}),
            },
            signal: retryController.signal,
          });
          if (retryRes.status === 401) {
            fireSessionExpired();
            return { status: "error", errorMessage: t(lang, "common.sessionExpired") };
          }
          const json = (await retryRes.json()) as ApiResponse<T>;
          return json;
        } finally {
          clearTimeout(retryTimeout);
        }
      }
      fireSessionExpired();
      return { status: "error", errorMessage: t(lang, "common.sessionExpired") };
    }

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

export async function resolveHotel(
  slug: string,
): Promise<
  ApiResponse<{ hotelId: string; hotelName: string; slug?: string }>
> {
  return employeeFetch(
    `/auth/resolve-hotel?slug=${encodeURIComponent(slug)}`,
    {},
    { authenticated: false },
  );
}

export async function resolveHotelByToken(
  token: string,
): Promise<
  ApiResponse<{ hotelId: string; hotelName: string; slug: string }>
> {
  return employeeFetch(
    `/auth/resolve-hotel?token=${encodeURIComponent(token)}`,
    {},
    { authenticated: false },
  );
}

export async function loginWithPin(
  login: string,
  pin: string,
  hotelId: string,
): Promise<
  ApiResponse<{
    token: string;
    employee: {
      id: string;
      name: string;
      department: string;
      position: string;
    };
  }>
> {
  return employeeFetch(
    "/auth/pin",
    {
      method: "POST",
      body: JSON.stringify({ login, pin, hotelId }),
    },
    { authenticated: false },
  );
}

export async function loginWithCredentials(
  username: string,
  password: string,
  hotelId: string,
): Promise<
  ApiResponse<{
    token: string;
    employee: {
      id: string;
      name: string;
      department: string;
      position: string;
    };
  }>
> {
  return employeeFetch(
    "/auth/credentials",
    {
      method: "POST",
      body: JSON.stringify({ username, password, hotelId }),
    },
    { authenticated: false },
  );
}

export async function clockIn(data: {
  qrToken: string;
  latitude: number;
  longitude: number;
  gpsAccuracy?: number;
}): Promise<
  ApiResponse<{ shiftId: string; clockInTime: string }>
> {
  return employeeFetch("/clock-in", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function clockOut(data?: {
  latitude?: number;
  longitude?: number;
  gpsAccuracy?: number;
}): Promise<
  ApiResponse<{
    shiftId: string;
    clockInTime: string;
    clockOutTime: string;
    workedHours: number;
    scheduledHours: number;
    overtimeHours: number;
    dailyEarnings: number | null;
  }>
> {
  return employeeFetch("/clock-out", {
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function submitLeaveRequest(data: {
  leaveType: string;
  startDate: string;
  endDate: string;
  reason?: string;
}): Promise<ApiResponse<{ id: string }>> {
  return employeeFetch("/leave-request", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function cancelLeaveRequest(requestId: string): Promise<ApiResponse<{ id: string; status: string }>> {
  return employeeFetch(`/leave-requests/${requestId}/cancel`, {
    method: "POST",
  });
}

export async function fetchLeaveRequests(): Promise<ApiResponse<LeaveRequest[]>> {
  return employeeFetch("/leave-requests");
}

// -- Documents ----------------------------------------------------------------

export async function fetchDocuments(): Promise<ApiResponse<unknown[]>> {
  return employeeFetch("/documents");
}

export async function uploadDocument(
  formData: FormData,
): Promise<ApiResponse<{ id: string }>> {
  const lang = getLang();

  // ── Try S3 presigned URL path first (faster, no server proxy) ──
  const s3Result = await _tryS3Upload(formData, lang);
  if (s3Result) return s3Result;

  // ── Fallback: legacy FormData upload through server ──
  return _legacyFormDataUpload(formData, lang);
}

/**
 * Attempt upload via S3 presigned URL.
 * Returns null if signed URL request fails (caller should fall back).
 */
async function _tryS3Upload(
  formData: FormData,
  lang: Lang,
): Promise<ApiResponse<{ id: string }> | null> {
  try {
    // Extract file info from FormData
    const file = formData.get("file") as { uri: string; name: string; type: string } | null;
    const dataStr = formData.get("data") as string | null;
    if (!file || !dataStr) return null;

    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(dataStr);
    } catch {
      return null;
    }

    const fileName = file.name || `doc-${Date.now()}.bin`;
    const contentType = file.type || "application/octet-stream";

    // Read the file blob from URI first -- we need its size for the signed URL request
    const fileResponse = await fetch(file.uri);
    const blob = await fileResponse.blob();
    const fileSize = blob.size;

    // Validate size before requesting signed URL (same 10MB limit as server)
    if (!fileSize || fileSize > 10 * 1024 * 1024) return null;

    // Step 1: Get presigned URL from server
    const signedUrlRes = await employeeFetch<{
      signedUrl: string;
      publicUrl: string;
      path: string;
      expiresIn: number;
    }>("/documents/signed-url", {
      method: "POST",
      body: JSON.stringify({ fileName, fileSize, contentType }),
    });

    if (signedUrlRes.status !== "success" || !signedUrlRes.data) return null;

    const { signedUrl, publicUrl } = signedUrlRes.data;

    const s3Res = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });

    if (!s3Res.ok) return null;

    // Step 3: Create document record with metadata + S3 URL
    const docResult = await employeeFetch<{ id: string }>("/documents", {
      method: "POST",
      body: JSON.stringify({
        ...metadata,
        fileUrl: publicUrl,
        fileName,
        fileSize,
      }),
    });

    return docResult;
  } catch {
    // Any failure in S3 path -> return null to fall back
    return null;
  }
}

/** Legacy FormData upload with 401 retry. */
async function _legacyFormDataUpload(
  formData: FormData,
  lang: Lang,
): Promise<ApiResponse<{ id: string }>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const token = await getEmployeeToken();
    const url = `${API_BASE}/api/employee-app/documents`;
    const res = await fetch(url, {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
      signal: controller.signal,
    });

    // 401 retry with biometric re-auth (same pattern as employeeFetch)
    if (res.status === 401) {
      const refreshed = await trySessionRefresh();
      if (refreshed) {
        clearTimeout(timeout);
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), 30_000);
        try {
          const newToken = await getEmployeeToken();
          const retryRes = await fetch(url, {
            method: "POST",
            headers: { ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}) },
            body: formData,
            signal: retryController.signal,
          });
          if (retryRes.status === 401) {
            fireSessionExpired();
            return { status: "error", errorMessage: t(lang, "common.sessionExpired") };
          }
          return (await retryRes.json()) as ApiResponse<{ id: string }>;
        } finally {
          clearTimeout(retryTimeout);
        }
      }
      fireSessionExpired();
      return { status: "error", errorMessage: t(lang, "common.sessionExpired") };
    }

    return (await res.json()) as ApiResponse<{ id: string }>;
  } catch {
    return { status: "error", errorMessage: t(lang, "common.networkError") };
  } finally {
    clearTimeout(timeout);
  }
}

export async function deleteDocument(documentId: string): Promise<ApiResponse<void>> {
  return employeeFetch(`/documents/${documentId}`, { method: "DELETE" });
}

export async function fetchLeaveBalance(): Promise<
  ApiResponse<{
    year: number;
    totalDays: number;
    usedDays: number;
    plannedDays: number;
    remainingDays: number;
    onDemandEntitlement: number;
    onDemandUsed: number;
    sickDaysUsed: number;
    pendingRequests: number;
  }>
> {
  return employeeFetch("/leave-balance");
}
