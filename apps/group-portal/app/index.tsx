// =============================================================================
// Group Portal -- Entry Point (deep link + auto-resume + PIN redirect)
// =============================================================================

import { useEffect, useState, useCallback } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { group } from "@/lib/tokens";
import { useAppStore } from "@/lib/store";
import { getAppMode, getGroupTrackingId, getGroupToken, isTokenExpired, logout, setGroupToken, setGroupTrackingId as persistGroupId, setAppMode, setRsvpToken } from "@/lib/auth";
import { loginByLink } from "@/lib/group-api";

export default function EntryScreen() {
  const setMode = useAppStore((s) => s.setMode);
  const [ready, setReady] = useState(false);

  // Extract trackingId from deep link URL: purealpha-group://g/TRACKING_ID
  const extractTrackingId = useCallback((url: string | null): string | null => {
    if (!url) return null;
    const match = url.match(/\/g\/([^/?#]+)/i);
    return match?.[1] ?? null;
  }, []);

  // Deep link auto-login: call /auth-by-link, fall back to PIN screen on failure
  const handleDeepLinkLogin = useCallback(async (trackingId: string) => {
    try {
      const res = await loginByLink(trackingId);
      if (res.status === "success" && res.data?.token) {
        await Promise.all([
          setGroupToken(res.data.token),
          persistGroupId(trackingId),
          setAppMode("group"),
          ...(res.data.rsvpToken ? [setRsvpToken(res.data.rsvpToken)] : []),
        ]);
        useAppStore.getState().setGroupTrackingId(trackingId);
        useAppStore.getState().setAuthenticated(true);
        useAppStore.getState().setMode("group");
        router.replace("/(group)/overview");
        return;
      }
      // auth-by-link failed (e.g. PIN required) -- fall back to PIN screen
      router.replace({ pathname: "/(auth)/pin", params: { trackingId } });
    } catch {
      router.replace({ pathname: "/(auth)/pin", params: { trackingId } });
    }
  }, []);

  useEffect(() => {
    (async () => {
      // Check deep link first
      const initialUrl = await Linking.getInitialURL();
      const deepLinkTrackingId = extractTrackingId(initialUrl);

      if (deepLinkTrackingId) {
        // Deep link with trackingId -- auto-login with zero inputs
        await handleDeepLinkLogin(deepLinkTrackingId);
        return;
      }

      // Check saved session
      const [savedMode, groupId, groupJwt] = await Promise.all([
        getAppMode(),
        getGroupTrackingId(),
        getGroupToken(),
      ]);

      if (savedMode === "group" && groupId && groupJwt) {
        if (isTokenExpired(groupJwt)) {
          await logout();
          setReady(true);
          return;
        }
        setMode("group");
        router.replace("/(group)/overview");
        return;
      }

      setReady(true);
    })();
  }, [setMode, extractTrackingId, handleDeepLinkLogin]);

  // Listen for warm-start deep links
  useEffect(() => {
    const sub = Linking.addEventListener("url", (event) => {
      const trackingId = extractTrackingId(event.url);
      if (trackingId) {
        handleDeepLinkLogin(trackingId);
      }
    });
    return () => sub.remove();
  }, [extractTrackingId, handleDeepLinkLogin]);

  useEffect(() => {
    if (ready) {
      router.replace("/(auth)/pin");
    }
  }, [ready]);

  return (
    <View style={styles.loading}>
      <ActivityIndicator color={group.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: group.bg,
    justifyContent: "center",
    alignItems: "center",
  },
});
