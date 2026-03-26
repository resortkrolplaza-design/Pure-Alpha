// =============================================================================
// Group Portal — Overview (Event info, countdown, agenda, announcements)
// =============================================================================

import { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import { group, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { AgendaItemData, GroupAnnouncementData } from "@/lib/types";

export default function OverviewScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  // TODO: get trackingId from store/auth
  const trackingId = ""; // Will be set after PIN auth

  const { data: agenda } = useQuery({
    queryKey: ["group-agenda", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<{ items: AgendaItemData[] }>(trackingId, "/agenda");
      return res.data?.items ?? [];
    },
    enabled: !!trackingId,
  });

  const { data: announcements } = useQuery({
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

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.title}>{t(lang, "group.tab.overview")}</Text>
        </Animated.View>

        {/* Countdown Card */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.countdownCard}>
          <Text style={styles.countdownLabel}>{t(lang, "group.countdown")}</Text>
          <Text style={styles.countdownValue}>—</Text>
          <Text style={styles.countdownSub}>Zaloguj się PINem aby zobaczyć dane wydarzenia</Text>
        </Animated.View>

        {/* Pinned Announcements */}
        {pinnedAnnouncements.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300).springify()}>
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
          </Animated.View>
        )}

        {/* Agenda Preview */}
        <Animated.View entering={FadeInDown.delay(400).springify()}>
          <Text style={styles.sectionTitle}>{t(lang, "group.agenda")}</Text>
          {!agenda?.length ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>{t(lang, "common.noData")}</Text>
            </View>
          ) : (
            agenda.slice(0, 5).map((item) => (
              <View key={item.id} style={styles.agendaItem}>
                <View style={styles.agendaTime}>
                  <Text style={styles.agendaTimeText}>
                    {item.startTime ?? "—"}
                  </Text>
                </View>
                <View style={styles.agendaInfo}>
                  <Text style={styles.agendaTitle}>{item.title}</Text>
                  {item.location && (
                    <Text style={styles.agendaLocation}>📍 {item.location}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </Animated.View>
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
});
