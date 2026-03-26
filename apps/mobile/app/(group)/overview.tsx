// =============================================================================
// Group Portal — Overview (Event info, countdown, agenda, announcements)
// =============================================================================

import { useMemo, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { group, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { AgendaItemData, GroupAnnouncementData } from "@/lib/types";

export default function OverviewScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";

  const [showAllAgenda, setShowAllAgenda] = useState(false);

  const { data: agenda, isError: isAgendaError, refetch: refetchAgenda } = useQuery({
    queryKey: ["group-agenda", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<{ items: AgendaItemData[] }>(trackingId, "/agenda");
      return res.data?.items ?? [];
    },
    enabled: !!trackingId,
  });

  const { data: announcements, isError: isAnnouncementsError, refetch: refetchAnnouncements } = useQuery({
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

  // Countdown: compute days until earliest agenda date
  const eventDate = useMemo(() => {
    if (!agenda?.length) return null;
    const sorted = [...agenda].sort((a, b) =>
      new Date(a.date ?? a.startTime ?? "").getTime() - new Date(b.date ?? b.startTime ?? "").getTime(),
    );
    return sorted[0]?.date ? new Date(sorted[0].date) : null;
  }, [agenda]);

  const countdownText = useMemo(() => {
    if (!eventDate) return "--";
    const now = new Date();
    const diffMs = eventDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 0) return String(diffDays);
    if (diffDays === 0) return t(lang, "group.eventInProgress");
    return t(lang, "group.eventEnded");
  }, [eventDate, lang]);

  const countdownSubText = useMemo(() => {
    if (!eventDate) {
      return trackingId ? "" : t(lang, "group.enterPinPrompt");
    }
    const now = new Date();
    const diffMs = eventDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 0) return t(lang, "group.countdownDays");
    return "";
  }, [eventDate, trackingId, lang]);

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

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={group.primary} />}
      >
        <View accessibilityRole="header">
          <Text style={styles.title}>{t(lang, "group.tab.overview")}</Text>
        </View>

        {/* Error State */}
        {isError && (
          <View style={styles.card}>
            <Text style={styles.emptyText}>{t(lang, "common.error")}</Text>
          </View>
        )}

        {/* Countdown Card */}
        <View style={styles.countdownCard} accessibilityLabel={`${t(lang, "group.countdown")}: ${countdownText}`}>
          <Text style={styles.countdownLabel}>{t(lang, "group.countdown")}</Text>
          <Text style={styles.countdownValue}>{countdownText}</Text>
          {countdownSubText ? <Text style={styles.countdownSub}>{countdownSubText}</Text> : null}
        </View>

        {/* Pinned Announcements */}
        {pinnedAnnouncements.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>{t(lang, "group.announcements")}</Text>
            {pinnedAnnouncements.map((a) => (
              <View key={a.id} style={styles.announcementCard}>
                <View style={styles.pinBadge}>
                  <Text style={styles.pinText}>📌</Text>
                </View>
                <Text style={styles.announcementText}>{a.content}</Text>
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
                  onPress={() => setShowAllAgenda(true)}
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
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: group.text },
  countdownCard: {
    backgroundColor: group.primary, borderRadius: radius.xl, padding: spacing.xl,
    alignItems: "center", gap: spacing.sm, ...shadow.md,
  },
  countdownLabel: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.7)" },
  countdownValue: { fontSize: fontSize["4xl"], fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  countdownSub: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "center" },
  sectionTitle: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: group.text, marginBottom: spacing.sm },
  card: {
    backgroundColor: group.card, borderRadius: radius.lg, borderWidth: 1, borderColor: group.cardBorder,
    padding: spacing.xl, ...shadow.sm,
  },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, textAlign: "center" },
  announcementCard: {
    backgroundColor: group.card, borderRadius: radius.lg, borderWidth: 1, borderColor: group.cardBorder,
    padding: spacing.lg, marginBottom: spacing.sm, ...shadow.sm,
  },
  pinBadge: { position: "absolute", top: spacing.sm, right: spacing.sm },
  pinText: { fontSize: 14 },
  announcementText: { fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: group.text, lineHeight: 22 },
  announcementDate: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: group.textMuted, marginTop: spacing.sm },
  agendaItem: {
    flexDirection: "row", backgroundColor: group.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: group.cardBorder, padding: spacing.md,
    marginBottom: spacing.sm, gap: spacing.md, ...shadow.sm,
  },
  agendaTime: {
    width: 56, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(99,102,241,0.1)", borderRadius: radius.sm, paddingVertical: spacing.xs,
  },
  agendaTimeText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: group.primary },
  agendaInfo: { flex: 1, gap: 2 },
  agendaTitle: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: group.text },
  agendaLocation: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: group.textMuted },
  seeAllBtn: {
    alignSelf: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    marginTop: spacing.sm, minHeight: 44,
  },
  seeAllText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: group.primary },
});
