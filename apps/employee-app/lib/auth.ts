// =============================================================================
// Employee App -- Auth (SecureStore + employee JWT management)
// =============================================================================

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Web fallback -- SecureStore doesn't work on web.
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

const TOKEN_KEY = "pa_employee_token";
const HOTEL_SLUG_KEY = "pa_employee_hotel_slug";
const HOTEL_ID_KEY = "pa_employee_hotel_id";
const LANG_KEY = "pa_employee_lang";

// -- Employee Token -----------------------------------------------------------

export async function getEmployeeToken(): Promise<string | null> {
  try {
    return await getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setEmployeeToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

export async function clearEmployeeToken(): Promise<void> {
  await deleteItem(TOKEN_KEY);
}

// -- Hotel Slug ---------------------------------------------------------------

export async function getHotelSlug(): Promise<string | null> {
  try {
    return await getItem(HOTEL_SLUG_KEY);
  } catch {
    return null;
  }
}

export async function setHotelSlug(slug: string): Promise<void> {
  await setItem(HOTEL_SLUG_KEY, slug);
}

// -- Hotel ID -----------------------------------------------------------------

export async function getHotelId(): Promise<string | null> {
  try {
    return await getItem(HOTEL_ID_KEY);
  } catch {
    return null;
  }
}

export async function setHotelId(id: string): Promise<void> {
  await setItem(HOTEL_ID_KEY, id);
}

// -- Language Preference ------------------------------------------------------

export async function getPersistedLang(): Promise<"pl" | "en" | null> {
  try {
    const val = await getItem(LANG_KEY);
    if (val === "pl" || val === "en") return val;
    return null;
  } catch {
    return null;
  }
}

export async function setPersistedLang(lang: "pl" | "en"): Promise<void> {
  await setItem(LANG_KEY, lang);
}

// -- Logout -------------------------------------------------------------------

export async function logout(): Promise<void> {
  await Promise.all([
    clearEmployeeToken(),
    deleteItem(HOTEL_SLUG_KEY),
    deleteItem(HOTEL_ID_KEY),
  ]);
}

// -- JWT Expiry Check ---------------------------------------------------------
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

// -- JWT Payload Extraction ---------------------------------------------------

export function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(decodeBase64(parts[1]));
  } catch {
    return null;
  }
}
