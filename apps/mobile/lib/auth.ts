// =============================================================================
// Pure Alpha Mobile — Auth (SecureStore + token management)
// =============================================================================

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Web fallback — SecureStore doesn't work on web.
// Use localStorage so tokens survive page refreshes (in-memory object is volatile).
const webStorage = {
  get: (key: string): string | null => {
    try { return typeof window !== "undefined" ? window.localStorage.getItem(key) : null; } catch { return null; }
  },
  set: (key: string, value: string): void => {
    try { if (typeof window !== "undefined") window.localStorage.setItem(key, value); } catch {}
  },
  del: (key: string): void => {
    try { if (typeof window !== "undefined") window.localStorage.removeItem(key); } catch {}
  },
};

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") return webStorage.get(key);
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") { webStorage.set(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") { webStorage.del(key); return; }
  await SecureStore.deleteItemAsync(key);
}

const TOKEN_KEY = "pa_auth_token";
const PORTAL_TOKEN_KEY = "pa_portal_token";
const MODE_KEY = "pa_app_mode";
const GROUP_ID_KEY = "pa_group_tracking_id";
const EMPLOYEE_TOKEN_KEY = "pa_employee_token";

// ── Token Storage ────────────────────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  try {
    return await getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await deleteItem(TOKEN_KEY);
}

// ── Portal Token (for guest portal — JWT from /p/[token]) ────────────────────

export async function getPortalToken(): Promise<string | null> {
  try {
    return await getItem(PORTAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setPortalToken(token: string): Promise<void> {
  await setItem(PORTAL_TOKEN_KEY, token);
}

export async function clearPortalToken(): Promise<void> {
  await deleteItem(PORTAL_TOKEN_KEY);
}

// ── Employee Token ───────────────────────────────────────────────────────────

export async function getEmployeeToken(): Promise<string | null> {
  try {
    return await getItem(EMPLOYEE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setEmployeeToken(token: string): Promise<void> {
  await setItem(EMPLOYEE_TOKEN_KEY, token);
}

export async function clearEmployeeToken(): Promise<void> {
  await deleteItem(EMPLOYEE_TOKEN_KEY);
}

// ── Group Token (JWT from group portal verify-pin) ──────────────────────────

const GROUP_TOKEN_KEY = "pa_group_jwt_token";

export async function getGroupToken(): Promise<string | null> {
  try {
    return await getItem(GROUP_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setGroupToken(token: string): Promise<void> {
  await setItem(GROUP_TOKEN_KEY, token);
}

export async function clearGroupToken(): Promise<void> {
  await deleteItem(GROUP_TOKEN_KEY);
}

// ── Group Portal ─────────────────────────────────────────────────────────────

export async function getGroupTrackingId(): Promise<string | null> {
  try {
    return await getItem(GROUP_ID_KEY);
  } catch {
    return null;
  }
}

export async function setGroupTrackingId(id: string): Promise<void> {
  await setItem(GROUP_ID_KEY, id);
}

export async function clearGroupTrackingId(): Promise<void> {
  await deleteItem(GROUP_ID_KEY);
}

// ── App Mode ─────────────────────────────────────────────────────────────────

export type AppMode = "guest" | "group" | "employee";

export async function getAppMode(): Promise<AppMode | null> {
  try {
    const mode = await getItem(MODE_KEY);
    if (mode === "guest" || mode === "group" || mode === "employee") return mode;
    return null;
  } catch {
    return null;
  }
}

export async function setAppMode(mode: AppMode): Promise<void> {
  await setItem(MODE_KEY, mode);
}

// ── Logout ───────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  await Promise.all([
    clearToken(),
    clearPortalToken(),
    clearEmployeeToken(),
    clearGroupToken(),
    clearGroupTrackingId(),
    deleteItem(MODE_KEY),
  ]);
}

// ── JWT Expiry Check ────────────────────────────────────────────────────────
// Decode JWT payload without external dependencies and check exp claim.
// Returns true if token is expired or cannot be decoded.

// Hermes (React Native) has no atob(). Manual base64 decode.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
function decodeBase64(str: string): string {
  const input = str.replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/=]/g, "");
  let output = "";
  let i = 0;
  while (i < input.length) {
    const e1 = B64.indexOf(input.charAt(i++));
    const e2 = B64.indexOf(input.charAt(i++));
    const e3 = B64.indexOf(input.charAt(i++));
    const e4 = B64.indexOf(input.charAt(i++));
    output += String.fromCharCode((e1 << 2) | (e2 >> 4));
    if (e3 !== 64) output += String.fromCharCode(((e2 & 15) << 4) | (e3 >> 2));
    if (e4 !== 64) output += String.fromCharCode(((e3 & 3) << 6) | e4);
  }
  return output;
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return true;
    const payload = JSON.parse(decodeBase64(parts[1]));
    if (typeof payload.exp !== "number") return false; // no exp claim, treat as valid
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
