// =============================================================================
// Employee App — API helpers (custom JWT auth)
// =============================================================================

import { API_BASE } from "./api";
import { getEmployeeToken } from "./auth";
import type { ApiResponse } from "./types";

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
        ...(options.headers as Record<string, string> ?? {}),
      },
      signal: controller.signal,
    });

    if (res.status === 401) {
      onEmployeeSessionExpired?.();
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

export async function resolveHotel(slug: string): Promise<ApiResponse<{ hotelId: string; hotelName: string }>> {
  return employeeFetch(`/auth/resolve-hotel?slug=${encodeURIComponent(slug)}`, {}, { authenticated: false });
}

export async function loginWithPin(
  login: string,
  pin: string,
  hotelId: string,
): Promise<ApiResponse<{ token: string; employee: { id: string; name: string; department: string; position: string } }>> {
  return employeeFetch("/auth/pin", {
    method: "POST",
    body: JSON.stringify({ login, pin, hotelId }),
  }, { authenticated: false });
}
