// =============================================================================
// Employee App -- API helpers (custom JWT auth)
// =============================================================================

import { Platform } from "react-native";
import { getEmployeeToken, setEmployeeToken, isBiometricEnrolled, getCachedCredentials, getHotelId } from "./auth";
import { t, type Lang } from "./i18n";
import { useAppStore } from "./store";
import type { ApiResponse } from "./types";

const API_BASE = "https://purealphahotel.pl";

const REQUEST_TIMEOUT_MS = 15_000;

// Session expiry callback -- configured from _layout.tsx
let onEmployeeSessionExpired: (() => void) | null = null;
let sessionRefreshPromise: Promise<boolean> | null = null;

export function configureEmployeeApi(cb: { onSessionExpired: () => void }) {
  onEmployeeSessionExpired = cb.onSessionExpired;
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

    const res = await fetch(`${API_BASE}/api/employee-app/auth/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: creds.login, pin: creds.pin, hotelId }),
    });
    if (!res.ok) return false;

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

export async function employeeFetch<T>(
  path: string,
  options: RequestInit = {},
  { authenticated = true }: { authenticated?: boolean } = {},
): Promise<ApiResponse<T>> {
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
        // Retry the original request with new token
        const newToken = await getEmployeeToken();
        const retryRes = await fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
            ...((options.headers as Record<string, string>) ?? {}),
          },
          signal: controller.signal,
        });
        if (retryRes.status === 401) {
          onEmployeeSessionExpired?.();
          return { status: "error", errorMessage: t(lang, "common.sessionExpired") };
        }
        const json = (await retryRes.json()) as ApiResponse<T>;
        return json;
      }
      onEmployeeSessionExpired?.();
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
  ApiResponse<{ hotelId: string; hotelName: string }>
> {
  return employeeFetch(
    `/auth/resolve-hotel?slug=${encodeURIComponent(slug)}`,
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

export async function clockIn(): Promise<
  ApiResponse<{ shiftId: string; clockInTime: string }>
> {
  return employeeFetch("/clock-in", { method: "POST" });
}

export async function clockOut(): Promise<
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
  return employeeFetch("/clock-out", { method: "POST" });
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

export async function fetchLeaveRequests(): Promise<ApiResponse<unknown[]>> {
  return employeeFetch("/leave-requests");
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
