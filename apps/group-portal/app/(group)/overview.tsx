// =============================================================================
// Group Portal — Overview (Event info, countdown, agenda, announcements)
// =============================================================================

import { useMemo, useState, useCallback, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable, Animated, ActivityIndicator, Image, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { group, fontSize, radius, spacing, shadow, letterSpacing } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useSlideUp, configureListAnimation } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { logout } from "@/lib/auth";
import { groupFetch } from "@/lib/group-api";
import type { AgendaItemData, GroupAnnouncementData } from "@/lib/types";

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

  const countdownSlide = useSlideUp(100);

  const { data: agenda, isLoading: isAgendaLoading, isError: isAgendaError, refetch: refetchAgenda } = useQuery({
    queryKey: ["group-agenda", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<{ items: AgendaItemData[] }>(trackingId, "/agenda");
      return res.data?.items ?? [];
    },
    enabled: !!trackingId,
  });

  const { data: announcements, isLoading: isAnnouncementsLoading, isError: isAnnouncementsError, refetch: refetchAnnouncements } = useQuery({
    queryKey: ["group-announcements", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<GroupAnnouncementData[]>(trackingId, "/announcements");
      return res.data ?? [];
    },
    enabled: !!trackingId,
  });

  const pinnedAnnouncements = useMemo(
    () => (announcements ?? []).filter((a) => a.isPinned),
    [announcements],
  );

  // P2-35: tick counter to force countdown re-render every 60s
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((prev) => prev + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Countdown: compute days until earliest agenda date
  const eventDate = useMemo(() => {
    if (!agenda?.length) return null;
    const sorted = [...agenda].sort((a, b) =>
      new Date(a.date ?? a.startTime ?? "").getTime() - new Date(b.date ?? b.startTime ?? "").getTime(),
    );
    return sorted[0]?.date ? new Date(sorted[0].date) : null;
  }, [agenda]);

  // P1-14: strip time from both dates for accurate day-level countdown
  const countdownText = useMemo(() => {
    if (!eventDate) return "--";
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(eventDate);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target.getTime() - now.getTime()) / 86400000);
    if (diffDays > 0) return String(diffDays);
    if (diffDays === 0) return t(lang, "group.eventInProgress");
    return t(lang, "group.eventEnded");
  }, [eventDate, lang, tick]);

  const countdownSubText = useMemo(() => {
    if (!eventDate) {
      return trackingId ? "" : t(lang, "group.enterPinPrompt");
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(eventDate);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target.getTime() - now.getTime()) / 86400000);
    if (diffDays > 0) return t(lang, "group.countdownDays");
    return "";
  }, [eventDate, trackingId, lang, tick]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAgenda(), refetchAnnouncements()]);
    setRefreshing(false);
  }, [refetchAgenda, refetchAnnouncements]);

  const isError = isAgendaError || isAnnouncementsError;

  const agendaItems = useMemo(() => {
    if (!agenda?.length) return [];
    return showAllAgenda ? agenda : agenda.slice(0, 5);
  }, [agenda, showAllAgenda]);

  const handleSeeAll = useCallback(() => {
    configureListAnimation();
    setShowAllAgenda(true);
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={group.primary} />}
      >
        <View accessibilityRole="header" style={styles.headerRow}>
          <Text style={styles.title}>{t(lang, "group.tab.overview")}</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setLang(lang === "pl" ? "en" : "pl")}
              style={styles.langToggle}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "group.language")}
            >
              <Text style={styles.langText}>{lang === "pl" ? "EN" : "PL"}</Text>
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

        {/* P2-26: Loading State */}
        {isAgendaLoading && isAnnouncementsLoading && (
          <View style={styles.card}>
            <ActivityIndicator color={group.primary} />
          </View>
        )}

        {/* Error State */}
        {isError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{t(lang, "common.error")}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => { refetchAgenda(); refetchAnnouncements(); }}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.retry")}
            >
              <Text style={styles.retryBtnText}>{t(lang, "common.retry")}</Text>
            </Pressable>
          </View>
        )}

        {/* Countdown Card */}
        <Animated.View style={countdownSlide}>
          <View style={styles.countdownCard} accessibilityLabel={`${t(lang, "group.countdown")}: ${countdownText}`}>
            <Text style={styles.countdownLabel}>{t(lang, "group.countdown")}</Text>
            <Text style={styles.countdownValue}>{countdownText}</Text>
            {countdownSubText ? <Text style={styles.countdownSub}>{countdownSubText}</Text> : null}
          </View>
        </Animated.View>

        {/* Pinned Announcements */}
        {pinnedAnnouncements.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>{t(lang, "group.announcements")}</Text>
            {pinnedAnnouncements.map((a) => (
              <View key={a.id} style={styles.announcementCard}>
                <View style={styles.pinBadge}>
                  <Icon name="pin" size={14} color={group.primary} />
                </View>
                <Text style={styles.announcementText}>{a.content}</Text>
                {a.imageUrl && (
                  <Image
                    source={{ uri: a.imageUrl }}
                    style={styles.announcementImage}
                    resizeMode="cover"
                    accessibilityLabel={a.content}
                  />
                )}
                <Text style={styles.announcementDate}>
                  {new Date(a.createdAt).toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB")}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Agenda Preview */}
        <View>
          <Text style={styles.sectionTitle}>{t(lang, "group.agenda")}</Text>
          {!agenda?.length ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>{t(lang, "common.noData")}</Text>
            </View>
          ) : (
            <>
              {agendaItems.map((item) => (
                <View key={item.id} style={styles.agendaItem}>
                  <View style={styles.agendaTime}>
                    <Text style={styles.agendaTimeText}>
                      {item.startTime ?? "\u2014"}
                    </Text>
                  </View>
                  <View style={styles.agendaInfo}>
                    <Text style={styles.agendaTitle}>{item.title}</Text>
                    {item.location && (
                      <Text style={styles.agendaLocation}>{item.location}</Text>
                    )}
                  </View>
                </View>
              ))}
              {agenda.length > 5 && !showAllAgenda && (
                <Pressable
                  style={styles.seeAllBtn}
                  onPress={handleSeeAll}
                  accessibilityRole="button"
                  accessibilityLabel={t(lang, "common.seeAll")}
                >
                  <Text style={styles.seeAllText}>{t(lang, "common.seeAll")}</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  langToggle: {
    minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center",
    borderRadius: radius.md, backgroundColor: group.surface,
  },
  langText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: group.primary },
  logoutBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: group.text, letterSpacing: letterSpacing.tight },
  countdownCard: {
    backgroundColor: group.primary, borderRadius: radius.xl, padding: spacing.xl,
    alignItems: "center", gap: spacing.sm, ...shadow.md,
  },
  countdownLabel: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: group.overlayWhite70, lineHeight: 18 },
  countdownValue: { fontSize: fontSize["4xl"], fontFamily: "Inter_700Bold", color: group.white },
  countdownSub: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: group.overlayWhite60, textAlign: "center" },
  sectionTitle: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: group.text, marginBottom: spacing.sm, lineHeight: 24 },
  card: {
    backgroundColor: group.card, borderRadius: radius.lg, borderWidth: 1, borderColor: group.cardBorder,
    padding: spacing.xl, ...shadow.sm,
  },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, textAlign: "center", lineHeight: 18 },
  errorCard: {
    backgroundColor: group.card, borderRadius: radius.lg, borderWidth: 1, borderColor: group.cardBorder,
    padding: spacing.xl, alignItems: "center", gap: spacing.md, ...shadow.sm,
  },
  errorText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, textAlign: "center", lineHeight: 18 },
  retryBtn: {
    backgroundColor: group.primary, borderRadius: radius.full,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xl,
    minHeight: 44, justifyContent: "center", alignItems: "center",
  },
  retryBtnText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: group.white },
  announcementCard: {
    backgroundColor: group.card, borderRadius: radius.lg, borderWidth: 1, borderColor: group.cardBorder,
    padding: spacing.lg, marginBottom: spacing.sm, ...shadow.sm,
  },
  pinBadge: { position: "absolute", top: spacing.sm, right: spacing.sm },
  announcementText: { fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: group.text, lineHeight: 21 },
  announcementImage: { width: "100%", height: 180, borderRadius: radius.sm, marginTop: spacing.sm },
  announcementDate: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: group.textMuted, marginTop: spacing.sm },
  agendaItem: {
    flexDirection: "row", backgroundColor: group.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: group.cardBorder, padding: spacing.md,
    marginBottom: spacing.sm, gap: spacing.md, ...shadow.sm,
  },
  agendaTime: {
    width: 56, alignItems: "center", justifyContent: "center",
    backgroundColor: group.primaryLight, borderRadius: radius.sm, paddingVertical: spacing.xs,
  },
  agendaTimeText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: group.primary },
  agendaInfo: { flex: 1, gap: spacing.xxs },
  agendaTitle: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: group.text, lineHeight: 21 },
  agendaLocation: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: group.textMuted },
  seeAllBtn: {
    alignSelf: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    marginTop: spacing.sm, minHeight: 44,
  },
  seeAllText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: group.primary },
});
