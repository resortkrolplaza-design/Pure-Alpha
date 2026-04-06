// =============================================================================
// Group Portal — Auth (SecureStore + token management)
// =============================================================================

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { AppMode, PortalRole } from "./types";

// Web fallback -- SecureStore doesn't work on web.
// Use localStorage so tokens survive page refreshes.
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

// ── Public accessors for generic key-value storage (polls, badges, etc.) ----

export async function getSecureItem(key: string): Promise<string | null> {
  return getItem(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  return setItem(key, value);
}

const MODE_KEY = "pa_app_mode";
const GROUP_ID_KEY = "pa_group_tracking_id";
const GROUP_TOKEN_KEY = "pa_group_jwt_token";
const RSVP_TOKEN_KEY = "pa_rsvp_token";
const GUEST_IDENTITY_KEY = "pa_guest_identity";
const LANG_KEY = "pa_lang";
const ROLE_KEY = "pa_portal_role";
const EMAIL_KEY = "pa_user_email";
const PUSH_ENABLED_KEY = "pa_push_enabled";

// ── Language Persistence ----

export async function getPersistedLang(): Promise<"pl" | "en" | null> {
  try {
    const lang = await getItem(LANG_KEY);
    if (lang === "pl" || lang === "en") return lang;
    return null;
  } catch {
    return null;
  }
}

export async function setPersistedLang(lang: "pl" | "en"): Promise<void> {
  await setItem(LANG_KEY, lang);
}

// ── Push Notification Preference Persistence ----

export async function getPersistedPushEnabled(): Promise<boolean> {
  try {
    const val = await getItem(PUSH_ENABLED_KEY);
    if (val === "false") return false;
    return true; // default: enabled
  } catch {
    return true;
  }
}

export async function setPersistedPushEnabled(enabled: boolean): Promise<void> {
  await setItem(PUSH_ENABLED_KEY, enabled ? "true" : "false");
}

// ── Group Token (JWT from group portal verify-pin) ----

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

// ── Group Tracking ID ----

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

// ── RSVP Token ----

export async function getRsvpToken(): Promise<string | null> {
  try {
    return await getItem(RSVP_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setRsvpToken(token: string): Promise<void> {
  await setItem(RSVP_TOKEN_KEY, token);
}

export async function clearRsvpToken(): Promise<void> {
  await deleteItem(RSVP_TOKEN_KEY);
}

// ── Guest Identity (persisted JSON) ----

export interface PersistedGuest {
  id: string;
  firstName: string;
  lastName?: string;
  rsvpStatus: string;
}

export async function getGuestIdentity(): Promise<PersistedGuest | null> {
  try {
    const json = await getItem(GUEST_IDENTITY_KEY);
    if (!json) return null;
    return JSON.parse(json) as PersistedGuest;
  } catch {
    return null;
  }
}

export async function setGuestIdentity(guest: PersistedGuest): Promise<void> {
  await setItem(GUEST_IDENTITY_KEY, JSON.stringify(guest));
}

export async function clearGuestIdentity(): Promise<void> {
  await deleteItem(GUEST_IDENTITY_KEY);
}

// ── Portal Role ----

export async function getPersistedRole(): Promise<PortalRole> {
  try {
    const role = await getItem(ROLE_KEY);
    if (role === "organizer" || role === "participant") return role;
    return "participant";
  } catch {
    return "participant";
  }
}

export async function setPersistedRole(role: PortalRole): Promise<void> {
  await setItem(ROLE_KEY, role);
}

// ── User Email (for deep link re-login) ----

export async function getPersistedEmail(): Promise<string | null> {
  try {
    return await getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export async function setPersistedEmail(email: string): Promise<void> {
  await setItem(EMAIL_KEY, email);
}

// ── App Mode ----

export type { AppMode };

export async function getAppMode(): Promise<AppMode | null> {
  try {
    const mode = await getItem(MODE_KEY);
    if (mode === "group") return mode;
    return null;
  } catch {
    return null;
  }
}

export async function setAppMode(mode: AppMode): Promise<void> {
  await setItem(MODE_KEY, mode);
}

// ── Logout ----

export async function logout(): Promise<void> {
  await Promise.all([
    clearGroupToken(),
    clearGroupTrackingId(),
    clearRsvpToken(),
    clearGuestIdentity(),
    deleteItem(MODE_KEY),
    deleteItem(ROLE_KEY),
  ]);
}

// ── JWT Expiry Check ----
// Decode JWT payload without external dependencies and check exp claim.
// Returns true if token is expired or cannot be decoded.

// Hermes (React Native) has no atob(). Manual base64 decode.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
export function decodeBase64(str: string): string {
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
