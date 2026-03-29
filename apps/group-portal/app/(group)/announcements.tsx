// =============================================================================
// Group Portal -- Announcements Screen (full list + organizer CRUD)
// Hidden tab (href: null). Navigated from overview "Zobacz wszystkie".
// Data: own react-query key ["announcements", trackingId] for independent refetch.
// =============================================================================

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Image,
  Animated,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  group,
  semantic,
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
import { fetchAnnouncements, createAnnouncement, deleteAnnouncement, toggleAnnouncementPin } from "@/lib/group-api";
import { isImageUrlSafe } from "@/lib/url-safety";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useSlideUp } from "@/lib/animations";
import type { GroupAnnouncementData } from "@/lib/types";

// =============================================================================
// Helpers
// =============================================================================

const MAX_CONTENT_LENGTH = 2000;
const UNDO_TIMEOUT_MS = 5000;

function relativeTime(dateStr: string, lang: "pl" | "en"): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return t(lang, "group.timeAgo.now");
  if (diffMin < 60) return `${diffMin} ${t(lang, "group.timeAgo.minutesAgo")}`;
  if (diffHr < 24) return `${diffHr} ${t(lang, "group.timeAgo.hoursAgo")}`;
  return `${diffDay} ${t(lang, "group.timeAgo.daysAgo")}`;
}

// =============================================================================
// Author Badge
// =============================================================================

function AuthorBadge({
  authorType,
  lang,
}: {
  authorType: string;
  lang: "pl" | "en";
}) {
  const isAdmin = authorType === "admin";
  return (
    <View
      style={[
        styles.authorBadge,
        { backgroundColor: isAdmin ? "rgba(99,102,241,0.1)" : "rgba(16,185,129,0.1)" },
      ]}
    >
      <Text
        style={[
          styles.authorBadgeText,
          { color: isAdmin ? group.primary : semantic.success },
        ]}
      >
        {isAdmin
          ? t(lang, "announcements.author.admin")
          : t(lang, "announcements.author.organizer")}
      </Text>
    </View>
  );
}

// =============================================================================
// Undo Toast (P2-5)
// =============================================================================

