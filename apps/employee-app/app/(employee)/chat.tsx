// =============================================================================
// Employee App -- Chat (warm cream + placeholder -- Phase 2)
// TODO: Hide this tab via feature flag when chat is not ready for production.
//       Keep the screen for structural completeness; toggle visibility in
//       _layout.tsx via `href: null` when a remote config flag is false.
// =============================================================================

import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { emp, fontSize, letterSpacing, radius, spacing, shadow } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

function ChatScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.title}>{t(lang, "chat.title")}</Text>

        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Icon name="chatbubble-ellipses-outline" size={36} color={emp.primary} />
          </View>
          <Text style={styles.cardTitle}>{t(lang, "chat.title")}</Text>
          <Text style={styles.cardDesc}>{t(lang, "chat.desc")}</Text>
          <View
            style={styles.comingSoonBadge}
            accessible={true}
            accessibilityRole="text"
          >
            <Text style={styles.comingSoonText}>{t(lang, "chat.comingSoon")}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: emp.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: emp.text,
    letterSpacing: letterSpacing.tight,
  },
  card: {
    backgroundColor: emp.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing["3xl"],
    alignItems: "center",
    gap: spacing.md,
    ...shadow.sm,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: emp.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: emp.text,
  },
  cardDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  comingSoonBadge: {
    backgroundColor: emp.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  comingSoonText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: emp.primary,
  },
});

export default function ChatScreen() {
  return (
    <ErrorBoundary>
      <ChatScreenInner />
    </ErrorBoundary>
  );
}
