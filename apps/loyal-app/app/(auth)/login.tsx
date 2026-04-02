// =============================================================================
// Loyal App -- Login Screen (email + password)
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
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { loyal, fontSize, radius, spacing, letterSpacing, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { guestLogin, fetchGuestHotels, fetchPortalData } from "@/lib/loyal-api";
import { saveGuestJwt, saveSelectedToken } from "@/lib/auth";
import { setHotelName, setMemberName } from "@/lib/auth";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useSlideUp } from "@/lib/animations";

// -- Email validation regex ---------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const store = useAppStore.getState;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);
  const cardAnim = useSlideUp(100, 30);

  // -- Validation ---------------------------------------------------------------

  function validate(): boolean {
    let valid = true;
    setEmailError(null);
    setPasswordError(null);

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
    }

    return valid;
  }

  // -- Login handler ------------------------------------------------------------

  async function handleLogin() {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await guestLogin(email.trim(), password);

      if (res.status !== "success" || !res.data) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t(lang, "auth.loginError"), res.errorMessage ?? t(lang, "common.error"));
        setLoading(false);
        return;
      }

      const { jwt, firstName, hotelId } = res.data;

      // Persist JWT
      await saveGuestJwt(jwt);
      const s = store();
      s.setGuestJwt(jwt);

      // Fetch full hotel data (portalTokens, points, tiers)
      const hotelsRes = await fetchGuestHotels(jwt);

      if (hotelsRes.status !== "success" || !hotelsRes.data) {
        // JWT works but hotels failed -- go to hotel-select with empty state
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t(lang, "auth.loginError"), hotelsRes.errorMessage ?? t(lang, "common.error"));
        setLoading(false);
        return;
      }

      const { hotels } = hotelsRes.data;

      if (hotels.length === 0) {
        // No linked hotels -- show message
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(t(lang, "auth.noHotels"), t(lang, "auth.noHotelsDesc"));
        setLoading(false);
        return;
      }

      if (hotels.length === 1 && hotels[0].portalToken) {
        // Single hotel with portal token -- go straight to stay
        const hotel = hotels[0];
        const pt = hotel.portalToken!;
        await saveSelectedToken(pt);
        s.setToken(pt);

        // Fetch portal data to populate store
        const portalRes = await fetchPortalData(pt);
        if (portalRes.status === "success" && portalRes.data) {
          const { member, hotel: h, program } = portalRes.data;
          s.setMemberName(member.firstName);
          s.setHotelName(h.name);
          s.setProgramName(program.programName);
          if (program.portalLanguage === "en" || program.portalLanguage === "pl") {
            s.setLang(program.portalLanguage);
          }
        } else {
          // Fallback: use data from hotels API
          s.setHotelName(hotel.hotelName);
          if (hotel.guestName) s.setMemberName(hotel.guestName);
          s.setProgramName(hotel.programName);
        }

        // Persist hotel/member name for cold start restore
        await setHotelName(hotel.hotelName);
        if (hotel.guestName) await setMemberName(hotel.guestName);

        s.setAuthenticated(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(loyal)/stay");
        return;
      }

      // Multiple hotels (or single without portalToken) -- go to hotel-select
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: "/(auth)/hotel-select",
        params: { hotels: JSON.stringify(hotels), firstName: firstName ?? "" },
      });
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t(lang, "auth.loginError"), t(lang, "common.error"));
    } finally {
      setLoading(false);
    }
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
              <Icon name="log-in-outline" size={28} color={loyal.primary} />
              <Text style={styles.cardTitle}>{t(lang, "auth.login")}</Text>
            </View>

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
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
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

            {/* Forgot password link */}
            <Pressable
              style={styles.forgotLink}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(auth)/forgot-password");
              }}
              accessibilityRole="link"
              disabled={loading}
            >
              <Text style={styles.forgotLinkText}>{t(lang, "auth.forgotPasswordLink")}</Text>
            </Pressable>

            {/* Login button */}
            <Pressable
              style={[styles.submitButton, loading ? styles.submitButtonDisabled : null]}
              onPress={handleLogin}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "auth.login")}
            >
              {loading ? (
                <ActivityIndicator size="small" color={loyal.bg} />
              ) : (
                <Text style={styles.submitButtonText}>{t(lang, "auth.login")}</Text>
              )}
            </Pressable>

            {/* Register link */}
            <View style={styles.bottomLink}>
              <Text style={styles.bottomLinkLabel}>{t(lang, "auth.noAccount")}</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/(auth)/register");
                }}
                accessibilityRole="link"
                disabled={loading}
              >
                <Text style={styles.bottomLinkAction}>{t(lang, "auth.register")}</Text>
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
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
    letterSpacing: letterSpacing.snug,
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

  forgotLink: {
    alignSelf: "flex-end",
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  forgotLinkText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: loyal.primary,
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
});

// -- Default export wrapped in ErrorBoundary -----------------------------------

export default function LoginScreen() {
  return (
    <ErrorBoundary>
      <LoginScreenInner />
    </ErrorBoundary>
  );
}
