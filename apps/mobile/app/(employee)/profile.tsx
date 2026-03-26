// =============================================================================
// Employee App -- Profile (Info + Logout)
// =============================================================================

import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Alert, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { employee, fontSize, radius, spacing, shadow, destructive } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useScalePress } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { logout, getEmployeeToken, decodeBase64 } from "@/lib/auth";

interface EmployeeProfile {
  name: string;
  department: string;
  position: string;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const reset = useAppStore((s) => s.reset);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const { scaleStyle, onPressIn, onPressOut } = useScalePress();

  useEffect(() => {
    (async () => {
      const token = await getEmployeeToken();
      if (!token) return;
      try {
        const parts = token.split(".");
        if (parts.length < 2) return;
        const payload = JSON.parse(decodeBase64(parts[1]));
        setProfile({
          name: payload.employeeName ?? payload.name ?? "",
          department: payload.department ?? "",
          position: payload.position ?? "",
        });
      } catch {
        // Token decode failed -- keep placeholder
      }
    })();
  }, []);

  const initials = profile?.name
    ? profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "";

  const handleLogout = () => {
    Alert.alert(
      t(lang, "auth.logout"),
      t(lang, "emp.logoutConfirm"),
      [
        { text: t(lang, "common.cancel"), style: "cancel" },
        {
          text: t(lang, "auth.logout"),
          style: "destructive",
          onPress: async () => {
            await logout();
            reset();
            router.replace("/");
          },
        },
      ],
    );
  };

  return (
    <LinearGradient colors={[employee.bgFrom, employee.bgTo]} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing["4xl"] }]}>
        <View>
          <Text style={styles.title}>{t(lang, "emp.tab.profile")}</Text>
        </View>

        {/* Employee Info Card */}
        <View style={styles.card}>
          <View style={styles.avatar}>
            {initials ? (
              <Text style={styles.avatarInitials}>{initials}</Text>
            ) : (
              <Icon name="person" size={28} color={employee.brand} />
            )}
          </View>
          <Text style={styles.name}>{profile?.name || t(lang, "emp.tab.profile")}</Text>
          <Text style={styles.meta}>
            {profile
              ? [profile.position, profile.department].filter(Boolean).join(" · ") || t(lang, "mode.employee")
              : t(lang, "emp.profilePlaceholder")}
          </Text>
        </View>

        <View style={styles.spacer} />

        {/* Logout */}
        <View>
          <Animated.View style={scaleStyle}>
            <Pressable
              style={({ pressed }) => [styles.logoutBtn, pressed && styles.logoutBtnPressed]}
              onPress={handleLogout}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "auth.logout")}
            >
              <Text style={styles.logoutText}>{t(lang, "auth.logout")}</Text>
            </Pressable>
          </Animated.View>

          <Text style={styles.version}>Pure Alpha Employee App v{Constants.expoConfig?.version ?? "1.0"}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.xl },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: employee.text, letterSpacing: -0.3 },
  card: {
    backgroundColor: employee.card, borderRadius: radius.xl, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing.xl, alignItems: "center", gap: spacing.md, ...shadow.sm,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: employee.accent, alignItems: "center", justifyContent: "center",
  },
  avatarInitials: {
    fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: employee.brand,
  },
  name: { fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: employee.text },
  meta: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textMuted, textAlign: "center", lineHeight: 18 },
  spacer: { flex: 1 },
  logoutBtn: {
    backgroundColor: destructive.bg, borderRadius: radius.full, borderWidth: 1, borderColor: destructive.border,
    paddingVertical: 14, alignItems: "center",
  },
  logoutBtnPressed: { opacity: 0.7 },
  logoutText: { fontSize: fontSize.base, fontFamily: "Inter_600SemiBold", color: destructive.text },
  version: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: employee.textMuted, textAlign: "center", marginTop: spacing.xl },
});
