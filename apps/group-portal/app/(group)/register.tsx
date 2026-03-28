// =============================================================================
// Group Portal — Self-Registration Screen
// New guest registers themselves for a group event.
// =============================================================================

import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { group, fontSize, radius, spacing, shadow, letterSpacing } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { selfRegister, fetchPortalInit } from "@/lib/group-api";
import { useQuery } from "@tanstack/react-query";
import { useScalePress, useSlideUp } from "@/lib/animations";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { setRsvpToken } from "@/lib/auth";
import type { SelfRegisterPayload } from "@/lib/types";

// =============================================================================
// Form Field Component
// =============================================================================

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  multiline,
  keyboardType,
  autoCapitalize,
  autoComplete,
  textContentType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words";
  autoComplete?: "name" | "email" | "tel" | "off";
  textContentType?: "name" | "familyName" | "givenName" | "emailAddress" | "telephoneNumber" | "none";
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? " *" : ""}
      </Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={group.textMuted}
        multiline={multiline}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "sentences"}
        autoComplete={autoComplete ?? "off"}
        textContentType={textContentType ?? "none"}
        accessibilityLabel={label}
      />
    </View>
  );
}

// =============================================================================
// Main Screen Content
// =============================================================================

function RegisterScreenContent() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const setGuest = useAppStore((s) => s.setGuest);
  const setRsvpTokenState = useAppStore((s) => s.setRsvpTokenState);

  // Read portal flags (shared cache)
  const { data: portalData } = useQuery({
    queryKey: ["portal-init", trackingId],
    queryFn: async () => {
      if (!trackingId) return null;
      const res = await fetchPortalInit(trackingId);
      return res.status === "success" ? res.data : null;
    },
    enabled: !!trackingId,
    staleTime: 60_000,
  });
  const dietaryEnabled = portalData?.portal?.dietaryEnabled !== false;

  // ── Form state ----
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dietaryNeeds, setDietaryNeeds] = useState("");
  const [allergies, setAllergies] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");

  // ── Submission state ----
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Prevent double-submit ----
  const submitRef = useRef(false);

  // ── Animations ----
  const headerSlide = useSlideUp(0, 12);
  const formSlide = useSlideUp(80, 16);
  const successSlide = useSlideUp(0, 20);
  const { scaleStyle, onPressIn, onPressOut } = useScalePress(0.97);

  // ── Validation ----
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    !submitting;

  // ── Submit handler ----
  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setErrorMsg(null);

    const payload: SelfRegisterPayload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    };
    if (email.trim()) payload.email = email.trim();
    if (phone.trim()) payload.phone = phone.trim();
    if (dietaryNeeds.trim()) payload.dietaryNeeds = dietaryNeeds.trim();
    if (allergies.trim()) payload.allergies = allergies.trim();
    if (specialRequests.trim()) payload.specialRequests = specialRequests.trim();

    try {
      const res = await selfRegister(trackingId, payload);

      if (res.status === "success" && res.data) {
        // Store guest identity + RSVP token
        setGuest({
          id: res.data.guest.id,
          firstName: res.data.guest.firstName,
          lastName: res.data.guest.lastName,
          rsvpStatus: "confirmed",
        });
        setRsvpTokenState(res.data.rsvpToken);
        await setRsvpToken(res.data.rsvpToken);

        setSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        // Map error codes to i18n keys
        const msg = res.errorMessage ?? "";
        if (msg.includes("LIMIT")) {
          setErrorMsg(t(lang, "register.full"));
        } else if (msg.includes("EMAIL_DUPLICATE")) {
          setErrorMsg(t(lang, "register.emailDuplicate"));
        } else if (msg.includes("DUPLICATE")) {
          setErrorMsg(t(lang, "register.duplicate"));
        } else {
          setErrorMsg(res.errorMessage ?? t(lang, "common.error"));
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {
      setErrorMsg(t(lang, "common.error"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  }, [
    canSubmit,
    trackingId,
    firstName,
    lastName,
    email,
    phone,
    dietaryNeeds,
    allergies,
    specialRequests,
    lang,
    setGuest,
    setRsvpTokenState,
  ]);

  // ── Success state ----
  if (success) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <Animated.View style={[styles.successContainer, successSlide]}>
          <View style={styles.successIconCircle}>
            <Icon name="checkmark-circle" size={56} color={group.primary} />
          </View>
          <Text style={styles.successTitle}>{t(lang, "register.success")}</Text>
          <Text style={styles.successDesc}>{t(lang, "register.successDesc")}</Text>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "common.back")}
          >
            <Text style={styles.backBtnText}>{t(lang, "common.back")}</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  // ── Form ----
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Animated.View style={[styles.header, headerSlide]}>
            <Pressable
              style={styles.headerBackBtn}
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.back")}
            >
              <Icon name="chevron-back" size={24} color={group.text} />
            </Pressable>
            <Text style={styles.title}>{t(lang, "register.title")}</Text>
          </Animated.View>

          {/* Form card */}
          <Animated.View style={[styles.formCard, formSlide]}>
            <FormField
              label={t(lang, "register.firstName")}
              value={firstName}
              onChangeText={setFirstName}
              required
              autoCapitalize="words"
              autoComplete="name"
              textContentType="givenName"
            />

            <FormField
              label={t(lang, "register.lastName")}
              value={lastName}
              onChangeText={setLastName}
              required
              autoCapitalize="words"
              autoComplete="name"
              textContentType="familyName"
            />

            <FormField
              label={t(lang, "register.email")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />

            <FormField
              label={t(lang, "register.phone")}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
            />

            {dietaryEnabled && (
              <>
                <FormField
                  label={t(lang, "register.dietary")}
                  value={dietaryNeeds}
                  onChangeText={setDietaryNeeds}
                />

                <FormField
                  label={t(lang, "register.allergies")}
                  value={allergies}
                  onChangeText={setAllergies}
                />
              </>
            )}

            <FormField
              label={t(lang, "register.specialRequests")}
              value={specialRequests}
              onChangeText={setSpecialRequests}
              multiline
            />

            {/* Error message */}
            {errorMsg ? (
              <View style={styles.errorContainer}>
                <Icon name="alert-circle-outline" size={18} color={group.white} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Submit button */}
            <Animated.View style={scaleStyle}>
              <Pressable
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "register.submit")}
                accessibilityState={{ disabled: !canSubmit }}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={group.white} />
                ) : (
                  <Text style={styles.submitBtnText}>{t(lang, "register.submit")}</Text>
                )}
              </Pressable>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// =============================================================================
// Default Export (wrapped in ErrorBoundary)
// =============================================================================

export default function RegisterScreen() {
  return (
    <ErrorBoundary>
      <RegisterScreenContent />
    </ErrorBoundary>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: group.bg,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
  },

  // ── Header ----
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  headerBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: group.card,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
    flex: 1,
  },

  // ── Form card ----
  formCard: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    ...shadow.sm,
  },

  // ── Field ----
  fieldContainer: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.text,
    letterSpacing: letterSpacing.tight,
  },
  fieldInput: {
    backgroundColor: group.bg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    minHeight: 44,
  },
  fieldInputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: spacing.md,
  },

  // ── Error ----
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#ef4444",
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  errorText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.white,
    flex: 1,
  },

  // ── Submit button ----
  submitBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    ...shadow.sm,
  },
  submitBtnDisabled: {
    backgroundColor: group.disabledBg,
  },
  submitBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
    letterSpacing: letterSpacing.tight,
  },

  // ── Success state ----
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing["3xl"],
    gap: spacing.md,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: group.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  successTitle: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: group.text,
    textAlign: "center",
    letterSpacing: letterSpacing.tight,
  },
  successDesc: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  backBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing["2xl"],
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.lg,
  },
  backBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
});
