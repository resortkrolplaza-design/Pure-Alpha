// =============================================================================
// Guest Login — Email + Portal Token
// =============================================================================

import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { NAVY, NAVY_LIGHT, GOLD, guest, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useFadeIn, useScalePress } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore, useGuestStore } from "@/lib/store";
import { setPortalToken, setAppMode } from "@/lib/auth";
import { portalFetch, API_BASE } from "@/lib/api";
import { mapInitResponse } from "@/lib/portal-helpers";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const setStorePortalToken = useAppStore((s) => s.setPortalToken);
  const setPortalData = useGuestStore((s) => s.setPortalData);

  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);

  const fadeStyle = useFadeIn(0);
  const { scaleStyle, onPressIn, onPressOut } = useScalePress();

  const handleLogin = async () => {
    // Portal token login — guest receives token via email/QR/deep link
    const token = tokenInput.trim();
    if (!token) return;

    setLoading(true);
    try {
      // Fetch portal data using the token
      // API returns: { member, tier, hotel, program, expiringPoints, cheapestReward, ... }
      const initRes = await portalFetch<Record<string, unknown>>(token, "");

      if (initRes.status !== "success" || !initRes.data) {
        Alert.alert(t(lang, "auth.error"), initRes.errorMessage || t(lang, "auth.invalidCredentials"));
        return;
      }

      const portalData = mapInitResponse(initRes.data);

      // Persist
      await Promise.all([
        setPortalToken(token),
        setAppMode("guest"),
      ]);
      setStorePortalToken(token);
      setPortalData(portalData);

      router.replace("/(guest)/stay");
    } catch (err) {
      Alert.alert(t(lang, "auth.error"), t(lang, "common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[NAVY, NAVY_LIGHT, NAVY]} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <Animated.View style={[styles.content, fadeStyle, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel={t(lang, "common.back")}>
              <View style={styles.backRow}>
                <Icon name="chevron-back" size={20} color={GOLD} />
                <Text style={styles.backText}>{t(lang, "common.back")}</Text>
              </View>
            </Pressable>
            <View style={styles.logoCircle}>
              <Icon name="star" size={24} color={NAVY} />
            </View>
            <Text style={styles.title}>Pure Loyal</Text>
            <Text style={styles.subtitle}>{t(lang, "mode.guestDesc")}</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t(lang, "auth.tokenLabel")}</Text>
              <TextInput
                style={styles.input}
                placeholder={t(lang, "auth.tokenPlaceholder")}
                placeholderTextColor={guest.textMuted}
                value={tokenInput}
                onChangeText={setTokenInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>

            <Animated.View style={scaleStyle}>
              <Pressable
                style={({ pressed }) => [styles.loginBtn, pressed && styles.loginBtnPressed, loading && styles.loginBtnDisabled]}
                onPress={handleLogin}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "auth.login")}
              >
                {loading ? (
                  <ActivityIndicator color={NAVY} />
                ) : (
                  <Text style={styles.loginBtnText}>{t(lang, "auth.login")}</Text>
                )}
              </Pressable>
            </Animated.View>
          </View>

          <View style={styles.spacer} />
        </Animated.View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing["2xl"], justifyContent: "space-between" },
  header: { alignItems: "center", gap: spacing.sm },
  backBtn: { alignSelf: "flex-start", marginBottom: spacing.xl, minHeight: 44 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontSize: fontSize.base, color: GOLD, fontFamily: "Inter_500Medium" },
  logoCircle: {
    width: 56, height: 56, borderRadius: radius.full,
    backgroundColor: GOLD, alignItems: "center", justifyContent: "center",
    ...shadow.gold,
  },
  title: {
    fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: guest.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textSecondary,
    lineHeight: 18,
  },
  form: { gap: spacing.xl },
  inputGroup: { gap: spacing.sm },
  label: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: guest.textSecondary },
  input: {
    backgroundColor: guest.inputBg,
    borderWidth: 1, borderColor: guest.inputBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14,
    fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: guest.text,
  },
  loginBtn: {
    backgroundColor: GOLD, borderRadius: radius.full,
    paddingVertical: 16, alignItems: "center", marginTop: spacing.sm,
    ...shadow.gold,
  },
  loginBtnPressed: { opacity: 0.8 },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: NAVY },
  spacer: { flex: 1 },
});
