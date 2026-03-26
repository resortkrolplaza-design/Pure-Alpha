// =============================================================================
// PIN Entry — Group Portal + Employee App
// =============================================================================

import { useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { NAVY, NAVY_LIGHT, GOLD, guest, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

const PIN_LENGTH = 4;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

export default function PinScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const mode = useAppStore((s) => s.mode);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const shakeX = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const handleDigit = useCallback(async (digit: string) => {
    if (digit === "⌫") {
      setPin((p) => p.slice(0, -1));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    if (digit === "" || pin.length >= PIN_LENGTH) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newPin = pin + digit;
    setPin(newPin);

    if (newPin.length === PIN_LENGTH) {
      setLoading(true);
      // TODO: Verify PIN against API
      // For now, simulate a check
      setTimeout(() => {
        if (mode === "group") {
          router.replace("/(group)/overview");
        } else {
          router.replace("/(employee)/dashboard");
        }
        setLoading(false);
      }, 500);
    }
  }, [pin, mode]);

  const modeTitle = mode === "group" ? t(lang, "mode.group") : t(lang, "mode.employee");

  return (
    <LinearGradient colors={[NAVY, NAVY_LIGHT, NAVY]} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel={t(lang, "common.back")}>
            <Text style={styles.backText}>‹ {t(lang, "common.back")}</Text>
          </Pressable>
          <Text style={styles.title}>{modeTitle}</Text>
          <Text style={styles.subtitle}>{t(lang, "auth.enterPin")}</Text>
        </View>

        {/* PIN Dots */}
        <Animated.View style={[styles.dots, shakeStyle]}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
          ))}
        </Animated.View>

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
              accessibilityLabel={digit === "⌫" ? "Delete" : digit}
            >
              <Text style={[styles.keyText, digit === "⌫" && styles.keyDelete]}>{digit}</Text>
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
  header: { alignItems: "center", gap: spacing.sm, marginBottom: spacing["4xl"] },
  backBtn: { alignSelf: "flex-start", marginBottom: spacing.xl, minHeight: 44, width: "100%" },
  backText: { fontSize: fontSize.base, color: GOLD, fontFamily: "Inter_500Medium" },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: guest.text },
  subtitle: { fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: guest.textSecondary },
  dots: { flexDirection: "row", gap: spacing.lg, marginBottom: spacing["4xl"] },
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
  keyText: {
    fontSize: fontSize["2xl"], fontFamily: "Inter_500Medium", color: guest.text,
  },
  keyDelete: { fontSize: fontSize.xl },
});
