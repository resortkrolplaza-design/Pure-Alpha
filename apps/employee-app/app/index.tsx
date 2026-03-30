// =============================================================================
// Employee App -- Entry Point (check saved session -> redirect)
// =============================================================================

import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { emp } from "@/lib/tokens";
import { useAppStore } from "@/lib/store";
import { getEmployeeToken, getHotelSlug, getHotelId, getPersistedLang, isTokenExpired, decodeTokenPayload, logout } from "@/lib/auth";

export default function EntryScreen() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [token, slug, hotelId, savedLang] = await Promise.all([
        getEmployeeToken(),
        getHotelSlug(),
        getHotelId(),
        getPersistedLang(),
      ]);

      const store = useAppStore.getState();

      // Restore language preference
      if (savedLang) store.setLang(savedLang);

      if (token && slug && hotelId) {
        if (isTokenExpired(token)) {
          await logout();
          setReady(true);
          return;
        }

        // Decode token to restore employee info
        const payload = decodeTokenPayload(token);
        if (payload) {
          store.setEmployee({
            id: String(payload.employeeId ?? payload.sub ?? ""),
            name: String(payload.employeeName ?? payload.name ?? ""),
            department: payload.department ? String(payload.department) : undefined,
            position: payload.position ? String(payload.position) : undefined,
          });
        }

        store.setHotel({
          slug,
          id: hotelId,
          name: String(payload?.hotelName ?? slug),
        });
        store.setAuthenticated(true);
        router.replace("/(employee)/dashboard");
        return;
      }

      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) {
      router.replace("/(auth)/welcome");
    }
  }, [ready]);

  return (
    <View style={styles.loading}>
      <ActivityIndicator color={emp.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: emp.bg,
    justifyContent: "center",
    alignItems: "center",
  },
});
