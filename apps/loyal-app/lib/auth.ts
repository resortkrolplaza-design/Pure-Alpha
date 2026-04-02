// =============================================================================
// Loyal App -- Auth (SecureStore + JWT + portal token management)
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

const JWT_KEY = "pa_loyal_jwt";
const TOKEN_KEY = "pa_loyal_token";
const LANG_KEY = "pa_loyal_lang";
const HOTEL_NAME_KEY = "pa_loyal_hotel_name";
const MEMBER_NAME_KEY = "pa_loyal_member_name";

// -- Guest JWT ----------------------------------------------------------------

export async function saveGuestJwt(jwt: string): Promise<void> {
  await setItem(JWT_KEY, jwt);
}

export async function getGuestJwt(): Promise<string | null> {
  try {
    return await getItem(JWT_KEY);
  } catch {
    return null;
  }
}

// -- Selected Portal Token (for active hotel) ---------------------------------

export async function saveSelectedToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

export async function getSelectedToken(): Promise<string | null> {
  try {
    return await getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// -- Legacy alias (used by loyal screens) ------------------------------------

export async function saveToken(token: string): Promise<void> {
  await saveSelectedToken(token);
}

export async function getToken(): Promise<string | null> {
  return getSelectedToken();
}

// -- Logout (clears everything except lang) -----------------------------------

export async function logout(): Promise<void> {
  await Promise.all([
    deleteItem(JWT_KEY),
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
// Decodes base64url JWT payload to check exp claim.

export function isJwtExpired(jwt: string): boolean {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return true;
    // base64url -> base64
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(payload);
    const parsed = JSON.parse(decoded);
    if (!parsed.exp) return true;
    // 30s buffer to avoid edge-case expiry during request
    return parsed.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}
