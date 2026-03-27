// =============================================================================
// Group Portal — Push Notification Registration Hook
// Registers Expo push token with backend on mount.
// =============================================================================

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { groupFetch } from "./group-api";
import { useAppStore } from "./store";

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  // Push tokens only work on physical devices
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return tokenData.data;
}

function getDeviceId(): string {
  // Use installationId from Constants (deprecated but still works in Expo Go)
  // Falls back to platform + timestamp for uniqueness
  const id = Constants.installationId
    ?? Constants.expoConfig?.extra?.installationId
    ?? null;
  return id ?? `${Platform.OS}-${Date.now()}`;
}

export function usePushNotifications() {
  const trackingId = useAppStore((s) => s.groupTrackingId);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const guestId = useAppStore((s) => s.guest?.id);
  const registered = useRef(false);

  useEffect(() => {
    if (!trackingId || !isAuthenticated || registered.current) return;

    let cancelled = false;

    (async () => {
      try {
        const token = await getExpoPushToken();
        if (!token || cancelled) return;

        const deviceId = getDeviceId();
        await groupFetch(trackingId, "/push-subscribe", {
          method: "POST",
          body: JSON.stringify({
            expoPushToken: token,
            deviceId,
            platform: Platform.OS,
            guestId: guestId ?? undefined,
          }),
        });

        registered.current = true;
      } catch {
        // Silent fail -- push is best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trackingId, isAuthenticated, guestId]);
}
