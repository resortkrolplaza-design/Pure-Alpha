// =============================================================================
// Group Portal — Guests Tab (Guest list + RSVP status)
// World-class redesign: Airbnb + Apple HIG
// =============================================================================

import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  TextInput,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  group,
  fontSize,
  radius,
  spacing,
  shadow,
  rsvpColors,
  letterSpacing,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useScalePress, useSlideUp } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { GroupGuestData } from "@/lib/types";
import { useCallback, useMemo, useState } from "react";

// -- Avatar gradient presets ------------------------------------------------

const AVATAR_GRADIENTS = [
  ["#6366f1", "#818cf8"], // indigo
  ["#8b5cf6", "#a78bfa"], // violet
  ["#ec4899", "#f472b6"], // pink
  ["#14b8a6", "#2dd4bf"], // teal
  ["#f59e0b", "#fbbf24"], // amber
] as const;

function getAvatarGradient(name: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

// -- RSVP label keys -------------------------------------------------------

const RSVP_LABEL_KEYS: Record<string, string> = {
  confirmed: "group.rsvp.confirmed",
  declined: "group.rsvp.declined",
  pending: "group.rsvp.pending",
};

// -- Guest Card (Airbnb-style) ----------------------------------------------

function GuestCard({
  guest,
  lang,
}: {
  guest: GroupGuestData;
  lang: "pl" | "en";
}) {
  const { scaleStyle, onPressIn, onPressOut } = useScalePress(0.98);
  const rsvp = rsvpColors[guest.rsvpStatus] ?? rsvpColors.pending;
  const rsvpLabelKey =
    RSVP_LABEL_KEYS[guest.rsvpStatus] ?? RSVP_LABEL_KEYS.pending;
  const fullName = `${guest.firstName} ${guest.lastName}`;
  const initials = `${(guest.firstName?.[0] ?? "").toUpperCase()}${(guest.lastName?.[0] ?? "").toUpperCase()}`;
  const [gradientStart] = getAvatarGradient(fullName);

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityLabel={`${fullName}, ${t(lang, rsvpLabelKey)}`}
    >
      <Animated.View style={[styles.guestCard, scaleStyle]}>
        <View style={[styles.guestAvatar, { backgroundColor: gradientStart }]}>
          <Text style={styles.guestInitials}>{initials}</Text>
        </View>
        <View style={styles.guestInfo}>
          <Text style={styles.guestName} numberOfLines={1}>
            {fullName}
          </Text>
          {guest.email ? (
            <Text style={styles.guestEmail} numberOfLines={1}>
              {guest.email}
            </Text>
          ) : guest.isOrganizer ? (
            <Text style={styles.organizerBadge}>
              {t(lang, "group.organizer")}
            </Text>
          ) : null}
        </View>
        <View style={[styles.rsvpBadge, { backgroundColor: rsvp.bg }]}>
          <Text style={[styles.rsvpText, { color: rsvp.text }]}>
            {t(lang, rsvpLabelKey)}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// -- Main Screen ------------------------------------------------------------

export default function GuestsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const [searchQuery, setSearchQuery] = useState("");

  const headerSlide = useSlideUp(0, 12);

  const {
    data: guests,
    isLoading,
    isError,
    refetch,
  } = useQuery({
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

  // -- Filtered guests by search --
  const filteredGuests = useMemo(() => {
    if (!guests?.length) return [];
    if (!searchQuery.trim()) return guests;
    const q = searchQuery.toLowerCase().trim();
    return guests.filter(
      (g) =>
        g.firstName.toLowerCase().includes(q) ||
        g.lastName.toLowerCase().includes(q) ||
        (g.email && g.email.toLowerCase().includes(q)),
    );
  }, [guests, searchQuery]);

  // -- RSVP summary counts --
  const rsvpCounts = useMemo(() => {
    if (!guests?.length) return { confirmed: 0, pending: 0, declined: 0 };
    return {
      confirmed: guests.filter((g) => g.rsvpStatus === "confirmed").length,
      pending: guests.filter((g) => g.rsvpStatus === "pending").length,
      declined: guests.filter((g) => g.rsvpStatus === "declined").length,
    };
  }, [guests]);

  const renderGuest = useCallback(
    ({ item: g }: { item: GroupGuestData }) => (
      <GuestCard guest={g} lang={lang} />
    ),
    [lang],
  );

  const totalCount = guests?.length ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <Animated.View style={[styles.headerContainer, headerSlide]}>
        {/* ── Title + Count ── */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {t(lang, "group.tab.guests")}
          </Text>
          {totalCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{totalCount}</Text>
            </View>
          )}
        </View>

        {/* ── RSVP Summary Bar ── */}
        {totalCount > 0 && (
          <View style={styles.rsvpSummary}>
            <View style={styles.rsvpSummaryItem}>
              <Text
                style={[
                  styles.rsvpSummaryCount,
                  { color: rsvpColors.confirmed.text },
                ]}
              >
                {rsvpCounts.confirmed}
              </Text>
              <Text style={styles.rsvpSummaryLabel}>
                {t(lang, "group.confirmed")}
              </Text>
            </View>
            <View style={styles.rsvpSummaryDivider} />
            <View style={styles.rsvpSummaryItem}>
              <Text
                style={[
                  styles.rsvpSummaryCount,
                  { color: rsvpColors.pending.text },
                ]}
              >
                {rsvpCounts.pending}
              </Text>
              <Text style={styles.rsvpSummaryLabel}>
                {t(lang, "group.pending")}
              </Text>
            </View>
            <View style={styles.rsvpSummaryDivider} />
            <View style={styles.rsvpSummaryItem}>
              <Text
                style={[
                  styles.rsvpSummaryCount,
                  { color: rsvpColors.declined.text },
                ]}
              >
                {rsvpCounts.declined}
              </Text>
              <Text style={styles.rsvpSummaryLabel}>
                {t(lang, "group.declined")}
              </Text>
            </View>
          </View>
        )}

        {/* ── Search Bar ── */}
        {totalCount > 0 && (
          <View style={styles.searchContainer}>
            <Icon name="search-outline" size={18} color={group.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={t(lang, "group.searchGuest")}
              placeholderTextColor={group.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t(lang, "group.searchGuest")}
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => setSearchQuery("")}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "common.close")}
                style={styles.clearBtn}
              >
                <Icon
                  name="close-circle"
                  size={18}
                  color={group.textMuted}
                />
              </Pressable>
            )}
          </View>
        )}
      </Animated.View>

      <FlatList
        data={filteredGuests}
        renderItem={renderGuest}
        keyExtractor={(g) => g.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={group.primary}
          />
        }
        ListEmptyComponent={
          isError ? (
            <View style={styles.emptyContainer}>
              <Icon
                name="alert-circle-outline"
                size={36}
                color={group.textMuted}
              />
              <Text style={styles.emptyText}>{t(lang, "common.error")}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => refetch()}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "common.retry")}
              >
                <Text style={styles.retryBtnText}>
                  {t(lang, "common.retry")}
                </Text>
              </Pressable>
            </View>
          ) : isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {t(lang, "common.loading")}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Icon
                name="people-outline"
                size={48}
                color={group.textMuted}
              />
              <Text style={styles.emptyTitle}>
                {t(lang, "group.noGuests")}
              </Text>
            </View>
          )
        }
      />
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

  // ── Header ──
  headerContainer: {
    paddingHorizontal: spacing["2xl"],
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
  },
  countBadge: {
    backgroundColor: group.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    minWidth: 28,
    alignItems: "center",
  },
  countBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },

  // ── RSVP Summary ──
  rsvpSummary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.sm,
  },
  rsvpSummaryItem: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xxs,
  },
  rsvpSummaryCount: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
  },
  rsvpSummaryLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },
  rsvpSummaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: group.cardBorder,
  },

  // ── Search ──
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.inputBg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    paddingVertical: 0,
    height: 44,
  },
  clearBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── List ──
  list: {
    paddingHorizontal: spacing["2xl"],
    gap: spacing.sm,
  },

  // ── Guest Card ──
  guestCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  guestAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  guestInitials: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
  guestInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  guestName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.text,
    lineHeight: 21,
  },
  guestEmail: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    lineHeight: 16,
  },
  organizerBadge: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.primary,
  },
  rsvpBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  rsvpText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Empty State ──
  emptyContainer: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing["5xl"],
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
    textAlign: "center",
  },

  // ── Retry ──
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
});
