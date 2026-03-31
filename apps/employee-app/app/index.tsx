// =============================================================================
// Employee App -- Entry Point (check saved session -> redirect)
// Supports biometric auto-login when token expired but credentials cached
// =============================================================================

// NOTE: ErrorBoundary wraps the default export at the bottom of this file

import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { emp, fontSize, spacing } from "@/lib/tokens";
import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import {
  getEmployeeToken, setEmployeeToken, getHotelSlug, getHotelId, getPersistedLang,
  isTokenExpired, decodeTokenPayload, logout,
  isBiometricEnrolled, getCachedCredentials, isHotelOnboarded,
} from "@/lib/auth";
import { authenticateWithBiometric, checkBiometricAvailability } from "@/lib/biometric";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { loginWithPin } from "@/lib/employee-api";

type ScreenState = "loading" | "verifying" | "ready";

function EntryScreenInner() {
  const [state, setState] = useState<ScreenState>("loading");
  const lang = useAppStore((s) => s.lang);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [token, slug, hotelId, savedLang] = await Promise.all([
        getEmployeeToken(),
        getHotelSlug(),
        getHotelId(),
        getPersistedLang(),
      ]);
      if (cancelled) return;

      const store = useAppStore.getState();

      // Restore language preference
      if (savedLang) store.setLang(savedLang);

      if (token && slug && hotelId) {
        if (isTokenExpired(token)) {
          // -- Biometric auto-login: token expired but biometric enrolled --------
          const [bioEnrolled, onboarded] = await Promise.all([
            isBiometricEnrolled(),
            isHotelOnboarded(),
          ]);
          if (cancelled) return;

          if (bioEnrolled && onboarded) {
            try {
              const bio = await checkBiometricAvailability();
              if (cancelled) return;

              if (bio.available) {
                setState("verifying");

                const currentLang = savedLang ?? "pl";
                const prompt = t(currentLang, "auth.biometricPrompt");
                const success = await authenticateWithBiometric(prompt, { allowDeviceFallback: true });
                if (cancelled) return;

                if (success) {
                  const creds = await getCachedCredentials();
                  if (cancelled) return;

                  if (creds) {
                    const res = await loginWithPin(creds.login, creds.pin, hotelId);
                    if (cancelled) return;

                    if (res.status === "success" && res.data) {
                      await setEmployeeToken(res.data.token);

                      store.setEmployee({
                        id: res.data.employee.id,
                        name: res.data.employee.name,
                        department: res.data.employee.department,
                        position: res.data.employee.position,
                      });
                      store.setHotel({ slug, id: hotelId, name: slug });
                      store.setAuthenticated(true);
                      store.setBiometricEnrolled(true);
                      store.setHotelOnboarded(true);
                      router.replace("/(employee)/dashboard");
                      return;
                    }
                  }
                }
              }
            } catch {
              // Biometric auto-login error -- fall through to logout
            }
          }

          // Biometric auto-login failed or not available -- fall through
          await logout();
          if (cancelled) return;
          setState("ready");
          return;
        }

        // Valid token -- restore session and go to dashboard
        const payload = decodeTokenPayload(token);
        if (!payload) {
          // Token is malformed -- treat as invalid, logout and fall to welcome screen
          await logout();
          if (cancelled) return;
          setState("ready");
          return;
        }

        store.setEmployee({
          id: String(payload.employeeId ?? payload.sub ?? ""),
          name: String(payload.employeeName ?? payload.name ?? ""),
          department: payload.department ? String(payload.department) : undefined,
          position: payload.position ? String(payload.position) : undefined,
        });

        store.setHotel({
          slug,
          id: hotelId,
          name: String(payload.hotelName ?? slug),
        });
        store.setAuthenticated(true);
        router.replace("/(employee)/dashboard");
        return;
      }

      // No valid token -- check if hotel is already onboarded (skip slug step)
      if (cancelled) return;
      const onboarded = await isHotelOnboarded();
      if (cancelled) return;

      if (onboarded && slug && hotelId) {
        store.setHotel({ slug, id: hotelId, name: slug });
        store.setHotelOnboarded(true);
        router.replace("/(auth)/login");
        return;
      }

      setState("ready");
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (state === "ready") {
      router.replace("/(auth)/welcome");
    }
  }, [state]);

  return (
    <View style={styles.container} accessibilityRole="none">
      <ActivityIndicator color={emp.accent} size="large" />
      {state === "verifying" && (
        <Text style={styles.verifyingText}>
          {t(lang, "auth.verifying")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: emp.bg,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.lg,
  },
  verifyingText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: emp.textSecondary,
    textAlign: "center",
  },
});

export default function EntryScreen() {
  return (
    <ErrorBoundary>
      <EntryScreenInner />
    </ErrorBoundary>
  );
}
