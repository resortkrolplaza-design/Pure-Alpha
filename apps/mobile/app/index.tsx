// =============================================================================
// Mode Selector — ONE app, 3 beautiful experiences
// =============================================================================

import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { NAVY, NAVY_LIGHT, GOLD, guest, fontSize, fontWeight, radius, spacing, shadow } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore, useGuestStore } from "@/lib/store";
import { getAppMode, getPortalToken, getGroupTrackingId, getGroupToken, getEmployeeToken, logout, isTokenExpired } from "@/lib/auth";
import { portalFetch } from "@/lib/api";
import { mapInitResponse } from "@/lib/portal-helpers";

const MODES = [
  { key: "guest" as const, icon: "🏨", route: "/(guest)/stay" },
  { key: "group" as const, icon: "👥", route: "/(group)/overview" },
  { key: "employee" as const, icon: "👷", route: "/(employee)/dashboard" },
] as const;


export default function ModeSelector() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const setMode = useAppStore((s) => s.setMode);
  const setStorePortalToken = useAppStore((s) => s.setPortalToken);
  const setPortalData = useGuestStore((s) => s.setPortalData);
  const [checking, setChecking] = useState(true);

  // Auto-resume last session — must hydrate Zustand from SecureStore
  useEffect(() => {
    (async () => {
      const [savedMode, portalToken, groupId, groupJwt, empToken] = await Promise.all([
        getAppMode(),
        getPortalToken(),
        getGroupTrackingId(),
        getGroupToken(),
        getEmployeeToken(),
      ]);

      if (savedMode === "guest" && portalToken) {
        // Hydrate Zustand + fetch fresh portal data
        setMode("guest");
        setStorePortalToken(portalToken);
        try {
          const initRes = await portalFetch<Record<string, unknown>>(portalToken, "");
          if (initRes.status === "success" && initRes.data) {
            setPortalData(mapInitResponse(initRes.data));
            router.replace("/(guest)/stay");
            return;
          }
        } catch { /* token expired -- fall through to mode selector */ }
      }
      if (savedMode === "group" && groupId && groupJwt) {
        // Validate group JWT before resuming
        if (isTokenExpired(groupJwt)) {
          await logout();
          setChecking(false);
          return;
        }
        setMode("group");
        router.replace("/(group)/overview");
        return;
      }
      if (savedMode === "employee" && empToken) {
        // Validate employee token before resuming
        if (isTokenExpired(empToken)) {
          await logout();
          setChecking(false);
          return;
        }
        setMode("employee");
        router.replace("/(employee)/dashboard");
        return;
      }
      setChecking(false);
    })();
  }, [setMode, setStorePortalToken, setPortalData]);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: NAVY, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  const handleMode = async (mode: typeof MODES[number]) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode(mode.key);
    // Always go through auth first
    if (mode.key === "guest") {
      router.push("/(auth)/login");
    } else if (mode.key === "group") {
      router.push("/(auth)/pin");
    } else {
      router.push("/(auth)/pin");
    }
  };

  return (
    <LinearGradient colors={[NAVY, NAVY_LIGHT, NAVY]} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
        {/* Logo */}
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoStar}>★</Text>
          </View>
          <Text style={styles.title}>{t(lang, "mode.title")}</Text>
          <Text style={styles.subtitle}>{t(lang, "mode.subtitle")}</Text>
        </View>

        {/* Mode Cards */}
        <View style={styles.cards}>
          {MODES.map((mode, i) => (
            <View key={mode.key}>
              <Pressable
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => handleMode(mode)}
                accessibilityRole="button"
                accessibilityLabel={t(lang, `mode.${mode.key}`)}
              >
                <View style={styles.cardIcon}>
                  <Text style={styles.cardEmoji}>{mode.icon}</Text>
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{t(lang, `mode.${mode.key}`)}</Text>
                  <Text style={styles.cardDesc}>{t(lang, `mode.${mode.key}Desc`)}</Text>
                </View>
                <Text style={styles.cardArrow}>›</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View>
          <Text style={styles.footer}>Pure Alpha v1.0</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: "space-between", paddingHorizontal: spacing["2xl"] },
  logoArea: { alignItems: "center", gap: spacing.sm },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    ...shadow.gold,
  },
  logoStar: { fontSize: 32, color: NAVY },
  title: {
    fontSize: fontSize["3xl"],
    fontFamily: "Inter_700Bold",
    color: guest.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: guest.textSecondary,
  },
  cards: { gap: spacing.lg },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: guest.glass,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: guest.glassBorder,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: guest.goldGlow,
    borderWidth: 1,
    borderColor: guest.goldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  cardEmoji: { fontSize: 24 },
  cardText: { flex: 1, gap: 2 },
  cardTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: guest.text,
  },
  cardDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: guest.textSecondary,
  },
  cardArrow: { fontSize: 28, color: GOLD, fontWeight: fontWeight.normal },
  footer: {
    textAlign: "center",
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: guest.textMuted,
  },
});
