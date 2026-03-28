// =============================================================================
// Group Portal — FAQ Accordion Screen (full list, expand/collapse)
// Opened from quick action on overview dashboard. Hidden tab (href: null).
// Data from shared react-query cache ["portal-init", trackingId].
// =============================================================================

import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  UIManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  group,
  fontSize,
  radius,
  spacing,
  shadow,
  letterSpacing,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchPortalInit } from "@/lib/group-api";
import { configureListAnimation } from "@/lib/animations";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// =============================================================================
// Sub-components
// =============================================================================

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = useCallback(() => {
    configureListAnimation();
    setExpanded((prev) => {
      Animated.timing(rotateAnim, {
        toValue: prev ? 0 : 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      return !prev;
    });
  }, [rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={styles.faqItem}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={question}
        accessibilityState={{ expanded }}
        style={styles.faqHeader}
      >
        <Text style={styles.faqQuestion}>{question}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon name="chevron-down" size={18} color={group.textMuted} />
        </Animated.View>
      </Pressable>
      {expanded && (
        <Text style={styles.faqAnswer}>{answer}</Text>
      )}
    </View>
  );
}

// =============================================================================
// Main Screen
// =============================================================================

function FaqScreenContent() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";

  const { data: initData } = useQuery({
    queryKey: ["portal-init", trackingId],
    queryFn: async () => {
      if (!trackingId) return null;
      const res = await fetchPortalInit(trackingId);
      return res.status === "success" ? res.data : null;
    },
    enabled: !!trackingId,
    staleTime: 60_000,
  });

  const faq = initData?.faq ?? [];

  const hasItems = faq.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBack}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "common.back")}
        >
          <Icon name="chevron-back" size={20} color={group.primary} />
        </Pressable>
        <Text style={styles.title}>
          {t(lang, "overview.faq.title")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {!hasItems ? (
          /* Empty state */
          <View style={styles.emptyState}>
            <Icon
              name="help-circle-outline"
              size={48}
              color={group.textMuted}
            />
            <Text style={styles.emptyText}>
              {t(lang, "group.faq.noItems")}
            </Text>
          </View>
        ) : (
          /* FAQ accordion list */
          <View style={styles.faqList}>
            {faq.map((item) => (
              <FaqItem
                key={item.id}
                question={item.question}
                answer={item.answer}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export default function FaqScreen() {
  const lang = useAppStore((s) => s.lang);
  return (
    <ErrorBoundary lang={lang}>
      <FaqScreenContent />
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
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
  },

  // ── FAQ List (card container) ──
  faqList: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    overflow: "hidden",
    ...shadow.sm,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: group.cardBorder,
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  faqQuestion: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    flex: 1,
    paddingRight: spacing.md,
    lineHeight: 21,
  },
  faqAnswer: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },

  // ── Empty State ──
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: spacing["6xl"],
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
    textAlign: "center",
  },
});
