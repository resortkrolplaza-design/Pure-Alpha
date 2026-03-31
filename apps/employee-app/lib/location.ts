// =============================================================================
// Employee App -- Location (GPS geofencing for clock-in verification)
// =============================================================================

import * as Location from "expo-location";

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export type LocationError = "permission_denied" | "unavailable" | "timeout";

async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function getCurrentLocation(): Promise<
  { ok: true; data: LocationResult } | { ok: false; error: LocationError }
> {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return { ok: false, error: "permission_denied" };
    const GPS_TIMEOUT_MS = 15_000;
    const locationPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("GPS_TIMEOUT")), GPS_TIMEOUT_MS),
    );
    const location = await Promise.race([locationPromise, timeoutPromise]);
    return {
      ok: true,
      data: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.message === "GPS_TIMEOUT") {
      return { ok: false, error: "timeout" as LocationError };
    }
    return { ok: false, error: "unavailable" };
  }
}
