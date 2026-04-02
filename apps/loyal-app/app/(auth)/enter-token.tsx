// =============================================================================
// Loyal App -- Enter Token Screen (paste URL or token)
// Accepts: full URL, deep link, or raw UUID
// =============================================================================

import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { loyal, fontSize, letterSpacing, radius, spacing, shadow, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { saveToken } from "@/lib/auth";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_UUID_RE = /\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function extractUUID(input: string): string | null {
  const trimmed = input.trim();

  // Raw UUID
  if (UUID_RE.test(trimmed)) return trimmed;

  // URL containing /p/{uuid}
  const match = trimmed.match(URL_UUID_RE);
  if (match?.[1]) return match[1];

  return null;
}

function EnterTokenScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const setToken = useAppStore((s) => s.setToken);
  const setAuthenticated = useAppStore((s) => s.setAuthenticated);

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setError(null);
    const uuid = extractUUID(input);

    if (!uuid) {
      setError(t(lang, "enterToken.invalidFormat"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    await saveToken(uuid);
    setToken(uuid);
    setAuthenticated(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(loyal)/stay");
  }, [input, lang, setToken, setAuthenticated]);

  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const handleBack = () => {
    if (canGoBack) {
      router.back();
    } else {
      router.replace("/(auth)/welcome");
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[loyal.bg, loyal.bgDark, loyal.bg]}
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
              <Icon name="chevron-back" size={22} color={loyal.white} />
            </View>
          </Pressable>

          <Text style={styles.title}>{t(lang, "enterToken.title")}</Text>
          <Text style={styles.subtitle}>{t(lang, "enterToken.description")}</Text>

          {/* Glass Card */}
          <View style={styles.card}>
            <Text style={styles.label}>{t(lang, "enterToken.label")}</Text>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={(v) => {
                setInput(v);
                setError(null);
              }}
              placeholder={t(lang, "enterToken.placeholder")}
              placeholderTextColor={loyal.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              accessibilityLabel={t(lang, "enterToken.label")}
              multiline={false}
            />

            {error && (
              <View style={styles.errorRow} accessibilityLiveRegion="assertive">
                <Icon name="alert-circle" size={16} color={loyal.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              style={[styles.submitBtn, !input.trim() && styles.disabledBtn]}
              onPress={handleSubmit}
              disabled={!input.trim()}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.confirm")}
            >
              <Text style={styles.submitBtnText}>{t(lang, "common.confirm")}</Text>
            </Pressable>
          </View>

          {/* Helper text */}
          <Text style={styles.helperText}>{t(lang, "enterToken.askReception")}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: loyal.bg },
  flex1: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },

  backBtn: { alignSelf: "flex-start" },
  backBtnCircle: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: loyal.surface,
    borderWidth: 1,
    borderColor: loyal.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: loyal.white,
    letterSpacing: letterSpacing.tight,
  },
  subtitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.textMuted,
    lineHeight: 22,
  },

  card: {
    backgroundColor: loyal.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: loyal.cardBorder,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.md,
  },

  label: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: loyal.textSecondary,
    lineHeight: 18,
  },
  input: {
    backgroundColor: loyal.inputBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: loyal.inputBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.text,
    minHeight: TOUCH_TARGET,
  },

  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.danger,
    lineHeight: 18,
  },

  submitBtn: {
    backgroundColor: loyal.primary,
    borderRadius: radius["2xl"],
    paddingVertical: spacing.lg,
    alignItems: "center",
    minHeight: TOUCH_TARGET + 8,
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: loyal.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  submitBtnText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.bg,
  },
  disabledBtn: { opacity: 0.5 },

  helperText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.textDim,
    textAlign: "center",
    lineHeight: 20,
  },
});

export default function EnterTokenScreen() {
  return (
    <ErrorBoundary>
      <EnterTokenScreenInner />
    </ErrorBoundary>
  );
}
