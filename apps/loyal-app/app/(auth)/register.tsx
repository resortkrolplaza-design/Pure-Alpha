// =============================================================================
// Loyal App -- Register Screen (firstName, lastName, email, password, confirm)
// Navy + Gold glass card, keyboard avoiding, haptics
// =============================================================================

import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { loyal, fontSize, radius, spacing, letterSpacing, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { guestRegister } from "@/lib/loyal-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useSlideUp } from "@/lib/animations";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function RegisterScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const cardAnim = useSlideUp(100, 30);

  // -- Validation ---------------------------------------------------------------

  function validate(): boolean {
    let valid = true;
    setEmailError(null);
    setPasswordError(null);
    setConfirmError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError(t(lang, "auth.fieldRequired"));
      valid = false;
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError(t(lang, "auth.invalidEmail"));
      valid = false;
    }

    if (!password) {
      setPasswordError(t(lang, "auth.fieldRequired"));
      valid = false;
    } else if (password.length < 8) {
      setPasswordError(t(lang, "auth.passwordMinLength"));
      valid = false;
    }

    if (!confirmPassword) {
      setConfirmError(t(lang, "auth.fieldRequired"));
      valid = false;
    } else if (password !== confirmPassword) {
      setConfirmError(t(lang, "auth.passwordMismatch"));
      valid = false;
    }

    return valid;
  }

  // -- Register handler ---------------------------------------------------------

  async function handleRegister() {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await guestRegister({
        email: email.trim(),
        password,
        ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
      });

      if (res.status !== "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t(lang, "auth.registerError"), res.errorMessage ?? t(lang, "common.error"));
        setLoading(false);
        return;
      }

      // Success: show confirmation (backend always returns success for anti-enumeration)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t(lang, "auth.registerError"), t(lang, "common.error"));
    } finally {
      setLoading(false);
    }
  }

  // -- Success state ------------------------------------------------------------

  if (success) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[loyal.bg, loyal.bgDark, loyal.bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.successContainer, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.successIcon}>
            <Icon name="mail-outline" size={48} color={loyal.primary} />
          </View>
          <Text style={styles.successTitle}>{t(lang, "auth.activationSent")}</Text>
          <Text style={styles.successDesc}>{t(lang, "auth.checkEmail")}</Text>
          <Pressable
            style={styles.successButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.replace("/(auth)/login");
            }}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "auth.login")}
          >
            <Text style={styles.successButtonText}>{t(lang, "auth.login")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // -- Render -------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[loyal.bg, loyal.bgDark, loyal.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <Pressable
            style={styles.backButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "common.back")}
            hitSlop={12}
          >
            <Icon name="arrow-back" size={24} color={loyal.textSecondary} />
          </Pressable>

          {/* Glass card */}
          <View style={[styles.card, { opacity: cardAnim.opacity, transform: cardAnim.transform }]}>
            {/* Header */}
            <View style={styles.cardHeader}>
              <Icon name="person-add-outline" size={28} color={loyal.primary} />
              <Text style={styles.cardTitle}>{t(lang, "auth.register")}</Text>
            </View>

            {/* First name (optional) */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t(lang, "auth.firstName")}</Text>
              <View style={styles.inputWrapper}>
                <Icon name="person-outline" size={18} color={loyal.textMuted} />
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder={t(lang, "auth.firstName")}
                  placeholderTextColor={loyal.textDim}
                  autoCapitalize="words"
                  autoComplete="given-name"
                  returnKeyType="next"
                  onSubmitEditing={() => lastNameRef.current?.focus()}
                  editable={!loading}
                  accessibilityLabel={t(lang, "auth.firstName")}
                />
              </View>
            </View>

            {/* Last name (optional) */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t(lang, "auth.lastName")}</Text>
              <View style={styles.inputWrapper}>
                <Icon name="person-outline" size={18} color={loyal.textMuted} />
                <TextInput
                  ref={lastNameRef}
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder={t(lang, "auth.lastName")}
                  placeholderTextColor={loyal.textDim}
                  autoCapitalize="words"
                  autoComplete="family-name"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  editable={!loading}
                  accessibilityLabel={t(lang, "auth.lastName")}
                />
              </View>
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t(lang, "auth.email")}</Text>
              <View style={[styles.inputWrapper, emailError ? styles.inputError : null]}>
                <Icon name="mail-outline" size={18} color={loyal.textMuted} />
                <TextInput
                  ref={emailRef}
                  style={styles.input}
                  value={email}
                  onChangeText={(v) => { setEmail(v); setEmailError(null); }}
                  placeholder={t(lang, "auth.email")}
                  placeholderTextColor={loyal.textDim}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!loading}
                  accessibilityLabel={t(lang, "auth.email")}
                />
              </View>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t(lang, "auth.password")}</Text>
              <View style={[styles.inputWrapper, passwordError ? styles.inputError : null]}>
                <Icon name="lock-closed-outline" size={18} color={loyal.textMuted} />
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setPasswordError(null); }}
                  placeholder={t(lang, "auth.password")}
                  placeholderTextColor={loyal.textDim}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  editable={!loading}
                  accessibilityLabel={t(lang, "auth.password")}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  style={styles.eyeToggle}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={loyal.textMuted}
                  />
                </Pressable>
              </View>
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            </View>

            {/* Confirm password */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t(lang, "auth.confirmPassword")}</Text>
              <View style={[styles.inputWrapper, confirmError ? styles.inputError : null]}>
                <Icon name="lock-closed-outline" size={18} color={loyal.textMuted} />
                <TextInput
                  ref={confirmRef}
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={(v) => { setConfirmPassword(v); setConfirmError(null); }}
                  placeholder={t(lang, "auth.confirmPassword")}
                  placeholderTextColor={loyal.textDim}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                  editable={!loading}
                  accessibilityLabel={t(lang, "auth.confirmPassword")}
                />
                <Pressable
                  onPress={() => setShowConfirm((v) => !v)}
                  hitSlop={8}
                  style={styles.eyeToggle}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirm ? "Hide password" : "Show password"}
                >
                  <Icon
                    name={showConfirm ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={loyal.textMuted}
                  />
                </Pressable>
              </View>
              {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}
            </View>

            {/* Register button */}
            <Pressable
              style={[styles.submitButton, loading ? styles.submitButtonDisabled : null]}
              onPress={handleRegister}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "auth.register")}
            >
              {loading ? (
                <ActivityIndicator size="small" color={loyal.bg} />
              ) : (
                <Text style={styles.submitButtonText}>{t(lang, "auth.register")}</Text>
              )}
            </Pressable>

            {/* Login link */}
            <View style={styles.bottomLink}>
              <Text style={styles.bottomLinkLabel}>{t(lang, "auth.hasAccount")}</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/(auth)/login");
                }}
                accessibilityRole="link"
                disabled={loading}
              >
                <Text style={styles.bottomLinkAction}>{t(lang, "auth.login")}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// -- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: loyal.bg,
  },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing["2xl"],
  },

  backButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },

  card: {
    backgroundColor: loyal.card,
    borderRadius: radius["2xl"],
    borderWidth: 1,
    borderColor: loyal.cardBorder,
    padding: spacing["2xl"],
    gap: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: loyal.shadowDark,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
    letterSpacing: letterSpacing.snug,
  },

  inputGroup: {
    gap: spacing.xxs,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: loyal.textSecondary,
    marginBottom: spacing.xxs,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: loyal.inputBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.inputBorder,
    paddingHorizontal: spacing.lg,
    minHeight: TOUCH_TARGET + 6,
    gap: spacing.sm,
  },
  inputError: {
    borderColor: loyal.danger,
  },
  input: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.text,
    paddingVertical: spacing.md,
  },
  eyeToggle: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.danger,
    marginTop: spacing.xxs,
  },

  submitButton: {
    backgroundColor: loyal.primary,
    borderRadius: radius["2xl"],
    paddingVertical: spacing.lg,
    minHeight: 56,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: loyal.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.bg,
    letterSpacing: letterSpacing.tight,
  },

  bottomLink: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: TOUCH_TARGET,
  },
  bottomLinkLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.textMuted,
  },
  bottomLinkAction: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: loyal.primary,
  },

  // Success state
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing["3xl"],
    gap: spacing.lg,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: loyal.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  successTitle: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
    textAlign: "center",
    letterSpacing: letterSpacing.snug,
  },
  successDesc: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  successButton: {
    backgroundColor: loyal.primary,
    borderRadius: radius["2xl"],
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing["4xl"],
    minHeight: 56,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: loyal.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  successButtonText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.bg,
    letterSpacing: letterSpacing.tight,
  },
});

// -- Default export wrapped in ErrorBoundary -----------------------------------

export default function RegisterScreen() {
  return (
    <ErrorBoundary>
      <RegisterScreenInner />
    </ErrorBoundary>
  );
}
