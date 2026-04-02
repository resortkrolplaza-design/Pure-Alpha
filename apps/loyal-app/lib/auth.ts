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
