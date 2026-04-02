// =============================================================================
// Loyal App -- Entry Point (cold start restore + deep link)
//
// Priority order:
//   1. Deep link (purealpha-loyal://p/{UUID})  -- override everything
//   2. Saved JWT (not expired) + saved portalToken -> restore session
//   3. Saved JWT (not expired) but no portalToken -> hotel-select
//   4. No valid JWT -> welcome screen
// =============================================================================

import { useEffect, useState, useCallback } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { loyal } from "@/lib/tokens";
import { useAppStore } from "@/lib/store";
import {
  getGuestJwt,
  getToken,
  saveToken,
  getPersistedLang,
  isJwtExpired,
  logout,
} from "@/lib/auth";
import { fetchPortalData, fetchGuestHotels } from "@/lib/loyal-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

const UUID_RE =
  /\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function EntryScreenInner() {
  const [ready, setReady] = useState(false);

  const extractToken = useCallback((url: string | null): string | null => {
    if (!url) return null;
    const match = url.match(UUID_RE);
    return match?.[1] ?? null;
  }, []);

  // Handle deep-link token: save + fetch portal data + navigate to loyal
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

  // Restore session from saved JWT + portalToken (no deep link)
  const restoreSession = useCallback(async (): Promise<boolean> => {
    const jwt = await getGuestJwt();
    if (!jwt || isJwtExpired(jwt)) {
      // JWT missing or expired -- clear stale data
      if (jwt) await logout();
      return false;
    }

    const store = useAppStore.getState();
    store.setGuestJwt(jwt);

    // Check saved portal token
    const savedToken = await getToken();
    if (savedToken) {
      // Try to restore full session with portal data
      try {
        const res = await fetchPortalData(savedToken);
        if (res.status === "success" && res.data) {
          const { member, hotel, program } = res.data;
          store.setToken(savedToken);
          store.setMemberName(member.firstName);
          store.setHotelName(hotel.name);
          store.setProgramName(program.programName);
          if (
            program.portalLanguage === "en" ||
            program.portalLanguage === "pl"
          ) {
            store.setLang(program.portalLanguage);
          }
          store.setAuthenticated(true);
          router.replace("/(loyal)/stay");
          return true;
        }
      } catch {
        // Portal data fetch failed -- fall through to hotel-select
      }
    }

    // JWT valid but no usable portalToken -- fetch hotel list
    try {
      const hotelsRes = await fetchGuestHotels(jwt);
      if (
        hotelsRes.status === "success" &&
        hotelsRes.data &&
        hotelsRes.data.hotels.length > 0
      ) {
        const hotels = hotelsRes.data.hotels;
        if (hotels.length === 1 && hotels[0].portalToken) {
          // Single hotel -- auto-select
          const hotel = hotels[0];
          const pt = hotel.portalToken!;
          await saveToken(pt);
          store.setToken(pt);
          try {
            const portalRes = await fetchPortalData(pt);
            if (portalRes.status === "success" && portalRes.data) {
              const { member, hotel: h, program } = portalRes.data;
              store.setMemberName(member.firstName);
              store.setHotelName(h.name);
              store.setProgramName(program.programName);
              if (
                program.portalLanguage === "en" ||
                program.portalLanguage === "pl"
              ) {
                store.setLang(program.portalLanguage);
              }
              store.setAuthenticated(true);
              router.replace("/(loyal)/stay");
              return true;
            }
          } catch {
            // Fall through
          }
        }

        // Multiple hotels or single hotel without portalToken
        router.replace({
          pathname: "/(auth)/hotel-select",
          params: { hotels: JSON.stringify(hotels) },
        });
        return true;
      }
    } catch {
      // Hotels fetch failed -- treat as no session
    }

    // JWT valid but no hotels at all -- go to welcome (edge case: new account, no memberships)
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Restore language preference first
      const savedLang = await getPersistedLang();
      if (savedLang) useAppStore.getState().setLang(savedLang);

      // 1. Check deep link (always takes priority)
      const initialUrl = await Linking.getInitialURL();
      const deepLinkToken = extractToken(initialUrl);

      if (deepLinkToken) {
        if (!cancelled) await handleTokenFound(deepLinkToken);
        return;
      }

      // 2. Try JWT-based session restore
      if (!cancelled) {
        const restored = await restoreSession();
        if (restored) return;
      }

      // 3. No valid session -- go to welcome
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [extractToken, handleTokenFound, restoreSession]);

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
