// =============================================================================
// Employee App -- API helpers (custom JWT auth)
// =============================================================================

import { Platform } from "react-native";
import { getEmployeeToken } from "./auth";
import type { ApiResponse } from "./types";

const API_BASE = "https://purealphahotel.pl";

const REQUEST_TIMEOUT_MS = 15_000;

// Session expiry callback -- configured from _layout.tsx
let onEmployeeSessionExpired: (() => void) | null = null;

export function configureEmployeeApi(cb: { onSessionExpired: () => void }) {
  onEmployeeSessionExpired = cb.onSessionExpired;
}

export async function employeeFetch<T>(
  path: string,
  options: RequestInit = {},
  { authenticated = true }: { authenticated?: boolean } = {},
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      onEmployeeSessionExpired?.();
      return { status: "error", errorMessage: "Sesja wygasla. Zaloguj sie ponownie." };
    }

    const json = (await res.json()) as ApiResponse<T>;
    return json;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "error", errorMessage: "Przekroczono limit czasu zapytania." };
    }
    return {
      status: "error",
      errorMessage: "Blad sieci. Sprawdz polaczenie z internetem.",
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
