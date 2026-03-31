// =============================================================================
// Employee App -- Login Screen (warm cream + card layout + PIN dots)
// Supports QR pre-fill (hotel already onboarded) + biometric enrollment modal
// =============================================================================

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  UIManager,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { emp, fontSize, radius, spacing, shadow, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  setEmployeeToken,
  setHotelSlug,
  setHotelId,
  setHotelOnboarded,
  isHotelOnboarded,
  getHotelSlug,
  getHotelId,
  isBiometricEnrolled,
  setBiometricCredentials,
} from "@/lib/auth";
import { resolveHotel, loginWithPin, loginWithCredentials } from "@/lib/employee-api";
import { checkBiometricAvailability, authenticateWithBiometric } from "@/lib/biometric";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type AuthTab = "pin" | "credentials";

const PIN_LENGTH = 4;
const PIN_DOT_SIZE = 40;

function LoginScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const setAuthenticated = useAppStore((s) => s.setAuthenticated);
  const setEmployee = useAppStore((s) => s.setEmployee);
  const setHotel = useAppStore((s) => s.setHotel);

  const [tab, setTab] = useState<AuthTab>("pin");
  const [hotelSlugInput, setHotelSlugInput] = useState("");
  const [resolvedHotelId, setResolvedHotelId] = useState<string | null>(null);
  const [resolvedHotelName, setResolvedHotelName] = useState<string | null>(null);
  const [hotelError, setHotelError] = useState<string | null>(null);
  const [resolvingHotel, setResolvingHotel] = useState(false);
  const [hotelResolved, setHotelResolved] = useState(false);

  // PIN fields -- hidden TextInput + visual dots (Group Portal pattern)
  const [loginInput, setLoginInput] = useState("");
  const [pin, setPin] = useState("");
  const pinInputRef = useRef<TextInput>(null);
  const loginInProgressRef = useRef(false);
  const pinValueRef = useRef("");

  // Credentials fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Biometric enrollment modal
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [biometricType, setBiometricType] = useState<string>("none");
  const pendingLoginDataRef = useRef<{
    login: string;
    pin: string;
    token: string;
    employee: { id: string; name: string; department: string; position: string };
  } | null>(null);

  // -- Check if hotel already onboarded on mount ------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const onboarded = await isHotelOnboarded();
      if (!onboarded || cancelled) return;

      const [savedSlug, savedHotelId] = await Promise.all([
        getHotelSlug(),
        getHotelId(),
      ]);
      if (!savedSlug || !savedHotelId || cancelled) return;

      const res = await resolveHotel(savedSlug);
      if (cancelled) return;
      if (res.status === "success" && res.data) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setHotelSlugInput(savedSlug);
        setResolvedHotelId(res.data.hotelId);
        setResolvedHotelName(res.data.hotelName);
        setHotelResolved(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // -- Resolve hotel slug -----------------------------------------------------
  const handleResolveHotel = useCallback(async () => {
    const slug = hotelSlugInput.trim().toLowerCase();
    if (!slug) return;

    setResolvingHotel(true);
    setHotelError(null);

    try {
      const res = await resolveHotel(slug);
      if (res.status === "success" && res.data) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setResolvedHotelId(res.data.hotelId);
        setResolvedHotelName(res.data.hotelName);
        setHotelResolved(true);
        // Persist for future sessions
        await Promise.all([
          setHotelSlug(slug),
          setHotelId(res.data.hotelId),
          setHotelOnboarded(),
        ]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setHotelError(res.errorMessage ?? t(lang, "welcome.hotelNotFound"));
        setResolvedHotelId(null);
        setResolvedHotelName(null);
        setHotelResolved(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {
      setHotelError(t(lang, "common.networkError"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setResolvingHotel(false);
    }
  }, [hotelSlugInput, lang]);

  // -- Navigate to dashboard after biometric enrollment decision ----------------
  const navigateToDashboard = useCallback(() => {
    router.replace("/(employee)/dashboard");
  }, []);

  // -- Shared login success handler -------------------------------------------
  const handleLoginSuccess = useCallback(
    async (data: {
      token: string;
      employee: { id: string; name: string; department: string; position: string };
    }) => {
      const slug = hotelSlugInput.trim().toLowerCase();
      const hid = resolvedHotelId;
      const hname = resolvedHotelName;
      if (!hid) return; // guard against stale closure
      await Promise.all([
        setEmployeeToken(data.token),
        setHotelSlug(slug),
        setHotelId(hid),
        setHotelOnboarded(),
      ]);

      setEmployee({
        id: data.employee.id,
        name: data.employee.name,
        department: data.employee.department,
        position: data.employee.position,
      });
      setHotel({
        slug,
        id: hid,
        name: hname ?? slug,
      });
      setAuthenticated(true);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Check biometric availability for enrollment (only for PIN login -- credentials login has no PIN to cache)
      // Use pinValueRef (sync ref) instead of pin state (stale in closure after auto-submit)
      const currentPin = pinValueRef.current;
      if (tab === "pin" && currentPin) {
        const alreadyEnrolled = await isBiometricEnrolled();
        if (!alreadyEnrolled) {
          const bio = await checkBiometricAvailability();
          if (bio.available) {
            pendingLoginDataRef.current = {
              login: loginInput.trim(),
              pin: currentPin,
              token: data.token,
              employee: data.employee,
            };
            setBiometricType(bio.type);
            setShowBiometricModal(true);
            return; // Don't navigate yet -- modal will handle it
          }
        }
      }

      navigateToDashboard();
    },
    [
      hotelSlugInput, resolvedHotelId, resolvedHotelName,
      setEmployee, setHotel, setAuthenticated,
      tab, loginInput, pin, username, navigateToDashboard,
    ],
  );

  // -- Biometric enrollment handlers ------------------------------------------
  const handleBiometricAccept = useCallback(async () => {
    const data = pendingLoginDataRef.current;
    if (!data) {
      setShowBiometricModal(false);
      navigateToDashboard();
      return;
    }

    // Verify identity before saving biometric credentials
    const success = await authenticateWithBiometric(t(lang, "auth.biometricPrompt"), { allowDeviceFallback: true });

    if (success) {
      // Save credentials regardless -- login+pin validated by server during login
      if (data.login && data.pin) {
        await setBiometricCredentials(data.login, data.pin);
        useAppStore.getState().setBiometricEnrolled(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      // User cancelled biometric -- still proceed to dashboard (enrollment skipped)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    pendingLoginDataRef.current = null;
    setShowBiometricModal(false);
    navigateToDashboard();
  }, [lang, navigateToDashboard]);

  const handleBiometricDecline = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pendingLoginDataRef.current = null;
    setShowBiometricModal(false);
    navigateToDashboard();
  }, [navigateToDashboard]);

  // -- PIN login --------------------------------------------------------------
  const handlePinLogin = useCallback(
    async (pinVal?: string) => {
      if (loginInProgressRef.current) return;
      if (!resolvedHotelId) {
        setError(t(lang, "welcome.enterHotelFirst"));
        return;
      }
      const loginVal = loginInput.trim();
      if (!loginVal) return;
      const finalPin = pinVal ?? pin;
      if (finalPin.length !== PIN_LENGTH) return;

      loginInProgressRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const res = await loginWithPin(loginVal, finalPin, resolvedHotelId);
        if (res.status === "success" && res.data) {
          await handleLoginSuccess(res.data);
        } else {
          setError(res.errorMessage ?? t(lang, "auth.invalidCredentials"));
          setPin("");
          pinInputRef.current?.focus();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } finally {
        setLoading(false);
        loginInProgressRef.current = false;
      }
    },
    [resolvedHotelId, loginInput, pin, lang, handleLoginSuccess],
  );

  // -- PIN change handler (hidden TextInput) ----------------------------------
  const handlePinChange = useCallback(
    (value: string) => {
      const cleaned = value.replace(/\D/g, "").slice(0, PIN_LENGTH);
      setPin(cleaned);
      pinValueRef.current = cleaned;

      // Auto-submit when all digits entered
      if (cleaned.length === PIN_LENGTH) {
        handlePinLogin(cleaned);
      }
    },
    [handlePinLogin],
  );

  // -- Credentials login ------------------------------------------------------
  const handleCredentialsLogin = useCallback(async () => {
    if (loginInProgressRef.current) return;
    if (!resolvedHotelId) {
      setError(t(lang, "welcome.enterHotelFirst"));
      return;
    }
    const u = username.trim();
    const p = password;
    if (!u || !p) return;

    loginInProgressRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const res = await loginWithCredentials(u, p, resolvedHotelId);
      if (res.status === "success" && res.data) {
        await handleLoginSuccess(res.data);
      } else {
        setError(res.errorMessage ?? t(lang, "auth.invalidCredentials"));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
      loginInProgressRef.current = false;
    }
  }, [resolvedHotelId, username, password, lang, handleLoginSuccess]);

  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const handleBack = () => {
    if (canGoBack) {
      router.back();
    } else {
      router.replace("/(auth)/welcome");
    }
  };

  const handleChangeHotel = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHotelResolved(false);
    setResolvedHotelId(null);
    setResolvedHotelName(null);
    setHotelSlugInput("");
    setError(null);
    setPin("");
  };

  return (
    <View style={styles.container}>
      {/* Gradient background */}
      <LinearGradient
        colors={[emp.bg, emp.white, emp.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + spacing.xl,
              paddingBottom: insets.bottom + spacing["4xl"],
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <Pressable
            onPress={handleBack}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "common.back")}
          >
            <View style={styles.backBtnCircle}>
              <Icon name="chevron-back" size={22} color={emp.text} />
            </View>
          </Pressable>

          <Text style={styles.title}>{t(lang, "auth.login")}</Text>

          {/* Glass Card */}
          <View style={styles.card}>
            {/* Hotel Slug Step */}
            {!hotelResolved ? (
              <View style={styles.section}>
                <Text style={styles.label}>{t(lang, "welcome.hotelSlug")}</Text>
                <View style={styles.hotelRow}>
                  <TextInput
                    style={[styles.input, styles.hotelInput]}
                    value={hotelSlugInput}
                    onChangeText={(v) => {
                      setHotelSlugInput(v);
                      setHotelError(null);
                    }}
                    placeholder={t(lang, "welcome.hotelSlugPlaceholder")}
                    placeholderTextColor={emp.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleResolveHotel}
                    accessibilityLabel={t(lang, "welcome.hotelSlug")}
                  />
                  <Pressable
                    style={[
                      styles.resolveBtn,
                      !hotelSlugInput.trim() && styles.disabledBtn,
                    ]}
                    onPress={handleResolveHotel}
                    disabled={!hotelSlugInput.trim() || resolvingHotel}
                    accessibilityRole="button"
                    accessibilityLabel={t(lang, "common.confirm")}
                  >
                    {resolvingHotel ? (
                      <ActivityIndicator size="small" color={emp.white} />
                    ) : (
                      <Icon name="checkmark" size={20} color={emp.white} />
                    )}
                  </Pressable>
                </View>
                {hotelError && (
                  <Text style={styles.errorText} accessibilityLiveRegion="assertive">{hotelError}</Text>
                )}
              </View>
            ) : (
              <>
                {/* Hotel Badge (resolved) with "Change hotel" */}
                <Pressable
                  style={styles.hotelBadge}
                  onPress={handleChangeHotel}
                  accessibilityRole="button"
                  accessibilityLabel={t(lang, "auth.changeHotel")}
                >
                  <Icon name="business" size={18} color={emp.success} />
                  <Text style={styles.hotelBadgeText} numberOfLines={1}>
                    {resolvedHotelName}
                  </Text>
                  <Text style={styles.changeHotelLink}>
                    {t(lang, "auth.changeHotel")}
                  </Text>
                </Pressable>

                {/* Tab Switcher */}
                <View style={styles.tabRow} accessibilityRole="tablist">
                  <Pressable
                    style={[styles.tabBtn, tab === "pin" && styles.tabBtnActive]}
                    onPress={() => {
                      setTab("pin");
                      setError(null);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === "pin" }}
                    accessibilityLabel={t(lang, "auth.pinTab")}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        tab === "pin" && styles.tabTextActive,
                      ]}
                    >
                      {t(lang, "auth.pinTab")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.tabBtn,
                      tab === "credentials" && styles.tabBtnActive,
                    ]}
                    onPress={() => {
                      setTab("credentials");
                      setError(null);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === "credentials" }}
                    accessibilityLabel={t(lang, "auth.credentialsTab")}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        tab === "credentials" && styles.tabTextActive,
                      ]}
                    >
                      {t(lang, "auth.credentialsTab")}
                    </Text>
                  </Pressable>
                </View>

                {/* PIN Tab */}
                {tab === "pin" && (
                  <View style={styles.section}>
                    <Text style={styles.label}>
                      {t(lang, "auth.username")}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={loginInput}
                      onChangeText={setLoginInput}
                      placeholder={t(lang, "auth.username")}
                      placeholderTextColor={emp.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      accessibilityLabel={t(lang, "auth.username")}
                    />

                    <Text style={[styles.label, { marginTop: spacing.lg }]}>
                      {t(lang, "auth.enterPin")}
                    </Text>

                    {/* PIN Dots (Group Portal pattern) */}
                    <Pressable
                      style={styles.pinDotsRow}
                      onPress={() => pinInputRef.current?.focus()}
                      accessibilityRole="button"
                      accessibilityLabel={t(lang, "auth.enterPin")}
                    >
                      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.pinDot,
                            i < pin.length && styles.pinDotFilled,
                          ]}
                          accessible={true}
                          accessibilityLabel={
                            lang === "pl"
                              ? `Cyfra ${i + 1} z ${PIN_LENGTH}`
                              : `Digit ${i + 1} of ${PIN_LENGTH}`
                          }
                        />
                      ))}
                    </Pressable>

                    {/* Hidden TextInput for PIN entry */}
                    <TextInput
                      ref={pinInputRef}
                      style={styles.hiddenInput}
                      value={pin}
                      onChangeText={handlePinChange}
                      keyboardType="number-pad"
                      maxLength={PIN_LENGTH}
                      secureTextEntry
                      autoFocus={false}
                      accessibilityLabel={`PIN`}
                      importantForAccessibility="yes"
                    />
                  </View>
                )}

                {/* Credentials Tab */}
                {tab === "credentials" && (
                  <View style={styles.section}>
                    <Text style={styles.label}>
                      {t(lang, "auth.username")}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={username}
                      onChangeText={setUsername}
                      placeholder={t(lang, "auth.username")}
                      placeholderTextColor={emp.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      accessibilityLabel={t(lang, "auth.username")}
                    />

                    <Text style={[styles.label, { marginTop: spacing.lg }]}>
                      {t(lang, "auth.password")}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={password}
                      onChangeText={setPassword}
                      placeholder={t(lang, "auth.password")}
                      placeholderTextColor={emp.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="go"
                      onSubmitEditing={handleCredentialsLogin}
                      accessibilityLabel={t(lang, "auth.password")}
                    />

                    <Pressable
                      style={[
                        styles.loginBtn,
                        loading && styles.disabledBtn,
                      ]}
                      onPress={handleCredentialsLogin}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityLabel={t(lang, "auth.login")}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color={emp.white} />
                      ) : (
                        <Text style={styles.loginBtnText}>
                          {t(lang, "auth.login")}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                )}

                {/* Error */}
                {error && (
                  <View style={styles.errorCard} accessibilityLiveRegion="assertive">
                    <Icon name="alert-circle" size={18} color={emp.danger} />
                    <Text style={styles.errorCardText}>{error}</Text>
                  </View>
                )}

                {/* Loading indicator for PIN (auto-submit) */}
                {loading && tab === "pin" && (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={emp.primary} />
                    <Text style={styles.loadingText}>
                      {t(lang, "auth.logging")}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Biometric Enrollment Modal */}
      <Modal
        visible={showBiometricModal}
        transparent
        animationType="fade"
        onRequestClose={handleBiometricDecline}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} accessibilityViewIsModal={true}>
            <View style={styles.modalIconCircle}>
              <Icon name="shield-checkmark-outline" size={40} color={emp.primary} />
            </View>
            <Text style={styles.modalTitle}>
              {t(lang, "auth.biometricEnroll")}
            </Text>
            <Text style={styles.modalDesc}>
              {t(lang, "auth.biometricEnrollDesc")}
            </Text>
            <Pressable
              style={styles.modalPrimaryBtn}
              onPress={handleBiometricAccept}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "auth.biometricAccept")}
            >
              <Icon name="finger-print-outline" size={22} color={emp.white} />
              <Text style={styles.modalPrimaryBtnText}>
                {t(lang, "auth.biometricAccept")}
              </Text>
            </Pressable>
            <Pressable
              style={styles.modalSecondaryBtn}
              onPress={handleBiometricDecline}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "auth.biometricDecline")}
            >
              <Text style={styles.modalSecondaryBtnText}>
                {t(lang, "auth.biometricDecline")}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: emp.bg },
  flex1: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },

  backBtn: {
    alignSelf: "flex-start",
  },
  backBtnCircle: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: emp.surface,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: emp.text,
    letterSpacing: -0.3,
  },

  // -- Glass Card ---------------------------------------------------------------
  card: {
    backgroundColor: emp.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing.xl,
    gap: spacing.xl,
    ...shadow.md,
  },

  section: { gap: spacing.sm },
  label: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: emp.textSecondary,
    lineHeight: 18,
  },
  input: {
    backgroundColor: emp.inputBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: emp.inputBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: emp.text,
    minHeight: TOUCH_TARGET,
  },

  // -- Hotel Slug ---------------------------------------------------------------
  hotelRow: { flexDirection: "row", gap: spacing.sm },
  hotelInput: { flex: 1 },
  resolveBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: emp.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledBtn: { opacity: 0.5 },
  hotelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: emp.successLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: TOUCH_TARGET,
  },
  hotelBadgeText: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: emp.success,
    lineHeight: 21,
  },
  changeHotelLink: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: emp.textMuted,
  },

  // -- Tab Switcher -------------------------------------------------------------
  tabRow: {
    flexDirection: "row",
    backgroundColor: emp.inputBg,
    borderRadius: radius.md,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: radius.sm,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  tabBtnActive: {
    backgroundColor: emp.primary,
    ...Platform.select({
      ios: {
        shadowColor: emp.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  tabText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: emp.textMuted,
  },
  tabTextActive: {
    color: emp.white,
    fontFamily: "Inter_600SemiBold",
  },

  // -- PIN Dots (Group Portal pattern) ------------------------------------------
  pinDotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
    paddingVertical: spacing.xl,
  },
  pinDot: {
    width: PIN_DOT_SIZE,
    height: PIN_DOT_SIZE,
    borderRadius: PIN_DOT_SIZE / 2,
    borderWidth: 2,
    borderColor: emp.inputBorder,
    backgroundColor: emp.inputBg,
  },
  pinDotFilled: {
    backgroundColor: emp.primary,
    borderColor: emp.primary,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },

  // -- Login Button -------------------------------------------------------------
  loginBtn: {
    backgroundColor: emp.primary,
    borderRadius: radius["2xl"],
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.lg,
    minHeight: TOUCH_TARGET + 8,
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: emp.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  loginBtnText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: emp.white,
  },

  // -- Error / Loading ----------------------------------------------------------
  errorText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.danger,
    lineHeight: 18,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: emp.dangerLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorCardText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.danger,
    lineHeight: 18,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.textMuted,
    lineHeight: 18,
  },

  // -- Biometric Enrollment Modal -----------------------------------------------
  modalOverlay: {
    flex: 1,
    backgroundColor: emp.overlay,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing["2xl"],
  },
  modalCard: {
    backgroundColor: emp.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing["2xl"],
    alignItems: "center",
    gap: spacing.lg,
    width: "100%",
    maxWidth: 360,
    ...shadow.lg,
  },
  modalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: emp.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: emp.text,
    textAlign: "center",
  },
  modalDesc: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: emp.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  modalPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: emp.primary,
    borderRadius: radius["2xl"],
    paddingVertical: spacing.lg,
    width: "100%",
    minHeight: TOUCH_TARGET + 8,
    marginTop: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: emp.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  modalPrimaryBtnText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: emp.white,
  },
  modalSecondaryBtn: {
    paddingVertical: spacing.md,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
  },
  modalSecondaryBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: emp.textMuted,
  },
});

export default function LoginScreen() {
  return (
    <ErrorBoundary>
      <LoginScreenInner />
    </ErrorBoundary>
  );
}
