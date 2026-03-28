// =============================================================================
// Group Portal — Attractions List Screen (hidden tab, accessed via quick action)
// Displays nearby attractions from initData.attractions
// =============================================================================

import { View, Text, ScrollView, StyleSheet, Pressable, Image, Linking } from "react-native";
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
import { isExternalUrlSafe, isImageUrlSafe } from "@/lib/url-safety";

// =============================================================================
// Attraction Card
// =============================================================================

function AttractionCard({
  name,
  description,
  imageUrl,
  distance,
  mapUrl,
  websiteUrl,
  lang,
}: {
  name: string;
  description: string | null;
  imageUrl: string | null;
  distance: string | null;
  mapUrl: string | null;
  websiteUrl: string | null;
  lang: "pl" | "en";
}) {
  const hasImage = isImageUrlSafe(imageUrl);
  const hasMap = isExternalUrlSafe(mapUrl);
  const hasWebsite = isExternalUrlSafe(websiteUrl);

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={name}
    >
      {/* Thumbnail */}
      {hasImage ? (
        <Image
          source={{ uri: imageUrl as string }}
          style={styles.thumbnail}
          accessibilityIgnoresInvertColors
          onError={() => {
            // Image failed to load -- silently ignored, card still shows
          }}
        />
      ) : null}

      <View style={styles.cardContent}>
        {/* Top row: icon + name + distance badge */}
        <View style={styles.cardTopRow}>
          <View style={styles.iconCircle}>
            <Icon name="location-outline" size={20} color={quickActionColors.attractions.icon} />
          </View>
          <View style={styles.cardTitleArea}>
            <Text style={styles.cardName} numberOfLines={2}>
              {name}
            </Text>
            {distance ? (
              <View style={styles.distanceBadge}>
                <Text style={styles.distanceBadgeText}>{distance}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Description */}
        {description ? (
          <Text style={styles.cardDescription} numberOfLines={4}>
            {description}
          </Text>
        ) : null}

        {/* Action buttons */}
        {(hasMap || hasWebsite) ? (
          <View style={styles.actionRow}>
            {hasMap ? (
              <Pressable
                style={styles.actionBtn}
                onPress={() => Linking.openURL(mapUrl as string)}
                accessibilityRole="link"
                accessibilityLabel={t(lang, "overview.openMaps")}
              >
                <Icon name="navigate-outline" size={16} color={group.primary} />
                <Text style={styles.actionBtnText}>
                  {t(lang, "overview.openMaps")}
                </Text>
              </Pressable>
            ) : null}
            {hasWebsite ? (
              <Pressable
                style={styles.actionBtn}
                onPress={() => Linking.openURL(websiteUrl as string)}
                accessibilityRole="link"
                accessibilityLabel="Website"
              >
                <Icon name="globe-outline" size={16} color={group.primary} />
                <Text style={styles.actionBtnText}>
                  Web
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// =============================================================================
// Main Screen
// =============================================================================

function AttractionsScreenInner() {
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

  const attractions = initData?.attractions ?? [];

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
        <Text style={styles.title}>{t(lang, "overview.attractions")}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {attractions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="compass-outline" size={48} color={group.textMuted} />
            <Text style={styles.emptyText}>{t(lang, "overview.noItems")}</Text>
          </View>
        ) : (
          attractions.map((attraction) => (
            <AttractionCard
              key={attraction.id}
              name={attraction.name}
              description={attraction.description}
              imageUrl={attraction.imageUrl}
              distance={attraction.distance}
              mapUrl={attraction.mapUrl}
              websiteUrl={attraction.websiteUrl}
              lang={lang}
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

export default function AttractionsScreen() {
  return (
    <ErrorBoundary>
      <AttractionsScreenInner />
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
    backgroundColor: group.white,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.sm,
  },
  thumbnail: {
    width: "100%",
    height: 160,
    backgroundColor: group.photoFallback,
  },
  cardContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: quickActionColors.attractions.bg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xxs,
  },
  cardTitleArea: {
    flex: 1,
    gap: spacing.xs,
  },
  cardName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    lineHeight: 21,
  },
  distanceBadge: {
    alignSelf: "flex-start",
    backgroundColor: quickActionColors.attractions.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  distanceBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: quickActionColors.attractions.icon,
  },
  cardDescription: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    lineHeight: 18,
  },

  // Action buttons
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: group.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
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