function UndoToast({
  lang,
  onUndo,
}: {
  lang: "pl" | "en";
  onUndo: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    return () => {
      // fade out on unmount not needed -- removed instantly
    };
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.undoToast, { opacity }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.undoToastText}>
        {t(lang, "announcements.deleted")}
      </Text>
      <Pressable
        onPress={onUndo}
        style={styles.undoToastBtn}
        accessibilityRole="button"
        accessibilityLabel={t(lang, "announcements.undo")}
      >
        <Text style={styles.undoToastBtnText}>
          {t(lang, "announcements.undo")}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// =============================================================================
// Single Announcement Card
// =============================================================================

function AnnouncementCard({
  announcement,
  index,
  lang,
  isOrganizer,
  onDelete,
  onTogglePin,
  deleting,
  togglingPin,
}: {
  announcement: GroupAnnouncementData;
  index: number;
  lang: "pl" | "en";
  isOrganizer: boolean;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, currentlyPinned: boolean) => void;
  deleting: string | null;
  togglingPin: string | null;
}) {
  const slideStyle = useSlideUp(80 + index * 60, 16);
  const safeImage = announcement.imageUrl && isImageUrlSafe(announcement.imageUrl);

  return (
    <Animated.View style={slideStyle}>
      <View style={styles.card}>
        {safeImage && (
          <Image
            source={{ uri: announcement.imageUrl! }}
            style={styles.cardImage}
            resizeMode="cover"
            accessibilityLabel={announcement.content.slice(0, 80)}
          />
        )}
        <View style={styles.cardBody}>
          {announcement.isPinned && (
            <View style={styles.pinBadge}>
              <Icon name="pin" size={14} color={group.primary} />
            </View>
          )}
          <AuthorBadge authorType={announcement.authorType} lang={lang} />
          <Text style={styles.cardContent}>{announcement.content}</Text>
          <View style={styles.cardFooter}>
            <Text style={styles.cardDate}>
              {relativeTime(announcement.createdAt, lang)}
            </Text>
            {isOrganizer && (
              <View style={styles.cardActions}>
                <Pressable
                  onPress={() => onTogglePin(announcement.id, announcement.isPinned)}
                  disabled={togglingPin === announcement.id}
                  accessibilityRole="button"
                  accessibilityLabel={
                    announcement.isPinned
                      ? t(lang, "announcements.unpin")
                      : t(lang, "announcements.pin")
                  }
                  style={styles.pinToggleBtn}
                >
                  {togglingPin === announcement.id ? (
                    <ActivityIndicator size="small" color={group.primary} />
                  ) : (
                    <Icon
                      name={announcement.isPinned ? "pin" : "pin-outline"}
                      size={18}
                      color={group.primary}
                    />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => onDelete(announcement.id)}
                  disabled={deleting === announcement.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(lang, "announcements.delete")}
                  style={styles.deleteBtn}
                >
                  {deleting === announcement.id ? (
                    <ActivityIndicator size="small" color={semantic.danger} />
                  ) : (
                    <Icon name="trash-outline" size={18} color={semantic.danger} />
                  )}
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// =============================================================================
// Create Form (organizer-only) -- P2-8: added imageUrl field
// =============================================================================

function CreateForm({
  lang,
  onSubmit,
  onCancel,
  submitting,
}: {
  lang: "pl" | "en";
  onSubmit: (content: string, isPinned: boolean, imageUrl?: string) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  const canSubmit = content.trim().length > 0 && content.length <= MAX_CONTENT_LENGTH && !submitting;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    const trimmedUrl = imageUrl.trim();
    onSubmit(
      content.trim(),
      isPinned,
      trimmedUrl && isImageUrlSafe(trimmedUrl) ? trimmedUrl : undefined,
    );
  }, [canSubmit, content, isPinned, imageUrl, onSubmit]);

  return (
    <View style={styles.formContainer}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>{t(lang, "announcements.create")}</Text>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "common.cancel")}
          style={styles.formCancelBtn}
        >
          <Icon name="close" size={22} color={group.textMuted} />
        </Pressable>
      </View>

      <TextInput
        style={styles.formInput}
        placeholder={t(lang, "announcements.placeholder")}
        placeholderTextColor={group.textMuted}
        value={content}
        onChangeText={setContent}
        multiline
        maxLength={MAX_CONTENT_LENGTH}
        textAlignVertical="top"
        accessibilityLabel={t(lang, "announcements.placeholder")}
        editable={!submitting}
      />
      <Text style={styles.charCount}>
        {t(lang, "announcements.charCount").replace("{n}", String(content.length))}
      </Text>

      {/* P2-8: Image URL field */}
      <TextInput
        style={styles.imageUrlInput}
        placeholder={t(lang, "announcements.imageUrl")}
        placeholderTextColor={group.textMuted}
        value={imageUrl}
        onChangeText={setImageUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        maxLength={2000}
        accessibilityLabel={t(lang, "announcements.imageUrl")}
        editable={!submitting}
      />

      <View style={styles.formRow}>
        <View style={styles.pinnedToggle}>
          <Icon name="pin" size={16} color={isPinned ? group.primary : group.textMuted} />
          <Text style={styles.pinnedLabel}>{t(lang, "announcements.pinned")}</Text>
          <Switch
            value={isPinned}
            onValueChange={setIsPinned}
            trackColor={{ false: group.disabledBg, true: group.primary }}
            thumbColor={group.white}
            disabled={submitting}
            accessibilityLabel={t(lang, "announcements.pinned")}
          />
        </View>
      </View>

      <Pressable
        style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel={t(lang, "announcements.create")}
      >
        {submitting ? (
          <ActivityIndicator size="small" color={group.white} />
        ) : (
          <Text style={styles.submitBtnText}>{t(lang, "announcements.create")}</Text>
        )}
      </Pressable>
    </View>
  );
}

// =============================================================================
// Main Screen (Inner)
// =============================================================================

// Exported for embedding inside Messages tab (sub-tab "Ogloszenia")
// When embedded=true: skip header (back button + title) and safe-area top padding
// because the parent Messages screen provides those.
export function AnnouncementsContent({ embedded }: { embedded?: boolean }) {
  return <AnnouncementsScreenInner embedded={embedded} />;
}

function AnnouncementsScreenInner({ embedded }: { embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const portalRole = useAppStore((s) => s.portalRole);
  const isOrganizer = portalRole === "organizer";
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [togglingPin, setTogglingPin] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // P2-1: Search state
  const [searchQuery, setSearchQuery] = useState("");

  // P2-5: Undo delete state
  const [pendingDelete, setPendingDelete] = useState<{ id: string; item: GroupAnnouncementData } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const {
    data: announcements,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["announcements", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await fetchAnnouncements(trackingId);
      if (res.status === "error") throw new Error(res.errorMessage || "Failed to load announcements");
      return res.data ?? [];
    },
    enabled: !!trackingId,
    staleTime: 30_000,
  });

  // P2-1: Filtered announcements
  const filteredAnnouncements = useMemo(() => {
    if (!announcements) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return announcements;
    return announcements.filter(
      (a) => a.content.toLowerCase().includes(q),
    );
  }, [announcements, searchQuery]);

  // P2-5: Visible announcements (exclude pending delete)
  const visibleAnnouncements = useMemo(() => {
    if (!pendingDelete) return filteredAnnouncements;
    return filteredAnnouncements.filter((a) => a.id !== pendingDelete.id);
  }, [filteredAnnouncements, pendingDelete]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleCreate = useCallback(
    async (content: string, isPinned: boolean, imageUrl?: string) => {
      if (!trackingId) return;
      setSubmitting(true);
      try {
        const res = await createAnnouncement(trackingId, { content, isPinned, imageUrl });
        if (res.status === "success") {
          setShowForm(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await refetch();
          queryClient.invalidateQueries({ queryKey: ["portal-init", trackingId] });
        } else {
          Alert.alert(
            t(lang, "common.error"),
            res.errorMessage ?? t(lang, "common.error"),
          );
        }
      } finally {
        setSubmitting(false);
      }
    },
    [trackingId, lang, refetch, queryClient],
  );

  const handleTogglePin = useCallback(
    async (announcementId: string, currentlyPinned: boolean) => {
      if (!trackingId || togglingPin) return;
      setTogglingPin(announcementId);
      try {
        const res = await toggleAnnouncementPin(trackingId, announcementId, !currentlyPinned);
        if (res.status === "success") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await refetch();
          queryClient.invalidateQueries({ queryKey: ["portal-init", trackingId] });
        } else {
          Alert.alert(
            t(lang, "common.error"),
            res.errorMessage ?? t(lang, "common.error"),
          );
        }
      } finally {
        setTogglingPin(null);
      }
    },
    [trackingId, togglingPin, lang, refetch, queryClient],
  );

  // P2-5: Undo delete -- optimistic remove, 5s undo window, then real delete
  const executeDelete = useCallback(
    async (announcementId: string) => {
      setDeleting(announcementId);
      try {
        const res = await deleteAnnouncement(trackingId, announcementId);
        if (res.status === "success") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await refetch();
          queryClient.invalidateQueries({ queryKey: ["portal-init", trackingId] });
        } else {
          Alert.alert(
            t(lang, "common.error"),
            res.errorMessage ?? t(lang, "common.error"),
          );
        }
      } finally {
        setDeleting(null);
      }
    },
    [trackingId, lang, refetch, queryClient],
  );

  const handleDelete = useCallback(
    (announcementId: string) => {
      // Find the item in the current list for undo restoration
      const item = announcements?.find((a) => a.id === announcementId);
      if (!item) return;

      // Clear any existing undo timer (previous pending delete gets committed)
      if (undoTimerRef.current && pendingDelete) {
        clearTimeout(undoTimerRef.current);
        executeDelete(pendingDelete.id);
      }

      // Optimistically remove from view
      setPendingDelete({ id: announcementId, item });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Start 5s countdown to actual delete
      undoTimerRef.current = setTimeout(() => {
        setPendingDelete(null);
        undoTimerRef.current = null;
        executeDelete(announcementId);
      }, UNDO_TIMEOUT_MS);
    },
    [announcements, pendingDelete, executeDelete],
  );

  const handleUndo = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setPendingDelete(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return (
    <View style={styles.container}>
      {/* Header -- skip when embedded inside Messages tab (parent provides header) */}
      {!embedded && (
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "common.back")}
            style={styles.backBtn}
          >
            <Icon name="chevron-back" size={24} color={group.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t(lang, "announcements.title")}</Text>
          <View style={styles.headerSpacer} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + (isOrganizer ? 100 : 40) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={group.primary}
          />
        }
      >
        {/* Create Form */}
        {showForm && isOrganizer && (
          <CreateForm
            lang={lang}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            submitting={submitting}
          />
        )}

        {/* P2-1: Search bar */}
        {!isLoading && !isError && announcements && announcements.length > 0 && (
          <View style={styles.searchContainer}>
            <Icon name="search-outline" size={18} color={group.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={t(lang, "announcements.search")}
              placeholderTextColor={group.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t(lang, "announcements.search")}
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => setSearchQuery("")}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "common.cancel")}
                style={styles.searchClearBtn}
              >
                <Icon name="close-circle" size={18} color={group.textMuted} />
              </Pressable>
            )}
          </View>
        )}

        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={group.primary} size="large" />
            <Text style={styles.loadingText}>{t(lang, "common.loading")}</Text>
          </View>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <View style={styles.errorCard}>
            <Icon name="alert-circle-outline" size={32} color={group.textMuted} />
            <Text style={styles.errorText}>{t(lang, "common.error")}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => refetch()}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.retry")}
            >
              <Text style={styles.retryBtnText}>{t(lang, "common.retry")}</Text>
            </Pressable>
          </View>
        )}

        {/* Empty */}
        {!isLoading && !isError && (!announcements || announcements.length === 0) && (
          <View style={styles.emptyCard}>
            <Icon name="megaphone-outline" size={48} color={group.textMuted} />
            <Text style={styles.emptyText}>{t(lang, "announcements.empty")}</Text>
          </View>
        )}

        {/* List (using visibleAnnouncements for undo-delete filtering) */}
        {!isLoading && !isError && visibleAnnouncements.length > 0 && (
          <View style={styles.list}>
            {visibleAnnouncements.map((a, idx) => (
              <AnnouncementCard
                key={a.id}
                announcement={a}
                index={idx}
                lang={lang}
                isOrganizer={isOrganizer}
                onDelete={handleDelete}
                onTogglePin={handleTogglePin}
                deleting={deleting}
                togglingPin={togglingPin}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB for organizer */}
      {isOrganizer && !showForm && (
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 24 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowForm(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "announcements.create")}
        >
          <Icon name="add" size={28} color={group.white} />
        </Pressable>
      )}

      {/* P2-5: Undo toast */}
      {pendingDelete && (
        <View style={[styles.undoToastWrapper, { bottom: insets.bottom + (isOrganizer ? 96 : 24) }]}>
          <UndoToast lang={lang} onUndo={handleUndo} />
        </View>
      )}
    </View>
  );
}

// =============================================================================
// Exported with ErrorBoundary
// =============================================================================

export default function AnnouncementsScreen() {
  const lang = useAppStore((s) => s.lang);
  return (
    <ErrorBoundary lang={lang}>
      <AnnouncementsScreenInner />
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
    gap: spacing.lg,
    paddingHorizontal: spacing["2xl"],
  },

  // -- Header --
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: group.bg,
  },
  backBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: group.text,
    textAlign: "center",
    letterSpacing: letterSpacing.tight,
  },
  headerSpacer: {
    width: TOUCH_TARGET,
  },

  // -- P2-1: Search --
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.inputBg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    paddingVertical: spacing.sm,
  },
  searchClearBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },

  // -- Loading --
  loadingContainer: {
    paddingVertical: spacing["6xl"],
    alignItems: "center",
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },

  // -- Error --
  errorCard: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing["2xl"],
    alignItems: "center",
    gap: spacing.md,
    ...shadow.md,
  },
  errorText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing["2xl"],
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
  },
  retryBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },

  // -- Empty --
  emptyCard: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing["4xl"],
    alignItems: "center",
    gap: spacing.lg,
    ...shadow.sm,
  },
  emptyText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
  },

  // -- List --
  list: {
    gap: spacing.lg,
  },

  // -- Card --
  card: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    overflow: "hidden",
    ...shadow.md,
  },
  cardImage: {
    width: "100%",
    height: 180,
  },
  cardBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pinBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
  },
  authorBadge: {
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
  authorBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
  },
  cardContent: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    lineHeight: 22,
    paddingRight: spacing["2xl"],
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardDate: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  pinToggleBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },

  // -- Create Form --
  formContainer: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.md,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  formTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  formCancelBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  formInput: {
    backgroundColor: group.inputBg,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    minHeight: 120,
    maxHeight: 240,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "right",
  },
  // P2-8: Image URL input
  imageUrlInput: {
    backgroundColor: group.inputBg,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    minHeight: TOUCH_TARGET,
  },
  formRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pinnedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pinnedLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.textSecondary,
    marginRight: spacing.sm,
  },
  submitBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  submitBtnDisabled: {
    backgroundColor: group.disabledBg,
  },
  submitBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },

  // -- FAB --
  fab: {
    position: "absolute",
    right: spacing["2xl"],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: group.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.lg,
  },

  // -- P2-5: Undo Toast --
  undoToastWrapper: {
    position: "absolute",
    left: spacing["2xl"],
    right: spacing["2xl"],
    alignItems: "center",
  },
  undoToast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: group.text,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    width: "100%",
    ...shadow.lg,
  },
  undoToastText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.white,
    flex: 1,
  },
  undoToastBtn: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  undoToastBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primaryLight,
  },
});
