// =============================================================================
// Loyal App -- Push Notification Registration Hook
// Registers Expo push token with backend on mount after authentication.
// =============================================================================

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { subscribePush } from "./loyal-api";
import { useAppStore } from "./store";

const DEVICE_ID_KEY = "pa_loyal_device_id";
let _cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string> {
  if (_cachedDeviceId) return _cachedDeviceId;
  try {
    const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (stored) { _cachedDeviceId = stored; return stored; }
  } catch { /* first launch */ }
  const id = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try { await SecureStore.setItemAsync(DEVICE_ID_KEY, id); } catch { /* web fallback */ }
  _cachedDeviceId = id;
  return id;
}

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
  if (!Device.isDevice) return null;

  // Android 8+ requires a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#C8A951",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

export function usePushNotifications() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const token = useAppStore((s) => s.token);
  const registered = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !token || registered.current) return;

    let cancelled = false;

    (async () => {
      try {
        const expoPushToken = await getExpoPushToken();
        if (!expoPushToken || cancelled) return;

        const deviceId = await getDeviceId();
        await subscribePush(token, {
          expoPushToken,
          deviceId,
          platform: Platform.OS,
        });

        registered.current = true;
      } catch {
        // Silent fail -- push registration is best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);
}
