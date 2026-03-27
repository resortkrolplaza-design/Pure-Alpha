// =============================================================================
// Group Portal — API helpers (JWT Bearer auth per trackingId)
// =============================================================================

import { API_BASE } from "./api";
import { getGroupToken } from "./auth";
import type { ApiResponse } from "./types";

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
        ...(options.headers as Record<string, string> ?? {}),
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

export async function verifyPin(
  trackingId: string,
  pin: string,
  email: string,
): Promise<ApiResponse<{ token: string; role: string; email?: string | null; guest: { id: string; firstName: string; lastName?: string; rsvpStatus: string } | null; rsvpToken?: string | null }>> {
  return groupFetch(trackingId, "/verify-pin", {
    method: "POST",
    body: JSON.stringify({ pin, email }),
  });
}
