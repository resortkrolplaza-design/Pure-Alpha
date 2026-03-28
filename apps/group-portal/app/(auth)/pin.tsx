// =============================================================================
// PIN Entry -- Group Portal (sequential flow: ID -> email -> PIN if needed)
// =============================================================================

import { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, Pressable, StyleSheet, TextInput, Alert,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  LayoutAnimation, UIManager,
} from "react-native";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { group, fontSize, radius, spacing, letterSpacing, shadow } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { verifyPin, fetchPortalInfo, loginByLink } from "@/lib/group-api";
import { persistLogin } from "@/lib/login-flow";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

const PIN_LENGTH = 6;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function PinScreenInner() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const lang = useAppStore((s) => s.lang);
  const setGroupTrackingId = useAppStore((s) => s.setGroupTrackingId);
  const params = useLocalSearchParams<{ trackingId?: string; hotelName?: string }>();

  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [trackingId, setTrackingId] = useState(params.trackingId ?? "");
  const [loading, setLoading] = useState(false);
  const [checkingInfo, setCheckingInfo] = useState(false);
  const [pinRequired, setPinRequired] = useState<boolean | null>(null);
  const [hotelName, setHotelName] = useState(params.hotelName ?? "");
  const [portalFound, setPortalFound] = useState(false);
  const pinInputRef = useRef<TextInput>(null);
  const infoFetchedRef = useRef("");

  useEffect(() => {
    if (params.trackingId) {
      setTrackingId(params.trackingId);
    }
  }, [params.trackingId]);

  // Auto-check portal info when arriving with trackingId from deep link
  useEffect(() => {
    if (params.trackingId && params.trackingId.length >= 6) {
      checkPortalInfo(params.trackingId);
    }
  }, [params.trackingId]);

  const checkPortalInfo = useCallback(async (id: string) => {
    if (infoFetchedRef.current === id) return;
    infoFetchedRef.current = id;
    setCheckingInfo(true);
    try {
      const res = await fetchPortalInfo(id);
      if (res.status === "success" && res.data) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setPinRequired(res.data.pinRequired);
        setPortalFound(true);
        if (res.data.hotelName) setHotelName(res.data.hotelName);
      } else {
        setPinRequired(null);
        setPortalFound(false);
        Alert.alert(t(lang, "auth.error"), res.errorMessage || t(lang, "common.error"));
      }
    } catch {
      setPinRequired(null);
      setPortalFound(false);
    } finally {
      setCheckingInfo(false);
    }
  }, [lang]);

  const handleCheckId = useCallback(() => {
    const id = trackingId.trim();
    if (id.length < 6) {
      Alert.alert(t(lang, "auth.error"), t(lang, "pin.enterTrackingId"));
      return;
    }
    checkPortalInfo(id);
  }, [trackingId, checkPortalInfo, lang]);

  const handlePinChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, PIN_LENGTH);
    setPin(digits);
    if (digits.length === PIN_LENGTH) {
      handleSubmit(digits);
    }
  };

  const handleSubmit = async (pinValue: string) => {
    if (loading) return;
    setLoading(true);
    try {
      if (!trackingId.trim()) {
        Alert.alert(t(lang, "auth.error"), t(lang, "pin.enterTrackingId"));
        setPin("");
        return;
      }
      const res = await verifyPin(trackingId.trim(), pinValue, email.trim().toLowerCase());
      if (res.status === "success" && res.data?.token) {
        await persistLogin(trackingId.trim(), {
          token: res.data.token,
          role: res.data.role ?? "participant",
          rsvpToken: res.data.rsvpToken,
          guest: res.data.guest,
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(group)/overview");
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t(lang, "auth.error"), res.errorMessage || t(lang, "pin.invalidPin"));
        setPin("");
      }
    } catch {
      Alert.alert(t(lang, "auth.error"), t(lang, "common.error"));
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          {canGoBack && (
            <Pressable
              onPress={() => router.back()}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.back")}
            >
              <Icon name="chevron-back" size={20} color={group.primary} />
              <Text style={styles.backText}>{t(lang, "common.back")}</Text>
            </Pressable>
          )}

          {/* Hotel name (resolved from portal info) */}
          {hotelName ? (
            <Text style={styles.hotelName}>{hotelName}</Text>
          ) : null}

          {/* Login form */}
          <View style={styles.card}>
            <View style={styles.lockCircle}>
              <Icon name="lock-closed-outline" size={22} color={group.primary} />
            </View>
            <Text style={styles.cardTitle}>{t(lang, "pin.loginWithPin")}</Text>

            {/* Step 1: Event ID */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>{t(lang, "pin.eventId")}</Text>
              <TextInput
                style={styles.input}
                placeholder={t(lang, "pin.trackingIdPlaceholder")}
                placeholderTextColor={group.textMuted}
                value={trackingId}
                onChangeText={(text) => {
                  setTrackingId(text);
                  // Reset portal state when ID changes
                  if (infoFetchedRef.current && infoFetchedRef.current !== text.trim()) {
                    setPinRequired(null);
                    setPortalFound(false);
                    infoFetchedRef.current = "";
                  }
                }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={200}
                editable={!loading}
              />
            </View>

            {/* Check ID button (before portal is found) */}
            {!portalFound && !checkingInfo && trackingId.trim().length >= 6 && (
              <Pressable
                style={styles.checkIdBtn}
                onPress={handleCheckId}
                accessibilityRole="button"
              >
                <Text style={styles.checkIdBtnText}>{t(lang, "common.confirm")}</Text>
                <Icon name="arrow-forward" size={18} color={group.white} />
              </Pressable>
            )}

            {checkingInfo && (
              <ActivityIndicator color={group.primary} style={styles.loader} />
            )}

            {/* Step 2: Email + PIN (only after portal found) */}
            {portalFound && (
              <View style={styles.step2}>
                {/* Email */}
                <View style={styles.inputSection}>
                  <Text style={styles.inputLabel}>{t(lang, "pin.yourEmail")}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="jan@example.com"
                    placeholderTextColor={group.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    maxLength={320}
                    editable={!loading}
                  />
                  <Text style={styles.inputHint}>{t(lang, "pin.emailHint")}</Text>
                </View>

                {/* PIN dots (only if pinRequired) */}
                {pinRequired === true && (
                  <View style={styles.dotsContainer}>
                    <Text style={styles.pinLabel}>{t(lang, "pin.protectedByPin")}</Text>
                    <Pressable
                      onPress={() => pinInputRef.current?.focus()}
                      style={styles.dots}
                      accessibilityRole="button"
                      accessibilityLabel={t(lang, "auth.enterPin")}
                    >
                      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                        <View
                          key={i}
                          style={[styles.dot, i < pin.length && styles.dotFilled]}
                        />
                      ))}
                    </Pressable>
                    <TextInput
                      ref={pinInputRef}
                      style={styles.hiddenInput}
                      value={pin}
                      onChangeText={handlePinChange}
                      keyboardType="number-pad"
                      maxLength={PIN_LENGTH}
                      autoFocus={false}
                      caretHidden
                      contextMenuHidden
                    />
                    <Text style={styles.pinHint}>{t(lang, "pin.codeSentByEmail")}</Text>
                    <Pressable
                      onPress={() => Alert.alert(t(lang, "pin.forgotPin"), t(lang, "pin.forgotPinHint"))}
                      accessibilityRole="button"
                      style={styles.forgotBtn}
                    >
                      <Text style={styles.forgotLink}>{t(lang, "pin.forgotPin")}</Text>
                    </Pressable>
                  </View>
                )}

                {/* Login button (when PIN not required -- use auth-by-link) */}
                {pinRequired === false && (
                  <Pressable
                    style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                    onPress={async () => {
                      if (loading) return;
                      setLoading(true);
                      try {
                        const res = await loginByLink(trackingId.trim());
                        if (res.status === "success" && res.data?.token) {
                          await persistLogin(trackingId.trim(), {
                            token: res.data.token,
                            role: res.data.role ?? "participant",
                            rsvpToken: res.data.rsvpToken,
                            guest: res.data.guest,
                          });
                          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          router.replace("/(group)/overview");
                        } else {
                          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                          Alert.alert(t(lang, "auth.error"), res.errorMessage || t(lang, "common.error"));
                        }
                      } catch {
                        Alert.alert(t(lang, "auth.error"), t(lang, "common.error"));
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading || !trackingId.trim()}
                    accessibilityRole="button"
                  >
                    {loading ? (
                      <ActivityIndicator color={group.white} />
                    ) : (
                      <Text style={styles.loginBtnText}>{t(lang, "auth.login")}</Text>
                    )}
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={group.primary} />
            </View>
          )}

          <Text style={styles.footer}>{t(lang, "overview.poweredBy")}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing["2xl"],
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: 44,
    minWidth: 44,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  backText: { fontSize: fontSize.base, color: group.primary, fontFamily: "Inter_500Medium" },

  hotelName: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
    textAlign: "center",
    marginBottom: spacing.lg,
  },

  // Card shared
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: group.card,
    borderRadius: radius["2xl"],
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing["2xl"],
    alignItems: "center",
    gap: spacing.md,
    ...shadow.md,
  },

  // Card 1: Open link
  mailCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: group.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
    textAlign: "center",
  },
  cardDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
    marginVertical: spacing.xl,
    gap: spacing.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: group.cardBorder },
  dividerText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },

  // Card 2: Login form
  lockCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: group.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  inputSection: { width: "100%", gap: spacing.xs },
  inputLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  input: {
    backgroundColor: group.bg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    minHeight: 48,
    textAlign: "center",
  },
  inputHint: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 16,
  },

  // Check ID button
  checkIdBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: group.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 48,
    width: "100%",
    ...shadow.sm,
  },
  checkIdBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
  loader: { marginVertical: spacing.md },

  // Step 2 (email + PIN/login)
  step2: {
    width: "100%",
    gap: spacing.md,
  },

  // PIN dots
  dotsContainer: { alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  pinLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  dots: { flexDirection: "row", gap: spacing.md },
  dot: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: group.cardBorder,
    backgroundColor: group.bg,
  },
  dotFilled: {
    backgroundColor: group.primary,
    borderColor: group.primary,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  pinHint: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  forgotBtn: { minHeight: 44, justifyContent: "center" },
  forgotLink: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.primary,
    textAlign: "center",
  },

  // Login button (no PIN)
  loginBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginTop: spacing.sm,
    ...shadow.sm,
  },
  loginBtnDisabled: {
    backgroundColor: group.disabledBg,
  },
  loginBtnText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: group.white,
  },

  loadingOverlay: { marginTop: spacing.lg },
  footer: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    marginTop: spacing["2xl"],
  },
});

// ── Default export wrapped in ErrorBoundary ──────────────────────────────────

export default function PinScreen() {
  return (
    <ErrorBoundary>
      <PinScreenInner />
    </ErrorBoundary>
  );
}
