// =============================================================================
// Group Portal -- Entry Point (auto-resume or PIN login)
// =============================================================================

import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { group } from "@/lib/tokens";
import { useAppStore } from "@/lib/store";
import { getAppMode, getGroupTrackingId, getGroupToken, isTokenExpired, logout } from "@/lib/auth";

export default function EntryScreen() {
  const setMode = useAppStore((s) => s.setMode);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
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
  }, [setMode]);

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
