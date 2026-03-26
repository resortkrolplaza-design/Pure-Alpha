// =============================================================================
// Group Portal — Guests Tab (Guest list + RSVP status)
// =============================================================================

import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { group, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { GroupGuestData } from "@/lib/types";
import { useCallback, useState } from "react";

const RSVP_COLORS: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
  declined: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
  pending: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" },
};

const RSVP_LABEL_KEYS: Record<string, string> = {
  confirmed: "group.rsvp.confirmed",
  declined: "group.rsvp.declined",
  pending: "group.rsvp.pending",
};

export default function GuestsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";

  const { data: guests, isLoading, isError, refetch } = useQuery({
    queryKey: ["group-guests", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<GroupGuestData[]>(trackingId, "/guests");
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

  const renderGuest = useCallback(({ item: g }: { item: GroupGuestData }) => {
    const rsvp = RSVP_COLORS[g.rsvpStatus] ?? RSVP_COLORS.pending;
    const rsvpLabelKey = RSVP_LABEL_KEYS[g.rsvpStatus] ?? RSVP_LABEL_KEYS.pending;
    return (
      <View style={styles.guestCard} accessibilityLabel={`${g.firstName} ${g.lastName}, ${t(lang, rsvpLabelKey)}`}>
        <View style={styles.guestAvatar}>
          <Text style={styles.guestInitials}>
            {(g.firstName?.[0] ?? "").toUpperCase()}{(g.lastName?.[0] ?? "").toUpperCase()}
          </Text>
        </View>
        <View style={styles.guestInfo}>
          <Text style={styles.guestName}>{g.firstName} {g.lastName}</Text>
          {g.isOrganizer && <Text style={styles.organizerBadge}>{t(lang, "group.organizer")}</Text>}
        </View>
        <View style={[styles.rsvpBadge, { backgroundColor: rsvp.bg }]}>
          <Text style={[styles.rsvpText, { color: rsvp.text }]}>{t(lang, rsvpLabelKey)}</Text>
        </View>
      </View>
    );
  }, [lang]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t(lang, "group.tab.guests")}</Text>
        {guests && <Text style={styles.count}>{guests.length} {t(lang, "group.tab.guests").toLowerCase()}</Text>}
      </View>

      <FlatList
        data={guests ?? []}
        renderItem={renderGuest}
        keyExtractor={(g) => g.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={group.primary} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isLoading ? t(lang, "common.loading") : isError ? t(lang, "common.error") : t(lang, "common.noData")}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: group.text },
  count: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, marginTop: 2 },
  list: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  guestCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: group.card, borderRadius: radius.lg, borderWidth: 1, borderColor: group.cardBorder,
    padding: spacing.md, gap: spacing.md, ...shadow.sm,
  },
  guestAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(99,102,241,0.1)", alignItems: "center", justifyContent: "center",
  },
  guestInitials: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: group.primary },
  guestInfo: { flex: 1, gap: 2 },
  guestName: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: group.text },
  organizerBadge: { fontSize: fontSize.xs, fontFamily: "Inter_500Medium", color: group.primary },
  rsvpBadge: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  rsvpText: { fontSize: fontSize.xs, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, textAlign: "center", paddingVertical: spacing["3xl"] },
});
