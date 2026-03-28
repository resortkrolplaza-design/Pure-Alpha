// =============================================================================
// Group Portal — Hotel Gallery Screen (2-column grid with fullscreen viewer)
// Data source: initData.gallery from shared portal-init cache
// =============================================================================

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Image,
  Modal,
  Dimensions,
  ActivityIndicator,
  Animated,
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
  TOUCH_TARGET,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchPortalInit } from "@/lib/group-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { isImageUrlSafe } from "@/lib/url-safety";
import { useScalePress, useSlideUp } from "@/lib/animations";

// ── Types ────────────────────────────────────────────────────────────────────

interface GalleryItem {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  alt: string | null;
  caption: string | null;
  category: string | null;
}

// ── Layout constants ─────────────────────────────────────────────────────────

const NUM_COLUMNS = 2;
const GRID_GAP = spacing.sm;
const HORIZONTAL_PADDING = spacing.xl;
const NAV_AUTO_HIDE_MS = 3000;

// ── Category filter chip ─────────────────────────────────────────────────────

function CategoryChip({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        chipStyles.chip,
        isActive && chipStyles.chipActive,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={label}
    >
      <Text
        style={[
          chipStyles.chipText,
          isActive && chipStyles.chipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Gallery image card ───────────────────────────────────────────────────────

function GalleryImageCard({
  item,
  imageSize,
  isFailed,
  isLoaded,
  onImageError,
  onImageLoad,
  onPress,
}: {
  item: GalleryItem;
  imageSize: number;
  isFailed: boolean;
  isLoaded: boolean;
  onImageError: () => void;
  onImageLoad: () => void;
  onPress: () => void;
}) {
  const { scaleStyle, onPressIn, onPressOut } = useScalePress(0.97);

  if (!isImageUrlSafe(item.url)) return null;

  return (
    <Animated.View style={[{ width: imageSize }, scaleStyle]}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        style={[styles.imageCard, { width: imageSize, height: imageSize }]}
        accessibilityLabel={item.alt || item.caption || t("pl", "gallery.hotelTitle")}
        accessibilityRole="image"
      >
        {isFailed ? (
          <View style={[styles.imageFallback, { width: imageSize, height: imageSize }]}>
            <Icon name="image-outline" size={28} color={group.textMuted} />
          </View>
        ) : (
          <>
            {!isLoaded && (
              <View style={[styles.imagePlaceholder, { width: imageSize, height: imageSize }]}>
                <ActivityIndicator size="small" color={group.primary} />
              </View>
            )}
            <Image
              source={{ uri: item.thumbnailUrl || item.url }}
              style={[styles.imageThumb, { width: imageSize, height: imageSize }]}
              resizeMode="cover"
              onError={onImageError}
              onLoad={onImageLoad}
            />
          </>
        )}

        {item.caption && !isFailed && (
          <View style={styles.captionOverlay}>
            <Text style={styles.captionText} numberOfLines={1}>
              {item.caption}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ── Fullscreen gallery viewer modal ──────────────────────────────────────────

function GalleryViewerModal({
  images,
  viewerIndex,
  onClose,
  lang,
}: {
  images: GalleryItem[];
  viewerIndex: number | null;
  onClose: () => void;
  lang: "pl" | "en";
}) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = Dimensions.get("window");
  const [navVisible, setNavVisible] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(viewerIndex ?? 0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (viewerIndex !== null) {
      setCurrentIndex(viewerIndex);
      setNavVisible(true);
      resetAutoHide();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerIndex]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function resetAutoHide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setNavVisible(false);
    }, NAV_AUTO_HIDE_MS);
  }

  function toggleNav() {
    if (navVisible) {
      setNavVisible(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      setNavVisible(true);
      resetAutoHide();
    }
  }

  function goToPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      resetAutoHide();
    }
  }

  function goToNext() {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
      resetAutoHide();
    }
  }

  if (viewerIndex === null || images.length === 0) return null;

  const image = images[currentIndex];
  if (!image) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;
  const counterText = `${currentIndex + 1} ${t(lang, "photos.viewer.of")} ${images.length}`;

  return (
    <Modal
      visible={viewerIndex !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={viewerStyles.backdrop}>
        {/* Tap area to toggle navigation overlay */}
        <Pressable
          style={viewerStyles.tapArea}
          onPress={toggleNav}
          accessibilityLabel={navVisible ? t(lang, "common.close") : t(lang, "gallery.hotelTitle")}
        >
          <Image
            source={{ uri: image.url }}
            style={[viewerStyles.image, { width: screenWidth }]}
            resizeMode="contain"
          />
        </Pressable>

        {/* Top bar: counter + close */}
        {navVisible && (
          <View style={[viewerStyles.topBar, { paddingTop: insets.top + spacing.sm }]}>
            <View style={viewerStyles.counterContainer}>
              <Text style={viewerStyles.counterText}>{counterText}</Text>
            </View>

            <Pressable
              onPress={onClose}
              style={viewerStyles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.close")}
              hitSlop={8}
            >
              <Icon name="close" size={24} color={group.white} />
            </Pressable>
          </View>
        )}

        {/* Bottom bar: caption + alt text */}
        {navVisible && (image.caption || image.alt) && (
          <View style={[viewerStyles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
            {image.caption && (
              <Text style={viewerStyles.captionText} numberOfLines={3}>
                {image.caption}
              </Text>
            )}
            {image.alt && !image.caption && (
              <Text style={viewerStyles.altText} numberOfLines={2}>
                {image.alt}
              </Text>
            )}
          </View>
        )}

        {/* Previous button */}
        {navVisible && hasPrev && (
          <Pressable
            onPress={goToPrev}
            style={[viewerStyles.navBtn, viewerStyles.navBtnLeft]}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "photos.previous")}
            hitSlop={8}
          >
            <Icon name="chevron-back" size={28} color={group.white} />
          </Pressable>
        )}

        {/* Next button */}
        {navVisible && hasNext && (
          <Pressable
            onPress={goToNext}
            style={[viewerStyles.navBtn, viewerStyles.navBtnRight]}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "photos.next")}
            hitSlop={8}
          >
            <Icon name="chevron-forward" size={28} color={group.white} />
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const { width: screenWidth } = Dimensions.get("window");
  const headerSlide = useSlideUp(0, 12);

  const imageSize = useMemo(
    () => (screenWidth - HORIZONTAL_PADDING * 2 - GRID_GAP) / NUM_COLUMNS,
    [screenWidth],
  );

  // Read from shared portal-init cache
  const { data: initData, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-init", trackingId],
    queryFn: async () => {
      if (!trackingId) return null;
      const res = await fetchPortalInit(trackingId);
      return res.status === "success" ? res.data : null;
    },
    enabled: !!trackingId,
    staleTime: 60_000,
  });

  const allImages = useMemo<GalleryItem[]>(() => {
    return (initData?.gallery ?? []).filter((img) => isImageUrlSafe(img.url));
  }, [initData?.gallery]);

  // Extract unique categories
  const categories = useMemo<string[]>(() => {
    const cats = new Set<string>();
    for (const img of allImages) {
      if (img.category) cats.add(img.category);
    }
    return Array.from(cats).sort();
  }, [allImages]);

  const hasMultipleCategories = categories.length > 1;

  // Category filter state
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredImages = useMemo(() => {
    if (!activeCategory) return allImages;
    return allImages.filter((img) => img.category === activeCategory);
  }, [allImages, activeCategory]);

  // Track failed + loaded images
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());

  // Fullscreen viewer state
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const renderImage = useCallback(
    ({ item }: { item: GalleryItem }) => {
      const viewableIdx = filteredImages.findIndex((img) => img.id === item.id);

      return (
        <GalleryImageCard
          item={item}
          imageSize={imageSize}
          isFailed={failedIds.has(item.id)}
          isLoaded={loadedIds.has(item.id)}
          onImageError={() => setFailedIds((prev) => new Set(prev).add(item.id))}
          onImageLoad={() => setLoadedIds((prev) => new Set([...prev, item.id]))}
          onPress={() => {
            if (!failedIds.has(item.id) && viewableIdx >= 0) {
              setViewerIndex(viewableIdx);
            }
          }}
        />
      );
    },
    [failedIds, loadedIds, imageSize, filteredImages],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      {/* Header: back button + title */}
      <Animated.View style={[styles.header, headerSlide]}>
        <Pressable
          style={styles.headerBackBtn}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "common.back")}
        >
          <Icon name="chevron-back" size={24} color={group.text} />
        </Pressable>
        <Text style={styles.title}>{t(lang, "gallery.hotelTitle")}</Text>
      </Animated.View>

      {/* Category filter chips */}
      {hasMultipleCategories && (
        <View style={styles.chipRow}>
          <CategoryChip
            label={lang === "pl" ? "Wszystkie" : "All"}
            isActive={activeCategory === null}
            onPress={() => setActiveCategory(null)}
          />
          {categories.map((cat) => (
            <CategoryChip
              key={cat}
              label={cat}
              isActive={activeCategory === cat}
              onPress={() =>
                setActiveCategory((prev) => (prev === cat ? null : cat))
              }
            />
          ))}
        </View>
      )}

      <FlatList
        data={filteredImages}
        renderItem={renderImage}
        keyExtractor={(img) => img.id}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
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
              <Icon name="images-outline" size={48} color={group.textMuted} />
              <Text style={styles.emptyTitle}>{t(lang, "common.noData")}</Text>
            </View>
          )
        }
      />

      {/* Fullscreen viewer */}
      <GalleryViewerModal
        images={filteredImages}
        viewerIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
        lang={lang}
      />
    </View>
  );
}

