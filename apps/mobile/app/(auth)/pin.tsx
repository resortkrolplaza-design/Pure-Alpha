// =============================================================================
// PIN Entry — Group Portal + Employee App
// =============================================================================

import { useState, useCallback, useRef } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { NAVY, NAVY_LIGHT, GOLD, guest, fontSize, radius, spacing } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { setGroupTrackingId as persistGroupId, setGroupToken, setAppMode, setEmployeeToken as persistEmpToken } from "@/lib/auth";
import { verifyPin } from "@/lib/group-api";
import { resolveHotel, loginWithPin } from "@/lib/employee-api";

const PIN_LENGTH = 4;
// "DEL" is a sentinel for the backspace key — rendered as an Icon, not text
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "DEL"] as const;

export default function PinScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const mode = useAppStore((s) => s.mode);
  const setGroupTrackingId = useAppStore((s) => s.setGroupTrackingId);
  const [pin, setPin] = useState("");
  const pinRef = useRef("");
  const [email, setEmail] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [hotelSlug, setHotelSlug] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDigit = useCallback(async (digit: string) => {
    if (digit === "DEL") {
      const shortened = pinRef.current.slice(0, -1);
      pinRef.current = shortened;
      setPin(shortened);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    if (digit === "" || pinRef.current.length >= PIN_LENGTH) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newPin = pinRef.current + digit;
    pinRef.current = newPin;
    setPin(newPin);

    if (newPin.length === PIN_LENGTH) {
      setLoading(true);
      try {
        if (mode === "group") {
          if (!trackingId.trim()) {
            Alert.alert(t(lang, "auth.error"), t(lang, "pin.enterTrackingId"));
            pinRef.current = "";
            setPin("");
            return;
          }
          const res = await verifyPin(trackingId.trim(), newPin, email.trim().toLowerCase());
          if (res.status === "success" && res.data?.token) {
            setGroupTrackingId(trackingId.trim());
            await Promise.all([
              setGroupToken(res.data.token),
              persistGroupId(trackingId.trim()),
              setAppMode("group"),
            ]);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace("/(group)/overview");
          } else {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert(t(lang, "auth.error"), res.errorMessage || t(lang, "pin.invalidPin"));
            pinRef.current = "";
            setPin("");
          }
        } else {
          // Employee — PIN login
          const login = trackingId.trim();
          const slug = hotelSlug.trim();
          if (!login) {
            Alert.alert(t(lang, "auth.error"), t(lang, "pin.enterLogin"));
            pinRef.current = "";
            setPin("");
            setLoading(false);
            return;
          }
          if (!slug) {
            Alert.alert(t(lang, "auth.error"), t(lang, "pin.enterHotelSlug"));
            pinRef.current = "";
            setPin("");
            setLoading(false);
            return;
          }
          // Step 1: resolve hotelSlug -> hotelId
          const resolveRes = await resolveHotel(slug);
          if (resolveRes.status !== "success" || !resolveRes.data?.hotelId) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert(t(lang, "auth.error"), resolveRes.errorMessage || t(lang, "pin.hotelNotFound"));
            pinRef.current = "";
            setPin("");
            setLoading(false);
            return;
          }
          // Step 2: login with PIN
          const empRes = await loginWithPin(login, newPin, resolveRes.data.hotelId);
          if (empRes.status === "success" && empRes.data?.token) {
            await persistEmpToken(empRes.data.token);
            await setAppMode("employee");
            // Save employee name to store for greeting
            const setEmpName = useAppStore.getState().setEmployeeName;
            if (empRes.data?.employee?.name) {
              setEmpName(empRes.data.employee.name);
            }
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace("/(employee)/dashboard");
          } else {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert(t(lang, "auth.error"), empRes.errorMessage || t(lang, "pin.invalidPin"));
            pinRef.current = "";
            setPin("");
          }
        }
      } catch {
        Alert.alert(t(lang, "auth.error"), t(lang, "common.error"));
        pinRef.current = "";
        setPin("");
      } finally {
        setLoading(false);
      }
    }
  }, [mode, trackingId, email, hotelSlug, lang, setGroupTrackingId]);

  const modeTitle = mode === "group" ? t(lang, "mode.group") : t(lang, "mode.employee");

  return (
    <LinearGradient colors={[NAVY, NAVY_LIGHT, NAVY]} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel={t(lang, "common.back")}>
            <View style={styles.backRow}>
              <Icon name="chevron-back" size={20} color={GOLD} />
              <Text style={styles.backText}>{t(lang, "common.back")}</Text>
            </View>
          </Pressable>
          <Text style={styles.title}>{modeTitle}</Text>
          <Text style={styles.subtitle}>{t(lang, "auth.enterPin")}</Text>
        </View>

        {/* Group needs trackingId + email */}
        {mode === "group" && (
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              placeholder={t(lang, "pin.trackingIdPlaceholder")}
              placeholderTextColor={guest.textMuted}
              value={trackingId}
              onChangeText={setTrackingId}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder={t(lang, "pin.emailOptionalPlaceholder")}
              placeholderTextColor={guest.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
        )}

        {/* Employee needs login + hotelSlug */}
        {mode === "employee" && (
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              placeholder={t(lang, "pin.loginPlaceholder")}
              placeholderTextColor={guest.textMuted}
              value={trackingId}
              onChangeText={setTrackingId}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder={t(lang, "pin.hotelSlugPlaceholder")}
              placeholderTextColor={guest.textMuted}
              value={hotelSlug}
              onChangeText={setHotelSlug}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {/* PIN Dots */}
        <View style={styles.dots}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
          ))}
        </View>

        {/* Keypad */}
        <View style={styles.keypad}>
          {DIGITS.map((digit, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.key,
                digit === "" && styles.keyEmpty,
                pressed && digit !== "" && styles.keyPressed,
              ]}
              onPress={() => handleDigit(digit)}
              disabled={digit === "" || loading}
              accessibilityRole="button"
              accessibilityLabel={digit === "DEL" ? t(lang, "common.delete") : digit}
            >
              {digit === "DEL" ? (
                <Icon name="backspace-outline" size={24} color={guest.text} />
              ) : (
                <Text style={styles.keyText}>{digit}</Text>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing["2xl"], alignItems: "center" },
  header: { alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl },
  backBtn: { alignSelf: "flex-start", marginBottom: spacing.xl, minHeight: 44 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontSize: fontSize.base, color: GOLD, fontFamily: "Inter_500Medium" },
  title: {
    fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: guest.text,
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: guest.textSecondary, lineHeight: 21 },
  inputGroup: { gap: spacing.sm, width: "100%", marginBottom: spacing.xl },
  input: {
    backgroundColor: guest.inputBg, borderWidth: 1, borderColor: guest.inputBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12,
    fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: guest.text,
  },
  dots: { flexDirection: "row", gap: spacing.lg, marginBottom: spacing["3xl"] },
  dot: {
    width: 16, height: 16, borderRadius: radius.full,
    borderWidth: 2, borderColor: guest.glassBorder,
  },
  dotFilled: { backgroundColor: GOLD, borderColor: GOLD },
  keypad: { flexDirection: "row", flexWrap: "wrap", width: 280, justifyContent: "center" },
  key: {
    width: 80, height: 80, borderRadius: radius.full,
    alignItems: "center", justifyContent: "center", margin: 6,
  },
  keyEmpty: { opacity: 0 },
  keyPressed: { backgroundColor: guest.glass },
  keyText: { fontSize: fontSize["2xl"], fontFamily: "Inter_500Medium", color: guest.text },
});
