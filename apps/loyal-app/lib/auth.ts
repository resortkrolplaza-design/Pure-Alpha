// =============================================================================
// Loyal App -- Auth (SecureStore + portal token management)
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

const TOKEN_KEY = "pa_loyal_token";
const LANG_KEY = "pa_loyal_lang";
const HOTEL_NAME_KEY = "pa_loyal_hotel_name";
const MEMBER_NAME_KEY = "pa_loyal_member_name";

// -- Portal Token -------------------------------------------------------------

export async function saveToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  try {
    return await getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// -- Logout (clears token only, keeps lang) -----------------------------------

export async function logout(): Promise<void> {
  await Promise.all([
    deleteItem(TOKEN_KEY),
    deleteItem(HOTEL_NAME_KEY),
    deleteItem(MEMBER_NAME_KEY),
  ]);
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

// -- Hotel Name ---------------------------------------------------------------

export async function getHotelName(): Promise<string | null> {
  try {
    return await getItem(HOTEL_NAME_KEY);
  } catch {
    return null;
  }
}

export async function setHotelName(name: string): Promise<void> {
  await setItem(HOTEL_NAME_KEY, name);
}

// -- Member Name --------------------------------------------------------------

export async function getMemberName(): Promise<string | null> {
  try {
    return await getItem(MEMBER_NAME_KEY);
  } catch {
    return null;
  }
}

export async function setMemberName(name: string): Promise<void> {
  await setItem(MEMBER_NAME_KEY, name);
}

// -- JWT Expiry Check ---------------------------------------------------------
// Hermes (React Native) has no atob(). Manual base64 decode.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

export function decodeBase64(str: string): string {
  // Convert base64url to base64 and add padding
  let input = str.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4 !== 0) input += "=";

  // Try native atob first (available in newer Hermes versions)
  if (typeof globalThis.atob === "function") {
    try {
      return globalThis.atob(input);
    } catch {
      // Fall through to manual decoder
    }
  }

  // Manual base64 decode for older Hermes without atob
  // Produces raw bytes, then uses TextDecoder for proper UTF-8 multi-byte support
  // (Polish diacritics in member names etc.)
  input = input.replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes: number[] = [];
  let i = 0;
  while (i < input.length) {
    const e1 = B64.indexOf(input.charAt(i++));
    const e2 = B64.indexOf(input.charAt(i++));
    const e3 = B64.indexOf(input.charAt(i++));
    const e4 = B64.indexOf(input.charAt(i++));
    bytes.push((e1 << 2) | (e2 >> 4));
    if (e3 !== 64) bytes.push(((e2 & 15) << 4) | (e3 >> 2));
    if (e4 !== 64) bytes.push(((e3 & 3) << 6) | e4);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = decodeTokenPayload(token);
    if (!payload) return true;
    if (typeof payload.exp !== "number") return true;
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
