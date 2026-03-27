// =============================================================================
// PIN Entry — Group Portal
// =============================================================================

import { useState, useCallback, useRef } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { group, fontSize, radius, spacing } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { setGroupTrackingId as persistGroupId, setGroupToken, setAppMode } from "@/lib/auth";
import { verifyPin } from "@/lib/group-api";

const PIN_LENGTH = 4;
// "DEL" is a sentinel for the backspace key -- rendered as an Icon, not text
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "DEL"] as const;

export default function PinScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const setGroupTrackingId = useAppStore((s) => s.setGroupTrackingId);
  const [pin, setPin] = useState("");
  const pinRef = useRef("");
  const [email, setEmail] = useState("");
  const [trackingId, setTrackingId] = useState("");
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
      } catch {
        Alert.alert(t(lang, "auth.error"), t(lang, "common.error"));
        pinRef.current = "";
        setPin("");
      } finally {
        setLoading(false);
      }
    }
  }, [trackingId, email, lang, setGroupTrackingId]);

  return (
    <LinearGradient colors={[group.bg, "#F5F3EF", group.bg]} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel={t(lang, "common.back")}>
            <View style={styles.backRow}>
              <Icon name="chevron-back" size={20} color={group.primary} />
              <Text style={styles.backText}>{t(lang, "common.back")}</Text>
            </View>
          </Pressable>
          <Text style={styles.title}>{t(lang, "mode.group")}</Text>
          <Text style={styles.subtitle}>{t(lang, "auth.enterPin")}</Text>
        </View>

        {/* Group needs trackingId + email */}
        <View style={styles.inputGroup}>
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
          <TextInput
            style={styles.input}
            placeholder={t(lang, "pin.emailOptionalPlaceholder")}
            placeholderTextColor={group.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            maxLength={320}
          />
        </View>

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
                <Icon name="backspace-outline" size={24} color={group.text} />
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
  backText: { fontSize: fontSize.base, color: group.primary, fontFamily: "Inter_500Medium" },
  title: {
    fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: group.text,
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: group.textSecondary, lineHeight: 21 },
  inputGroup: { gap: spacing.sm, width: "100%", marginBottom: spacing.xl },
  input: {
    backgroundColor: group.inputBg, borderWidth: 1, borderColor: group.cardBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12,
    fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: group.text,
  },
  dots: { flexDirection: "row", gap: spacing.lg, marginBottom: spacing["3xl"] },
  dot: {
    width: 16, height: 16, borderRadius: radius.full,
    borderWidth: 2, borderColor: group.cardBorder,
  },
  dotFilled: { backgroundColor: group.primary, borderColor: group.primary },
  keypad: { flexDirection: "row", flexWrap: "wrap", width: 280, justifyContent: "center" },
  key: {
    width: 80, height: 80, borderRadius: radius.full,
    alignItems: "center", justifyContent: "center", margin: 6,
  },
  keyEmpty: { opacity: 0 },
  keyPressed: { backgroundColor: group.surface },
  keyText: { fontSize: fontSize["2xl"], fontFamily: "Inter_500Medium", color: group.text },
});
