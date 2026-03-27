// =============================================================================
// PIN Entry -- Group Portal (matches web portal design)
// =============================================================================

import { useState, useRef, useEffect } from "react";
import {
  View, Text, Pressable, StyleSheet, TextInput, Alert,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { group, fontSize, radius, spacing, letterSpacing, shadow } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { setGroupTrackingId as persistGroupId, setGroupToken, setAppMode, setRsvpToken } from "@/lib/auth";
import { verifyPin } from "@/lib/group-api";

const PIN_LENGTH = 6;

export default function PinScreen() {
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
  const pinInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (params.trackingId) setTrackingId(params.trackingId);
  }, [params.trackingId]);

  const hotelName = params.hotelName ?? "";
  const hasTrackingId = !!trackingId.trim();

  const handlePinChange = (text: string) => {
    // Only allow digits, max PIN_LENGTH
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
        setGroupTrackingId(trackingId.trim());
        const persistOps = [
          setGroupToken(res.data.token),
          persistGroupId(trackingId.trim()),
          setAppMode("group"),
        ];
        if (res.data.rsvpToken) {
          persistOps.push(setRsvpToken(res.data.rsvpToken));
        }
        await Promise.all(persistOps);
        useAppStore.getState().setAuthenticated(true);
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

          {/* Card */}
          <View style={styles.card}>
            {hotelName ? (
              <Text style={styles.hotelName}>{hotelName}</Text>
            ) : null}

            <View style={styles.lockCircle}>
              <Icon name="lock-closed-outline" size={28} color={group.primary} />
            </View>

            <Text style={styles.title}>{t(lang, "pin.protectedByPin")}</Text>
            <Text style={styles.subtitle}>{t(lang, "pin.enterCodeFromHotel")}</Text>

            {/* Email input */}
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
              />
              <Text style={styles.inputHint}>{t(lang, "pin.emailHint")}</Text>
            </View>

            {/* TrackingId input (hidden when from deep link) */}
            {!hasTrackingId && (
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>{t(lang, "pin.eventId")}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t(lang, "pin.trackingIdPlaceholder")}
                  placeholderTextColor={group.textMuted}
                  value={trackingId}
                  onChangeText={setTrackingId}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={200}
                />
              </View>
            )}

            {/* PIN dots -- tap to focus hidden input */}
            <View style={styles.dotsContainer}>
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

              {/* Hidden TextInput that captures keyboard input */}
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
          </View>

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={group.primary} />
            </View>
          )}

          <Text style={styles.footer}>Powered by Pure Alpha</Text>
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
  hotelName: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
    textAlign: "center",
  },
  lockCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: group.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
    textAlign: "center",
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },

  inputSection: { width: "100%", gap: spacing.xs, marginTop: spacing.sm },
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

  dotsContainer: { alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
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

  loadingOverlay: { marginTop: spacing.lg },
  footer: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    marginTop: spacing["2xl"],
  },
});
