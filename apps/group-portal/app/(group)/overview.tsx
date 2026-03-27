// =============================================================================
// Group Portal — Overview (Event info, countdown, agenda, announcements)
// World-class redesign: Airbnb + Apple HIG
// =============================================================================

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
  Animated,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  group,
  fontSize,
  radius,
  spacing,
  shadow,
  letterSpacing,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useSlideUp, useScalePress, configureListAnimation } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { logout } from "@/lib/auth";
import { groupFetch } from "@/lib/group-api";
import type { AgendaItemData, GroupAnnouncementData } from "@/lib/types";

// -- Relative time helper ---------------------------------------------------

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

// -- Quick Action Chip (horizontal scroll) ----------------------------------

const QUICK_ACTIONS = [
  { labelKey: "group.quickGuests", icon: "people-outline" as const, tab: "guests" },
  { labelKey: "group.quickMessages", icon: "chatbubbles-outline" as const, tab: "messages" },
  { labelKey: "group.quickDocuments", icon: "document-text-outline" as const, tab: "documents" },
  { labelKey: "group.quickPhotos", icon: "camera-outline" as const, tab: "photos" },
] as const;

function QuickActionChip({
  label,
  iconName,
  onPress,
}: {
  label: string;
  iconName: React.ComponentProps<typeof Icon>["name"];
  onPress: () => void;
}) {
  const { scaleStyle, onPressIn, onPressOut } = useScalePress(0.95);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.chipContainer, scaleStyle]}>
        <Icon name={iconName} size={16} color={group.primary} />
        <Text style={styles.chipLabel}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// -- Announcement Card (with staggered entrance) ----------------------------

