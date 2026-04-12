// =============================================================================
// Loyal App -- Forgot Password Screen (email field, reset link)
// Navy + Gold glass card, keyboard avoiding, haptics
// =============================================================================

import { useState } from "react";
import {
  Animated,
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
import { guestForgotPassword } from "@/lib/loyal-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useSlideUp } from "@/lib/animations";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ForgotPasswordScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const cardAnim = useSlideUp(100, 30);

  // -- Validation ---------------------------------------------------------------

  function validate(): boolean {
    setEmailError(null);
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setEmailError(t(lang, "auth.fieldRequired"));
      return false;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError(t(lang, "auth.invalidEmail"));
      return false;
    }
    return true;
  }

  // -- Reset handler ------------------------------------------------------------

  async function handleReset() {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await guestForgotPassword(email.trim());

      if (res.status !== "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t(lang, "auth.resetError"), res.errorMessage ?? t(lang, "common.error"));
        setLoading(false);
        return;
      }

      // Backend always returns success (anti-enumeration)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t(lang, "auth.resetError"), t(lang, "common.error"));
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
          <Text style={styles.successTitle}>{t(lang, "auth.resetSent")}</Text>
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
          <Animated.View style={[styles.card, { opacity: cardAnim.opacity, transform: cardAnim.transform }]}>
            {/* Header */}
            <View style={styles.cardHeader}>
              <Icon name="key-outline" size={28} color={loyal.primary} />
              <Text style={styles.cardTitle}>{t(lang, "auth.forgotPassword")}</Text>
            </View>

            <Text style={styles.cardDesc}>
              {t(lang, "auth.forgotPasswordDesc")}
            </Text>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t(lang, "auth.email")}</Text>
              <View style={[styles.inputWrapper, emailError ? styles.inputError : null]}>
                <Icon name="mail-outline" size={18} color={loyal.textMuted} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={(v) => { setEmail(v); setEmailError(null); }}
                  placeholder={t(lang, "auth.email")}
                  placeholderTextColor={loyal.textDim}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleReset}
                  editable={!loading}
                  accessibilityLabel={t(lang, "auth.email")}
                />
              </View>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            </View>

            {/* Send button */}
            <Pressable
              style={[styles.submitButton, loading ? styles.submitButtonDisabled : null]}
              onPress={handleReset}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "auth.sendResetLink")}
            >
              {loading ? (
                <ActivityIndicator size="small" color={loyal.bg} />
              ) : (
                <Text style={styles.submitButtonText}>{t(lang, "auth.sendResetLink")}</Text>
              )}
            </Pressable>

            {/* Back to login link */}
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
          </Animated.View>
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
    gap: spacing.lg,
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
    marginBottom: spacing.xxs,
  },
  cardTitle: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
    letterSpacing: letterSpacing.snug,
    flex: 1,
  },
  cardDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.textSecondary,
    lineHeight: 20,
  },

  inputGroup: {
    gap: spacing.xs,
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

export default function ForgotPasswordScreen() {
  return (
    <ErrorBoundary>
      <ForgotPasswordScreenInner />
    </ErrorBoundary>
  );
}
