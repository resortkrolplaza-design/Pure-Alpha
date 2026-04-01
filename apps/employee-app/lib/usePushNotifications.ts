// =============================================================================
// Employee App -- Push Notification Registration Hook
// Registers Expo push token with backend on mount after authentication.
// Pattern adapted from Group Portal's usePushNotifications.ts
// =============================================================================

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { employeeFetch } from "./employee-api";
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
  if (!Device.isDevice) return null;

  // Android 8+ requires a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#1e40af",
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

const DEVICE_ID_KEY = "PUSH_DEVICE_ID";

async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const newId = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, newId);
  return newId;
}

export function usePushNotifications() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const registered = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || registered.current) return;

    let cancelled = false;

    (async () => {
      try {
        const token = await getExpoPushToken();
        if (!token || cancelled) return;

        const deviceId = getDeviceId();
        await employeeFetch("/push-subscribe", {
          method: "POST",
          body: JSON.stringify({
            expoPushToken: token,
            deviceId,
            platform: Platform.OS,
          }),
        });

        registered.current = true;
      } catch {
        // Silent fail -- push registration is best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);
}