function AnnouncementCard({
  announcement,
  index,
  lang,
}: {
  announcement: GroupAnnouncementData;
  index: number;
  lang: "pl" | "en";
}) {
  const slideStyle = useSlideUp(100 + index * 80, 16);

  return (
    <Animated.View style={slideStyle}>
      <View style={styles.announcementCard}>
        {announcement.imageUrl && (
          <Image
            source={{ uri: announcement.imageUrl }}
            style={styles.announcementImage}
            resizeMode="cover"
            accessibilityLabel={announcement.content}
          />
        )}
        <View style={styles.announcementBody}>
          {announcement.isPinned && (
            <View style={styles.pinBadge}>
              <Icon name="pin" size={14} color={group.primary} />
            </View>
          )}
          <Text style={styles.announcementText}>{announcement.content}</Text>
          <Text style={styles.announcementDate}>
            {relativeTime(announcement.createdAt, lang)}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// -- Main Screen ------------------------------------------------------------

export default function OverviewScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";

  const [showAllAgenda, setShowAllAgenda] = useState(false);

  const handleLogout = useCallback(() => {
    Alert.alert(t(lang, "group.logout"), t(lang, "group.logoutConfirm"), [
      { text: t(lang, "common.cancel"), style: "cancel" },
      {
        text: t(lang, "group.logout"),
        style: "destructive",
        onPress: async () => {
          await logout();
          useAppStore.getState().reset();
          router.replace("/");
        },
      },
    ]);
  }, [lang]);

  // -- Slide-up entrance animations --
  const headerSlide = useSlideUp(0, 12);
  const countdownSlide = useSlideUp(80, 16);
  const quickActionsSlide = useSlideUp(160, 12);

  // -- Data fetching --
  const {
    data: agenda,
    isLoading: isAgendaLoading,
    isError: isAgendaError,
    refetch: refetchAgenda,
  } = useQuery({
    queryKey: ["group-agenda", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<{ items: AgendaItemData[] }>(
        trackingId,
        "/agenda",
      );
      return res.data?.items ?? [];
    },
    enabled: !!trackingId,
  });

  const {
    data: announcements,
    isLoading: isAnnouncementsLoading,
    isError: isAnnouncementsError,
    refetch: refetchAnnouncements,
  } = useQuery({
    queryKey: ["group-announcements", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<GroupAnnouncementData[]>(
        trackingId,
        "/announcements",
      );
      return res.data ?? [];
    },
    enabled: !!trackingId,
  });

  // P2-35: tick counter to force countdown re-render every 60s
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((prev) => prev + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Countdown: compute days until earliest agenda date
  const eventDate = useMemo(() => {
    if (!agenda?.length) return null;
    const sorted = [...agenda].sort(
      (a, b) =>
        new Date(a.date ?? a.startTime ?? "").getTime() -
        new Date(b.date ?? b.startTime ?? "").getTime(),
    );
    return sorted[0]?.date ? new Date(sorted[0].date) : null;
  }, [agenda]);

  // P1-14: strip time from both dates for accurate day-level countdown
  const diffDays = useMemo(() => {
    if (!eventDate) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(eventDate);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / 86400000);
  }, [eventDate, tick]);

  const countdownText = useMemo(() => {
    if (diffDays === null) return "--";
    if (diffDays > 0) return String(diffDays);
    if (diffDays === 0) return t(lang, "group.eventInProgress");
    return t(lang, "group.eventEnded");
  }, [diffDays, lang]);

  const countdownSubText = useMemo(() => {
    if (diffDays === null) {
      return trackingId ? "" : t(lang, "group.enterPinPrompt");
    }
    if (diffDays > 0) return t(lang, "group.countdownDaysLabel");
    return "";
  }, [diffDays, trackingId, lang]);

  const isEventInProgress = diffDays === 0;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAgenda(), refetchAnnouncements()]);
    setRefreshing(false);
  }, [refetchAgenda, refetchAnnouncements]);

  const isError = isAgendaError || isAnnouncementsError;
  const isLoading = isAgendaLoading && isAnnouncementsLoading;

  const agendaItems = useMemo(() => {
    if (!agenda?.length) return [];
    return showAllAgenda ? agenda : agenda.slice(0, 5);
  }, [agenda, showAllAgenda]);

  const handleSeeAll = useCallback(() => {
    configureListAnimation();
    setShowAllAgenda(true);
  }, []);

  const handleQuickAction = useCallback((tab: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.navigate(`/(group)/${tab}` as any);
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + 100,
          },
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
        {/* ── Header Section ── */}
        <Animated.View style={headerSlide}>
          <View accessibilityRole="header" style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>
                {t(lang, "group.portalTitle")}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setLang(lang === "pl" ? "en" : "pl")}
                style={styles.langToggle}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "group.language")}
              >
                <Text style={styles.langText}>
                  {lang === "pl" ? "EN" : "PL"}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleLogout}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "group.logout")}
                style={styles.logoutBtn}
              >
                <Icon name="log-out-outline" size={22} color={group.textMuted} />
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* ── Loading State ── */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={group.primary} size="large" />
          </View>
        )}

        {/* ── Error State ── */}
        {isError && (
          <View style={styles.errorCard}>
            <Icon name="alert-circle-outline" size={32} color={group.textMuted} />
            <Text style={styles.errorText}>{t(lang, "common.error")}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => {
                refetchAgenda();
                refetchAnnouncements();
              }}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.retry")}
            >
              <Text style={styles.retryBtnText}>
                {t(lang, "common.retry")}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── Countdown Hero Card ── */}
        <Animated.View style={countdownSlide}>
          <LinearGradient
            colors={[group.primary, group.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.countdownGradient}
          >
            <View
              style={styles.countdownInner}
              accessibilityLabel={`${t(lang, "group.countdown")}: ${countdownText}`}
            >
              {isEventInProgress && (
                <View style={styles.pulseDotRow}>
                  <View style={styles.pulseDot} />
                  <Text style={styles.pulseLabel}>
                    {t(lang, "group.eventInProgress")}
                  </Text>
                </View>
              )}
              {!isEventInProgress && (
                <>
                  <Text style={styles.countdownValue}>{countdownText}</Text>
                  {countdownSubText ? (
                    <Text style={styles.countdownSub}>{countdownSubText}</Text>
                  ) : null}
                </>
              )}
              {diffDays === null && !isLoading && (
                <View style={styles.countdownEmpty}>
                  <Icon name="calendar-outline" size={40} color={group.overlayWhite40} />
                  <Text style={styles.countdownEmptyText}>
                    {t(lang, "group.countdown")}
                  </Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── Quick Actions Bar ── */}
        <Animated.View style={quickActionsSlide}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsRow}
          >
            {QUICK_ACTIONS.map((action) => (
              <QuickActionChip
                key={action.tab}
                label={t(lang, action.labelKey)}
                iconName={action.icon}
                onPress={() => handleQuickAction(action.tab)}
              />
            ))}
          </ScrollView>
        </Animated.View>

        {/* ── Agenda Section ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {t(lang, "group.agenda")}
            </Text>
            {agenda && agenda.length > 5 && !showAllAgenda && (
              <Pressable
                onPress={handleSeeAll}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "group.seeAllAgenda")}
                style={styles.seeAllBtn}
              >
                <Text style={styles.seeAllText}>
                  {t(lang, "group.seeAllAgenda")}
                </Text>
                <Icon name="chevron-forward" size={14} color={group.primary} />
              </Pressable>
            )}
          </View>

          {!agenda?.length ? (
            <View style={styles.emptyCard}>
              <Icon
                name="calendar-outline"
                size={36}
                color={group.textMuted}
              />
              <Text style={styles.emptyText}>
                {t(lang, "group.noAgenda")}
              </Text>
            </View>
          ) : (
            <View style={styles.timelineContainer}>
              {agendaItems.map((item, idx) => (
                <View key={item.id} style={styles.timelineRow}>
                  {/* Timeline rail */}
                  <View style={styles.timelineRail}>
                    <View style={styles.timelineDot} />
                    {idx < agendaItems.length - 1 && (
                      <View style={styles.timelineLine} />
                    )}
                  </View>
                  {/* Content */}
                  <View style={styles.agendaCard}>
                    <View style={styles.agendaTimePill}>
                      <Text style={styles.agendaTimeText}>
                        {item.startTime ?? "\u2014"}
                      </Text>
                    </View>
                    <Text style={styles.agendaTitle}>{item.title}</Text>
                    {item.location && (
                      <View style={styles.agendaLocationRow}>
                        <Icon
                          name="location-outline"
                          size={12}
                          color={group.textMuted}
                        />
                        <Text style={styles.agendaLocation}>
                          {item.location}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Announcements Section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t(lang, "group.announcements")}
          </Text>

          {!announcements?.length ? (
            <View style={styles.emptyCard}>
              <Icon
                name="megaphone-outline"
                size={36}
                color={group.textMuted}
              />
              <Text style={styles.emptyText}>
                {t(lang, "group.noAnnouncements")}
              </Text>
            </View>
          ) : (
            <View style={styles.announcementsList}>
              {announcements.map((a, idx) => (
                <AnnouncementCard
                  key={a.id}
                  announcement={a}
                  index={idx}
                  lang={lang}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: group.bg,
  },
  scroll: {
    paddingHorizontal: spacing["2xl"],
    gap: spacing["2xl"],
  },

  // ── Header ──
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  langToggle: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: group.surface,
  },
  langText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },
  logoutBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Loading ──
  loadingContainer: {
    paddingVertical: spacing["4xl"],
    alignItems: "center",
  },

  // ── Error ──
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
    lineHeight: 21,
  },
  retryBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing["2xl"],
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  retryBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },

  // ── Countdown Hero Card ──
  countdownGradient: {
    borderRadius: radius["2xl"],
    ...shadow.lg,
    overflow: "hidden",
  },
  countdownInner: {
    paddingVertical: spacing["3xl"],
    paddingHorizontal: spacing["2xl"],
    alignItems: "center",
    gap: spacing.sm,
  },
  countdownValue: {
    fontSize: 56,
    fontFamily: "Inter_700Bold",
    color: group.white,
    letterSpacing: letterSpacing.snug,
  },
  countdownSub: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.overlayWhite70,
    textAlign: "center",
  },
  countdownEmpty: {
    alignItems: "center",
    gap: spacing.md,
  },
  countdownEmptyText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.overlayWhite60,
  },
  pulseDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#34d399",
  },
  pulseLabel: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.white,
  },

  // ── Quick Actions ──
  quickActionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: group.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: group.cardBorder,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.sm,
  },
  chipLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.text,
  },

  // ── Section ──
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    lineHeight: 24,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  seeAllText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },

  // ── Empty State ──
  emptyCard: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing["3xl"],
    alignItems: "center",
    gap: spacing.md,
    ...shadow.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },

  // ── Timeline Agenda ──
  timelineContainer: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: "row",
    minHeight: 72,
  },
  timelineRail: {
    width: 24,
    alignItems: "center",
    paddingTop: 6,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: group.primary,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: group.primaryLight,
    marginTop: 4,
  },
  agendaCard: {
    flex: 1,
    backgroundColor: group.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing.lg,
    marginLeft: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
    ...shadow.sm,
  },
  agendaTimePill: {
    alignSelf: "flex-start",
    backgroundColor: group.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  agendaTimeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },
  agendaTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.text,
    lineHeight: 21,
  },
  agendaLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  agendaLocation: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },

  // ── Announcements ──
  announcementsList: {
    gap: spacing.md,
  },
  announcementCard: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    overflow: "hidden",
    ...shadow.md,
  },
  announcementImage: {
    width: "100%",
    height: 180,
  },
  announcementBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pinBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
  },
  announcementText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    lineHeight: 22,
    paddingRight: spacing["2xl"],
  },
  announcementDate: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },
});
