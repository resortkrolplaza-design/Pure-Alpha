// =============================================================================
// Stable Device ID -- persisted to SecureStore to prevent regeneration.
// Used for poll vote dedup. Without persistence, a new random ID is generated
// each app launch on web or when Constants.installationId is unavailable,
// allowing unlimited re-votes.
// =============================================================================

import { Platform } from "react-native";
import Constants from "expo-constants";
import { getSecureItem, setSecureItem } from "./auth";

const DEVICE_ID_KEY = "pa_device_id";
let cachedDeviceId: string | null = null;

/**
 * Returns a stable device identifier. On first call, checks SecureStore,
 * then Constants.installationId, then generates + persists a random ID.
 * Subsequent calls return the cached value synchronously via promise.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  // 1. Try persisted value
  const stored = await getSecureItem(DEVICE_ID_KEY).catch(() => null);
  if (stored && stored.length >= 8) {
    cachedDeviceId = stored;
    return stored;
  }

  // 2. Try Expo installationId (stable per install on native)
  const installId =
    Constants.installationId ??
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
      ?.installationId ??
    null;
  if (typeof installId === "string" && installId.length >= 8) {
    cachedDeviceId = installId;
    await setSecureItem(DEVICE_ID_KEY, installId).catch(() => {});
    return installId;
  }

  // 3. Generate + persist
  const generated = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  cachedDeviceId = generated;
  await setSecureItem(DEVICE_ID_KEY, generated).catch(() => {});
  return generated;
}