// ── Default export wrapped in ErrorBoundary ──────────────────────────────────

export default function GalleryScreenWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <GalleryScreen />
    </ErrorBoundary>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: group.bg,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: spacing.lg,
  },
  headerBackBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: group.card,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
    flex: 1,
  },

  // Category chips row
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: spacing.lg,
  },

  // Grid
  list: {
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  row: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },

  // Image card
  imageCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: group.photoFallback,
    ...shadow.sm,
  },
  imageThumb: {
    borderRadius: radius.lg,
  },
  imageFallback: {
    borderRadius: radius.lg,
    backgroundColor: group.photoFallback,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholder: {
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

  // Retry
  retryBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    minHeight: TOUCH_TARGET,
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

// ── Category Chip Styles ─────────────────────────────────────────────────────

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: group.card,
    borderWidth: 1,
    borderColor: group.cardBorder,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
  },
  chipActive: {
    backgroundColor: group.primary,
    borderColor: group.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.textSecondary,
  },
  chipTextActive: {
    color: group.white,
  },
});

// ── Viewer Styles ────────────────────────────────────────────────────────────

const viewerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  tapArea: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    flex: 1,
  },

  // Top bar
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  counterContainer: {
    flex: 1,
    alignItems: "center",
  },
  counterText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.white,
  },
  closeBtn: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.sm,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  captionText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.white,
    lineHeight: 22,
  },
  altText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    lineHeight: 18,
  },

  // Nav buttons
  navBtn: {
    position: "absolute",
    top: "50%",
    marginTop: -(TOUCH_TARGET / 2),
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnLeft: {
    left: spacing.md,
  },
  navBtnRight: {
    right: spacing.md,
  },
});
