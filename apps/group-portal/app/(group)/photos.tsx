// =============================================================================
// Group Portal — Photos Tab (2-column gallery with captions)
// =============================================================================

import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, useWindowDimensions, Image, ActivityIndicator, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { group, fontSize, radius, spacing, shadow, letterSpacing } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { GroupPhotoData } from "@/lib/types";
import { useCallback, useState, useMemo } from "react";
import { useScalePress, useSlideUp } from "@/lib/animations";

// P2-30: SSRF protection — same pattern as documents.tsx
const ALLOWED_HOSTS = ["purealphahotel.pl", "supabase.co", "supabase.in"];

function isUrlAllowed(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    return url.protocol === "https:" && ALLOWED_HOSTS.some(h => url.hostname === h || url.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

// ── Polish photo count pluralization ──────────────────────────────────────────

function photosCountLabel(n: number, lang: Lang): string {
  if (lang === "en") {
    return n === 1 ? "1 photo" : `${n} photos`;
  }
  // Polish: 1 zdjęcie, 2-4 zdjęcia, 5+ zdjęć
  if (n === 1) return "1 zdjęcie";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} zdjęcia`;
  }
  return `${n} zdjęć`;
}

const NUM_COLUMNS = 2;
const GRID_GAP = spacing.sm; // 8px
const HORIZONTAL_PADDING = spacing.xl; // 20px

// ── Animated photo card ───────────────────────────────────────────────────────

function AnimatedPhotoCard({
  item,
  photoSize,
  lang,
  isFailed,
  isLoaded,
  onImageError,
  onImageLoad,
}: {
  item: GroupPhotoData;
  photoSize: number;
  lang: Lang;
  isFailed: boolean;
  isLoaded: boolean;
  onImageError: () => void;
  onImageLoad: () => void;
}) {
  const { scaleStyle, onPressIn, onPressOut } = useScalePress(0.97);

  // P2-30: SSRF filter
  if (!isUrlAllowed(item.imageUrl)) return null;

  return (
    <Animated.View style={[{ width: photoSize }, scaleStyle]}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.photoCard, { width: photoSize, height: photoSize }]}
        accessibilityLabel={item.caption || t(lang, "group.tab.photos")}
        accessibilityRole="image"
      >
        {isFailed ? (
          <View style={[styles.photoFallback, { width: photoSize, height: photoSize }]}>
            <Icon name="image-outline" size={28} color={group.textMuted} />
          </View>
        ) : (
          <>
            {/* Loading shimmer placeholder */}
            {!isLoaded && (
              <View style={[styles.photoPlaceholder, { width: photoSize, height: photoSize }]}>
                <ActivityIndicator size="small" color={group.primary} />
              </View>
            )}
            <Image
              source={{ uri: item.imageUrl }}
              style={[styles.photoImage, { width: photoSize, height: photoSize }]}
              resizeMode="cover"
              onError={onImageError}
              onLoad={onImageLoad}
            />
          </>
        )}

        {/* Caption overlay */}
        {item.caption && !isFailed && (
          <View style={styles.captionOverlay}>
            <Text style={styles.captionText} numberOfLines={1}>{item.caption}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PhotosScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const { width: screenWidth } = useWindowDimensions();
  const headerSlide = useSlideUp(0, 12);

  const photoSize = useMemo(
    () => (screenWidth - HORIZONTAL_PADDING * 2 - GRID_GAP) / NUM_COLUMNS,
    [screenWidth],
  );

  const { data: photos, isLoading, isError, refetch } = useQuery({
    queryKey: ["group-photos", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<GroupPhotoData[]>(trackingId, "/photos");
      return res.data ?? [];
    },
    enabled: !!trackingId,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Track failed + loaded images
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());

  const photoCount = photos?.length ?? 0;

  const renderPhoto = useCallback(({ item }: { item: GroupPhotoData }) => {
    return (
      <AnimatedPhotoCard
        item={item}
        photoSize={photoSize}
        lang={lang}
        isFailed={failedIds.has(item.id)}
        isLoaded={loadedIds.has(item.id)}
        onImageError={() => setFailedIds((prev) => new Set(prev).add(item.id))}
        onImageLoad={() => setLoadedIds((prev) => new Set([...prev, item.id]))}
      />
    );
  }, [failedIds, loadedIds, photoSize, lang]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      {/* Header */}
      <Animated.View style={[styles.header, headerSlide]}>
        <Text style={styles.title}>{t(lang, "group.tab.photos")}</Text>
        {photoCount > 0 && (
          <Text style={styles.count}>{photosCountLabel(photoCount, lang)}</Text>
        )}
      </Animated.View>

      <FlatList
        data={photos ?? []}
        renderItem={renderPhoto}
        keyExtractor={(p) => p.id}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={group.primary} />}
        ListEmptyComponent={
          isError ? (
            <View style={styles.emptyContainer}>
              <Icon name="cloud-offline-outline" size={48} color={group.textMuted} />
              <Text style={styles.emptyTitle}>{t(lang, "common.error")}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => refetch()}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "common.retry")}
              >
                <Text style={styles.retryBtnText}>{t(lang, "common.retry")}</Text>
              </Pressable>
            </View>
          ) : isLoading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={group.primary} />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Icon name="camera-outline" size={48} color={group.textMuted} />
              <Text style={styles.emptyTitle}>{t(lang, "group.noPhotos")}</Text>
              <Text style={styles.emptyDesc}>{t(lang, "group.noPhotosDesc")}</Text>
            </View>
          )
        }
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },

  // Header
  header: {
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
  },
  count: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },

  // Grid
  list: {
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  row: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },

  // Photo card
  photoCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: group.photoFallback,
    ...shadow.sm,
  },
  photoImage: {
    borderRadius: radius.lg,
  },
  photoFallback: {
    borderRadius: radius.lg,
    backgroundColor: group.photoFallback,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPlaceholder: {
    position: "absolute",
    borderRadius: radius.lg,
    backgroundColor: group.photoFallback,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 0,
  },

  // Caption overlay
  captionOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  captionText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.white,
    lineHeight: 14,
  },

  // Empty states
  emptyContainer: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing["4xl"],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    marginTop: spacing.sm,
  },
  emptyDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },

  // Retry
  retryBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  retryBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
});
