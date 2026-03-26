// =============================================================================
// Pure Alpha Mobile — API Client
// Secure fetch wrapper with JWT auth, 401 intercept, error handling
// =============================================================================

import { Platform } from "react-native";
import { ApiResponse } from "./types";

// Native apps don't have CORS -- call production directly.
// Web uses a local proxy to avoid CORS, but ONLY in dev mode.
export const API_BASE = __DEV__ && Platform.OS === "web"
  ? "http://localhost:3999"
  : "https://purealphahotel.pl";
const REQUEST_TIMEOUT_MS = 15_000;

type TokenGetter = () => Promise<string | null>;
type OnExpired = () => void;

interface ApiClientConfig {
  getToken: TokenGetter;
  onTokenExpired: OnExpired;
}

let config: ApiClientConfig | null = null;

export function configureApiClient(cfg: ApiClientConfig) {
  config = cfg;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  if (!config) throw new Error("API client not configured. Call configureApiClient() first.");

  const token = await config.getToken();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> ?? {}),
    };

    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (res.status === 401) {
      config.onTokenExpired();
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

// ── Convenience methods ──────────────────────────────────────────────────────

export function apiGet<T>(path: string) {
  return apiFetch<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPut<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string) {
  return apiFetch<T>(path, { method: "DELETE" });
}

// ── Portal-specific fetch (token-based, no session auth) ─────────────────────

export async function portalFetch<T>(
  portalToken: string,
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const basePath = `/api/loyal/portal/${portalToken}`;
    const url = `${API_BASE}${basePath}${path}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers as Record<string, string> ?? {}),
      },
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      return { status: "error", errorMessage: "Token expired or invalid" };
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
