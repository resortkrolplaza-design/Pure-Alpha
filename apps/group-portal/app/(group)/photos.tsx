// =============================================================================
// Group Portal — Photos Tab (2-column gallery with captions + fullscreen viewer)
// =============================================================================

import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, useWindowDimensions, Image, ActivityIndicator, Animated, Modal, Alert, ActionSheetIOS, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { group, fontSize, radius, spacing, shadow, letterSpacing, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch, triggerSessionExpired } from "@/lib/group-api";
import { getGroupToken } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import type { GroupPhotoData } from "@/lib/types";
import { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { useScalePress, useSlideUp } from "@/lib/animations";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

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

// ── Auto-hide timer duration (ms) ────────────────────────────────────────────
const NAV_AUTO_HIDE_MS = 3000;

// ── Animated photo card ───────────────────────────────────────────────────────

function AnimatedPhotoCard({
  item,
  photoSize,
  lang,
  isFailed,
  isLoaded,
  onImageError,
  onImageLoad,
  onPress,
}: {
  item: GroupPhotoData;
  photoSize: number;
  lang: Lang;
  isFailed: boolean;
  isLoaded: boolean;
  onImageError: () => void;
  onImageLoad: () => void;
  onPress: () => void;
}) {
  const { scaleStyle, onPressIn, onPressOut } = useScalePress(0.97);

  // P2-30: SSRF filter
  if (!isUrlAllowed(item.imageUrl)) return null;

  return (
    <Animated.View style={[{ width: photoSize }, scaleStyle]}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
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

// ── Fullscreen photo viewer modal ────────────────────────────────────────────

function PhotoViewerModal({
  photos,
  viewerIndex,
  onClose,
  lang,
}: {
  photos: GroupPhotoData[];
  viewerIndex: number | null;
  onClose: () => void;
  lang: Lang;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [navVisible, setNavVisible] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(viewerIndex ?? 0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync currentIndex when viewerIndex changes (modal opened on a new photo)
  useEffect(() => {
    if (viewerIndex !== null) {
      setCurrentIndex(viewerIndex);
      setNavVisible(true);
      resetAutoHide();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerIndex]);

  // Cleanup timer on unmount
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
    if (currentIndex < photos.length - 1) {
      setCurrentIndex(currentIndex + 1);
      resetAutoHide();
    }
  }

  if (viewerIndex === null || photos.length === 0) return null;

  const photo = photos[currentIndex];
  if (!photo) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;
  const counterText = `${currentIndex + 1} ${t(lang, "photos.viewer.of")} ${photos.length}`;

  return (
    <Modal
      visible={viewerIndex !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={viewerStyles.backdrop}>
        {/* Tap area to toggle nav */}
        <Pressable
          style={viewerStyles.tapArea}
          onPress={toggleNav}
          accessibilityLabel={navVisible ? t(lang, "common.close") : t(lang, "group.tab.photos")}
        >
          <Image
            source={{ uri: photo.imageUrl }}
            style={[viewerStyles.image, { width: screenWidth }]}
            resizeMode="contain"
          />
        </Pressable>

        {/* Top bar: close + counter */}
        {navVisible && (
          <View style={[viewerStyles.topBar, { paddingTop: insets.top + spacing.sm }]}>
            {/* Counter centered */}
            <View style={viewerStyles.counterContainer}>
              <Text style={viewerStyles.counterText}>{counterText}</Text>
            </View>

            {/* Close button top-right */}
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

        {/* Bottom bar: caption + uploadedBy */}
        {navVisible && (photo.caption || photo.uploadedBy) && (
          <View style={[viewerStyles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
            {photo.caption && (
              <Text style={viewerStyles.captionText} numberOfLines={3}>
                {photo.caption}
              </Text>
            )}
            {photo.uploadedBy && (
              <Text style={viewerStyles.uploadedByText}>
                {photo.uploadedBy}
              </Text>
            )}
          </View>
        )}

        {/* Prev button */}
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

// ── Main screen ───────────────────────────────────────────────────────────────

function PhotosScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const guest = useAppStore((s) => s.guest);
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
      if (res.status === "error") throw new Error(res.errorMessage || "Failed to load photos");
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

  // Fullscreen viewer state
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const photoCount = photos?.length ?? 0;

  // Build a list of viewable photos (only those that pass SSRF check)
  const viewablePhotos = useMemo(() => {
    return (photos ?? []).filter((p) => isUrlAllowed(p.imageUrl));
  }, [photos]);

  // ── Photo upload ──
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const pickAndUpload = useCallback(async (source: "camera" | "gallery") => {
    try {
      const permResult = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permResult.granted) {
        Alert.alert(t(lang, "common.error"), t(lang, "photos.permissionDenied"));
        return;
      }

      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      // P2: Reject oversized images (> 10 MB) to prevent OOM on upload
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        Alert.alert(t(lang, "common.error"), t(lang, "photos.fileTooLarge"));
        return;
      }

      setUploading(true);

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        type: asset.mimeType || "image/jpeg",
        name: asset.fileName || `photo-${Date.now()}.jpg`,
      } as unknown as Blob);

      // Backend requires deviceId (min 8 chars) for dedup
      const deviceId = trackingId.slice(0, 8) + "-" + Date.now().toString(36);
      formData.append("deviceId", deviceId);

      // Guest name for uploadedBy
      const guestName = guest ? [guest.firstName, guest.lastName].filter(Boolean).join(" ") : "";
      if (guestName) formData.append("uploadedBy", guestName);

      const token = await getGroupToken();
      const url = `${API_BASE}/api/portal/${encodeURIComponent(trackingId)}/photos`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });
      if (res.status === 401 || res.status === 403) {
        triggerSessionExpired();
        throw new Error("Session expired");
      }
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.errorMessage || "Upload failed");

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["group-photos"] });
    } catch {
      Alert.alert(t(lang, "common.error"), t(lang, "photos.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }, [trackingId, lang, queryClient, guest]);

  const handleAddPhoto = useCallback(() => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t(lang, "common.cancel"), t(lang, "photos.fromCamera"), t(lang, "photos.fromGallery")],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) pickAndUpload("camera");
          if (idx === 2) pickAndUpload("gallery");
        },
      );
    } else {
      Alert.alert(t(lang, "photos.addPhoto"), undefined, [
        { text: t(lang, "photos.fromCamera"), onPress: () => pickAndUpload("camera") },
        { text: t(lang, "photos.fromGallery"), onPress: () => pickAndUpload("gallery") },
        { text: t(lang, "common.cancel"), style: "cancel" },
      ]);
    }
  }, [lang, pickAndUpload]);

  const renderPhoto = useCallback(({ item, index }: { item: GroupPhotoData; index: number }) => {
    // Find index in viewablePhotos for the viewer
    const viewableIdx = viewablePhotos.findIndex((p) => p.id === item.id);

    return (
      <AnimatedPhotoCard
        item={item}
        photoSize={photoSize}
        lang={lang}
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
  }, [failedIds, loadedIds, photoSize, lang, viewablePhotos]);

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

      {/* Upload FAB */}
      <Pressable
        style={styles.fab}
        onPress={handleAddPhoto}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel={t(lang, "photos.addPhoto")}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={group.white} />
        ) : (
          <Icon name="add" size={28} color={group.white} />
        )}
      </Pressable>

      {/* Fullscreen photo viewer */}
      <PhotoViewerModal
        photos={viewablePhotos}
        viewerIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
        lang={lang}
      />
    </View>
  );
}

// ── Default export wrapped in ErrorBoundary ──────────────────────────────────

export default function PhotosScreenWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <PhotosScreen />
    </ErrorBoundary>
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
  fab: {
    position: "absolute" as const,
    bottom: 100,
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: group.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...shadow.lg,
  },
});

// ── Viewer Styles ─────────────────────────────────────────────────────────────

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
  uploadedByText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    marginTop: spacing.xs,
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
