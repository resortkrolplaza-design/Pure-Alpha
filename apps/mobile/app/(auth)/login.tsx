// =============================================================================
// Guest Login — Deep Link (primary) + Token Paste (secondary)
// =============================================================================

import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Animated, ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { NAVY, GOLD, guest, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useFadeIn, useSlideUp, useScalePress } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore, useGuestStore } from "@/lib/store";
import { setPortalToken, setAppMode } from "@/lib/auth";
import { portalFetch } from "@/lib/api";
import { mapInitResponse } from "@/lib/portal-helpers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const setMode = useAppStore((s) => s.setMode);
  const setStorePortalToken = useAppStore((s) => s.setPortalToken);
  const setPortalData = useGuestStore((s) => s.setPortalData);

  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);

  const fadeStyle = useFadeIn(0);
  const deepLinkSlide = useSlideUp(100);
  const dividerSlide = useSlideUp(200);
  const tokenSlide = useSlideUp(300);
  const { scaleStyle, onPressIn, onPressOut } = useScalePress();

  const handleTokenLogin = async () => {
    const token = tokenInput.trim();
    if (!token) return;

    // P1-24: Validate token is a UUID to prevent path traversal
    if (!UUID_RE.test(token)) {
      Alert.alert(t(lang, "auth.error"), t(lang, "auth.invalidToken"));
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      const initRes = await portalFetch<Record<string, unknown>>(token, "");

      if (initRes.status !== "success" || !initRes.data) {
        Alert.alert(t(lang, "auth.error"), initRes.errorMessage || t(lang, "auth.invalidToken"));
        return;
      }

      const portalData = mapInitResponse(initRes.data);

      await Promise.all([
        setPortalToken(token),
        setAppMode("guest"),
      ]);
      setMode("guest");
      setStorePortalToken(token);
      setPortalData(portalData);

      router.replace("/(guest)/stay");
    } catch {
      Alert.alert(t(lang, "auth.error"), t(lang, "common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[guest.bg, guest.bgLight, guest.bg]} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <Animated.View style={[styles.content, fadeStyle]}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable
                onPress={() => router.back()}
                style={styles.backBtn}
                accessibilityLabel={t(lang, "common.back")}
                accessibilityRole="button"
              >
                <View style={styles.backRow}>
                  <Icon name="chevron-back" size={20} color={GOLD} />
                  <Text style={styles.backText}>{t(lang, "common.back")}</Text>
                </View>
              </Pressable>
              <View style={styles.logoCircle}>
                <Icon name="star" size={24} color={guest.textOnGold} />
              </View>
              <Text style={styles.title}>Pure Loyal</Text>
              <Text style={styles.subtitle}>{t(lang, "mode.guestDesc")}</Text>
            </View>

            {/* Primary: Deep Link Instruction */}
            <Animated.View style={[styles.section, deepLinkSlide]}>
              <View style={styles.deepLinkCard}>
                <View style={styles.deepLinkIconRow}>
                  <View style={styles.deepLinkIconCircle}>
                    <Icon name="mail-outline" size={24} color={GOLD} />
                  </View>
                  <Text style={styles.deepLinkTitle}>{t(lang, "auth.deepLinkPrimary")}</Text>
                </View>
                <Text style={styles.deepLinkHint}>{t(lang, "auth.deepLinkHint")}</Text>
              </View>
            </Animated.View>

            {/* Divider */}
            <Animated.View style={[styles.dividerRow, dividerSlide]}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t(lang, "auth.orPasteToken")}</Text>
              <View style={styles.dividerLine} />
            </Animated.View>

            {/* Secondary: Token Paste */}
            <Animated.View style={[styles.section, tokenSlide]}>
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
                  onSubmitEditing={handleTokenLogin}
                  accessibilityLabel={t(lang, "auth.tokenLabel")}
                />
              </View>

              <Animated.View style={scaleStyle}>
                <Pressable
                  style={({ pressed }) => [
                    styles.loginBtn,
                    pressed && styles.loginBtnPressed,
                    (loading || !tokenInput.trim()) && styles.loginBtnDisabled,
                  ]}
                  onPress={handleTokenLogin}
                  onPressIn={onPressIn}
                  onPressOut={onPressOut}
                  disabled={loading || !tokenInput.trim()}
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

              <Text style={styles.tokenHint}>{t(lang, "auth.tokenHint")}</Text>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { flex: 1, paddingHorizontal: spacing["2xl"], gap: spacing["2xl"] },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: { alignItems: "center", gap: spacing.sm },
  backBtn: { alignSelf: "flex-start", marginBottom: spacing.xl, minHeight: 44, minWidth: 44 },
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

  // ── Deep Link Card ──────────────────────────────────────────────────────────
  section: {},
  deepLinkCard: {
    backgroundColor: guest.glass,
    borderWidth: 1,
    borderColor: guest.glassBorder,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  deepLinkIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  deepLinkIconCircle: {
    width: 44, height: 44, borderRadius: radius.full,
    backgroundColor: guest.goldGlow,
    borderWidth: 1,
    borderColor: guest.goldBorder,
    alignItems: "center", justifyContent: "center",
  },
  deepLinkTitle: {
    fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: guest.text,
    flex: 1,
  },
  deepLinkHint: {
    fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textSecondary,
    lineHeight: 20,
  },

  // ── Divider ─────────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: guest.inputBorder,
  },
  dividerText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: guest.textMuted,
  },

  // ── Token Input ─────────────────────────────────────────────────────────────
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
    paddingVertical: 16, alignItems: "center", marginTop: spacing.md,
    minHeight: 44,
    ...shadow.gold,
  },
  loginBtnPressed: { opacity: 0.8 },
  loginBtnDisabled: { opacity: 0.5 },
  loginBtnText: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: NAVY },
  tokenHint: {
    fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: guest.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});
