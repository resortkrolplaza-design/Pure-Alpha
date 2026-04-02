// =============================================================================
// Loyal App -- Entry Point (deep link + saved token -> redirect)
// Deep link: purealpha-loyal://p/{UUID}
// URL:       https://purealphahotel.pl/p/{UUID}
// =============================================================================

import { useEffect, useState, useCallback } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { loyal } from "@/lib/tokens";
import { useAppStore } from "@/lib/store";
import { getToken, saveToken, getPersistedLang, logout } from "@/lib/auth";
import { fetchPortalData } from "@/lib/loyal-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

const UUID_RE = /\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function EntryScreenInner() {
  const [ready, setReady] = useState(false);

  const extractToken = useCallback((url: string | null): string | null => {
    if (!url) return null;
    const match = url.match(UUID_RE);
    return match?.[1] ?? null;
  }, []);

  const handleTokenFound = useCallback(async (foundToken: string) => {
    await saveToken(foundToken);
    const store = useAppStore.getState();
    store.setToken(foundToken);
    try {
      const res = await fetchPortalData(foundToken);
      if (res.status !== "success" || !res.data) {
        await logout();
        store.reset();
        setReady(true);
        return;
      }
      const { member, hotel, program } = res.data;
      store.setMemberName(member.firstName);
      store.setHotelName(hotel.name);
      store.setProgramName(program.programName);
      if (program.portalLanguage === "en" || program.portalLanguage === "pl") {
        store.setLang(program.portalLanguage);
      }
      store.setAuthenticated(true);
      router.replace("/(loyal)/stay");
    } catch {
      await logout();
      store.reset();
      setReady(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Restore language preference
      const savedLang = await getPersistedLang();
      if (savedLang) useAppStore.getState().setLang(savedLang);

      // 1. Check deep link first
      const initialUrl = await Linking.getInitialURL();
      const deepLinkToken = extractToken(initialUrl);

      if (deepLinkToken) {
        if (!cancelled) await handleTokenFound(deepLinkToken);
        return;
      }

      // 2. Check saved token in SecureStore
      const savedToken = await getToken();
      if (savedToken && !cancelled) {
        await handleTokenFound(savedToken);
        return;
      }

      // 3. No token -- go to welcome
      if (!cancelled) setReady(true);
    })();

    return () => { cancelled = true; };
  }, [extractToken, handleTokenFound]);

  // Listen for warm-start deep links (app already open)
  useEffect(() => {
    const sub = Linking.addEventListener("url", (event) => {
      const token = extractToken(event.url);
      if (token) {
        handleTokenFound(token);
      }
    });
    return () => sub.remove();
  }, [extractToken, handleTokenFound]);

  useEffect(() => {
    if (ready) {
      router.replace("/(auth)/welcome");
    }
  }, [ready]);

  return (
    <View style={styles.container} accessibilityRole="none">
      <ActivityIndicator color={loyal.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: loyal.bg,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default function EntryScreen() {
  return (
    <ErrorBoundary>
      <EntryScreenInner />
    </ErrorBoundary>
  );
}
