// =============================================================================
// Group Portal — Services Catalog Screen (hidden tab, accessed via quick action)
// Displays extra hotel services from initData.services
// =============================================================================

import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  group,
  fontSize,
  radius,
  spacing,
  shadow,
  quickActionColors,
  letterSpacing,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchPortalInit } from "@/lib/group-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

// =============================================================================
// Helpers
// =============================================================================

function formatPrice(price: number | null, unit: string | null, currency: string | null): string {
  if (price == null) return "";
  const curr = currency ?? "PLN";
  const priceStr = price % 1 === 0 ? String(price) : price.toFixed(2);
  if (!unit) return `${priceStr} ${curr}`;
  return `${priceStr} ${curr} / ${unit}`;
}

// =============================================================================
// Service Card
// =============================================================================

function ServiceCard({
  name,
  description,
  price,
  unit,
  currency,
}: {
  name: string;
  description: string | null;
  price: number | null;
  unit: string | null;
  currency: string | null;
}) {
  const priceLabel = formatPrice(price, unit, currency);

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={name}
    >
      <View style={styles.iconCircle}>
        <Icon name="pricetag-outline" size={22} color={quickActionColors.services.icon} />
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={2}>
          {name}
        </Text>

        {description ? (
          <Text style={styles.cardDescription} numberOfLines={3}>
            {description}
          </Text>
        ) : null}

        {priceLabel ? (
          <View style={styles.priceBadge}>
            <Text style={styles.priceBadgeText}>{priceLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// =============================================================================
// Main Screen
// =============================================================================

function ServicesScreenInner() {
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

  const services = initData?.services ?? [];

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
        <Text style={styles.title}>{t(lang, "overview.services")}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {services.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="bag-outline" size={48} color={group.textMuted} />
            <Text style={styles.emptyText}>{t(lang, "overview.noItems")}</Text>
          </View>
        ) : (
          services.map((service) => (
            <ServiceCard
              key={service.id}
              name={service.name}
              description={service.description}
              price={service.price}
              unit={service.unit}
              currency={service.currency}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// =============================================================================
// Default Export (ErrorBoundary wrapper)
// =============================================================================

export default function ServicesScreen() {
  return (
    <ErrorBoundary>
      <ServicesScreenInner />
    </ErrorBoundary>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    marginBottom: spacing.lg,
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
    flex: 1,
  },

  // Scroll
  scroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },

  // Card
  card: {
    flexDirection: "row",
    backgroundColor: group.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: quickActionColors.services.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  cardName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    lineHeight: 21,
  },
  cardDescription: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    lineHeight: 18,
  },
  priceBadge: {
    alignSelf: "flex-start",
    backgroundColor: quickActionColors.services.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    marginTop: spacing.xs,
  },
  priceBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: quickActionColors.services.icon,
  },

  // Empty state
  emptyContainer: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing["4xl"],
  },
  emptyText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
