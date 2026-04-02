// =============================================================================
// Loyal App -- Push Notification Registration Hook
// Registers Expo push token with backend on mount after authentication.
// =============================================================================

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { subscribePush } from "./loyal-api";
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
        const pushToken = await getExpoPushToken();
        if (!pushToken || cancelled) return;

        await subscribePush(token, {
          pushToken,
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
