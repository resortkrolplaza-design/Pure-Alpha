// =============================================================================
// Employee App -- Profile (warm cream + avatar + language toggle + logout)
// =============================================================================

import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Alert, Animated, Switch, ScrollView } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { emp, fontSize, radius, spacing, shadow, destructive, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useScalePress } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  logout, getEmployeeToken, decodeBase64, setPersistedLang,
  isBiometricEnrolled, setBiometricCredentials, clearBiometricCredentials,
  getCachedCredentials,
} from "@/lib/auth";
import { checkBiometricAvailability, authenticateWithBiometric } from "@/lib/biometric";
import type { BiometricType } from "@/lib/biometric";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

interface EmployeeProfile {
  name: string;
  department: string;
  position: string;
}

function ProfileScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const reset = useAppStore((s) => s.reset);
  const storeName = useAppStore((s) => s.employeeName);
  const storeDept = useAppStore((s) => s.department);
  const storePos = useAppStore((s) => s.position);
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<EmployeeProfile | null>(
    storeName
      ? { name: storeName, department: storeDept ?? "", position: storePos ?? "" }
      : null,
  );
  const biometricEnrolled = useAppStore((s) => s.isBiometricEnrolled);
  const setBioEnrolled = useAppStore((s) => s.setBiometricEnrolled);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>("none");
  const [bioToggleLoading, setBioToggleLoading] = useState(false);

  const logoutPress = useScalePress();
  const pinPress = useScalePress();
  const langPress = useScalePress();

  // Check biometric hardware availability + enrollment on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bio = await checkBiometricAvailability();
      if (cancelled) return;
      setBiometricAvailable(bio.available);
      setBiometricType(bio.type);
      const enrolled = await isBiometricEnrolled();
      if (!cancelled) setBioEnrolled(enrolled);
    })();
    return () => { cancelled = true; };
  }, [setBioEnrolled]);

  useEffect(() => {
    // If Zustand already has data, skip JWT decode (runs once on mount)
    if (profile) return;
    (async () => {
      const token = await getEmployeeToken();
      if (!token) return;
      try {
        const parts = token.split(".");
        if (parts.length < 2) return;
        const payload = JSON.parse(decodeBase64(parts[1]));
        setProfile({
          name: String(payload.employeeName ?? payload.name ?? ""),
          department: String(payload.department ?? ""),
          position: String(payload.position ?? ""),
        });
      } catch {
        // Token decode failed -- keep placeholder
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initials = profile?.name
    ? profile.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t(lang, "auth.logout"),
      t(lang, "profile.logoutConfirm"),
      [
        { text: t(lang, "common.cancel"), style: "cancel" },
        {
          text: t(lang, "auth.logout"),
          style: "destructive",
          onPress: async () => {
            await logout();
            queryClient.clear();
            reset();
            router.replace("/");
          },
        },
      ],
    );
  };

  const handlePinReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      t(lang, "profile.resetPin"),
      biometricEnrolled ? t(lang, "profile.pinResetBiometric") : t(lang, "profile.pinResetInfo"),
      [{ text: "OK" }],
    );
  };

  const handleBiometricToggle = async (newValue: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBioToggleLoading(true);

    try {
      if (newValue) {
        // Turning ON -- verify identity first
        const success = await authenticateWithBiometric(t(lang, "profile.biometricConfirm"));
        if (!success) {
          setBioToggleLoading(false);
          return;
        }

        // Need cached credentials from last login
        const creds = await getCachedCredentials();
        if (!creds) {
          Alert.alert(
            t(lang, "profile.biometric"),
            t(lang, "profile.biometricReloginNeeded"),
          );
          setBioToggleLoading(false);
          return;
        }

        await setBiometricCredentials(creds.login, creds.pin);
        setBioEnrolled(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        // Turning OFF
        await clearBiometricCredentials();
        setBioEnrolled(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBioToggleLoading(false);
    }
  };

  const handleToggleLang = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = lang === "pl" ? "en" : "pl";
    setLang(next);
    await setPersistedLang(next);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing["4xl"],
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.title}>{t(lang, "profile.title")}</Text>

        {/* Employee Info Card */}
        <View style={styles.card}>
          <View style={styles.avatar}>
            {initials ? (
              <Text style={styles.avatarInitials}>{initials}</Text>
            ) : (
              <Icon name="person" size={28} color={emp.primary} />
            )}
          </View>
          <Text style={styles.name}>
            {profile?.name || t(lang, "profile.title")}
          </Text>
          <Text style={styles.meta}>
            {profile
              ? [profile.position, profile.department].filter(Boolean).join(" -- ")
                || t(lang, "profile.placeholder")
              : t(lang, "profile.placeholder")}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsCard}>
          {/* PIN Reset */}
          <Animated.View style={pinPress.scaleStyle}>
            <Pressable
              style={styles.actionRow}
              onPress={handlePinReset}
              onPressIn={pinPress.onPressIn}
              onPressOut={pinPress.onPressOut}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "profile.resetPin")}
            >
              <View style={styles.actionIcon}>
                <Icon name="key-outline" size={20} color={emp.primary} />
              </View>
              <Text style={styles.actionText}>{t(lang, "profile.resetPin")}</Text>
              <Icon name="chevron-forward" size={18} color={emp.textMuted} />
            </Pressable>
          </Animated.View>

          <View style={styles.actionDivider} />

          {/* Language Toggle */}
          <Animated.View style={langPress.scaleStyle}>
            <Pressable
              style={styles.actionRow}
              onPress={handleToggleLang}
              onPressIn={langPress.onPressIn}
              onPressOut={langPress.onPressOut}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "profile.language")}
            >
              <View style={styles.actionIcon}>
                <Icon name="language-outline" size={20} color={emp.primary} />
              </View>
              <Text style={styles.actionText}>{t(lang, "profile.language")}</Text>
              <View style={styles.langBadge}>
                <Text style={styles.langBadgeText}>
                  {lang === "pl" ? "PL" : "EN"}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        </View>

        {/* Biometric Section -- shown only if device has biometric hardware */}
        {biometricAvailable && (
          <View style={styles.actionsCard}>
            <View style={styles.actionRow}>
              <View style={styles.actionIcon}>
                <Icon
                  name={biometricType === "face" ? "scan-outline" : "finger-print-outline"}
                  size={20}
                  color={emp.primary}
                />
              </View>
              <View style={styles.bioTextCol}>
                <Text style={styles.actionText}>{t(lang, "profile.biometric")}</Text>
                <Text style={[styles.bioStatus, !biometricEnrolled && styles.bioStatusOff]}>
                  {biometricEnrolled
                    ? biometricType === "face"
                      ? t(lang, "profile.biometricFace")
                      : biometricType === "fingerprint"
                        ? t(lang, "profile.biometricFingerprint")
                        : biometricType === "iris"
                          ? t(lang, "profile.biometricIris")
                          : t(lang, "profile.biometricOff")
                    : t(lang, "profile.biometricOff")}
                </Text>
              </View>
              <Switch
                value={biometricEnrolled}
                onValueChange={handleBiometricToggle}
                disabled={bioToggleLoading}
                trackColor={{ false: emp.inputBorder, true: emp.success }}
                thumbColor={emp.white}
                accessibilityRole="switch"
                accessibilityLabel={t(lang, "profile.biometric")}
                accessibilityState={{ checked: biometricEnrolled }}
                style={styles.bioSwitch}
              />
            </View>
          </View>
        )}

        <View style={styles.spacer} />

        {/* Logout */}
        <View>
          <Animated.View style={logoutPress.scaleStyle}>
            <Pressable
              style={({ pressed }) => [
                styles.logoutBtn,
                pressed && styles.logoutBtnPressed,
              ]}
              onPress={handleLogout}
              onPressIn={logoutPress.onPressIn}
              onPressOut={logoutPress.onPressOut}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "auth.logout")}
            >
              <Icon name="log-out-outline" size={20} color={destructive.text} />
              <Text style={styles.logoutText}>{t(lang, "auth.logout")}</Text>
            </Pressable>
          </Animated.View>

          <Text style={styles.version}>
            Pure Alpha Employee v{Constants.expoConfig?.version ?? "1.0"}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: emp.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: emp.text,
    letterSpacing: -0.3,
  },

  // -- Employee Info Card -------------------------------------------------------
  card: {
    backgroundColor: emp.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    ...shadow.sm,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: emp.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: emp.primary,
  },
  name: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: emp.text,
  },
  meta: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },

  // -- Actions Card -------------------------------------------------------------
  actionsCard: {
    backgroundColor: emp.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    overflow: "hidden",
    ...shadow.sm,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
    minHeight: TOUCH_TARGET,
  },
  actionDivider: {
    height: 1,
    backgroundColor: emp.cardBorder,
    marginHorizontal: spacing.lg,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: emp.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: emp.text,
    lineHeight: 21,
  },
  langBadge: {
    backgroundColor: emp.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  langBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_700Bold",
    color: emp.primary,
  },

  bioTextCol: {
    flex: 1,
    gap: 2,
  },
  bioStatus: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: emp.success,
    lineHeight: 15,
  },
  bioStatusOff: {
    color: emp.textMuted,
  },
  bioSwitch: {
    minHeight: TOUCH_TARGET,
  },
  spacer: {
    flex: 1,
  },

  // -- Logout -------------------------------------------------------------------
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: destructive.bg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: destructive.border,
    paddingVertical: 14,
    minHeight: TOUCH_TARGET,
  },
  logoutBtnPressed: {
    opacity: 0.7,
  },
  logoutText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: destructive.text,
  },
  version: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: emp.textMuted,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});

export default function ProfileScreen() {
  return (
    <ErrorBoundary>
      <ProfileScreenInner />
    </ErrorBoundary>
  );
}
