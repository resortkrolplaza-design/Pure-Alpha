// =============================================================================
// Group Portal — Full Agenda Screen (all items grouped by date)
// Opened from quick action on overview dashboard. Hidden tab (href: null).
// Data from shared react-query cache ["portal-init", trackingId].
// =============================================================================

import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  UIManager,
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
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchPortalInit } from "@/lib/group-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { AgendaItemData } from "@/lib/types";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// =============================================================================
// Helpers
// =============================================================================

/** Color map per agenda category (left border accent). Fallback: indigo primary. */
const CATEGORY_COLORS: Record<string, string> = {
  ceremony: "#6366f1",
  dinner: "#f97316",
  party: "#ec4899",
  workshop: "#10b981",
  meeting: "#3b82f6",
  break: "#64748b",
  transport: "#d97706",
  activity: "#8b5cf6",
  registration: "#0ea5e9",
};

function categoryColor(category: string | null): string {
  if (!category) return group.primary;
  return CATEGORY_COLORS[category.toLowerCase()] ?? group.primary;
}

/** Format date string to localized label like "25 marca" / "March 25" */
function formatDateHeader(dateStr: string, lang: "pl" | "en"): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", {
    day: "numeric",
    month: "long",
  });
}

/** Format time range "09:00 - 10:30" or single time */
function formatTimeRange(
  start: string | null,
  end: string | null,
): string {
  if (!start) return "\u2014";
  if (!end) return start;
  return `${start} - ${end}`;
}

/** Group agenda items by date, preserving chronological order */
function groupByDate(
  items: AgendaItemData[],
): Array<{ date: string; items: AgendaItemData[] }> {
  const map = new Map<string, AgendaItemData[]>();
  const order: string[] = [];

  for (const item of items) {
    const key = item.date;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }

  return order.map((date) => ({ date, items: map.get(date)! }));
}

// =============================================================================
// Sub-components
// =============================================================================

function AgendaCard({
  item,
  lang,
}: {
  item: AgendaItemData;
  lang: "pl" | "en";
}) {
  const borderColor = categoryColor(item.category);

  return (
    <View
      style={[styles.card, { borderLeftColor: borderColor }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${item.title}, ${formatTimeRange(item.startTime, item.endTime)}`}
    >
      {/* Time + Category row */}
      <View style={styles.cardTopRow}>
        <View style={styles.timePill}>
          <Icon name="time-outline" size={12} color={group.primary} />
          <Text style={styles.timeText}>
            {formatTimeRange(item.startTime, item.endTime)}
          </Text>
        </View>
        {item.category && (
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: `${borderColor}18` },
            ]}
          >
            <Text style={[styles.categoryText, { color: borderColor }]}>
              {item.category}
            </Text>
          </View>
        )}
      </View>

      {/* Title */}
      <Text style={styles.cardTitle}>{item.title}</Text>

      {/* Location */}
      {item.location && (
        <View style={styles.locationRow}>
          <Icon name="location-outline" size={13} color={group.textMuted} />
          <Text style={styles.locationText}>{item.location}</Text>
        </View>
      )}

      {/* Description */}
      {item.description && (
        <Text style={styles.descriptionText}>{item.description}</Text>
      )}

      {/* Add to calendar placeholder */}
      <Pressable
        style={styles.calendarBtn}
        accessibilityRole="button"
        accessibilityLabel={t(lang, "group.agenda.addToCalendar")}
        onPress={() => {
          // Placeholder -- calendar integration not yet implemented
        }}
      >
        <Icon name="calendar-outline" size={14} color={group.primary} />
        <Text style={styles.calendarBtnText}>
          {t(lang, "group.agenda.addToCalendar")}
        </Text>
      </Pressable>
    </View>
  );
}

// =============================================================================
// Main Screen
// =============================================================================

function AgendaScreenContent() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";

  const { data: initData } = useQuery({
    queryKey: ["portal-init", trackingId],
    queryFn: async () => {
      if (!trackingId) return null;
      const res = await fetchPortalInit(trackingId);
      return res.status === "success" ? res.data : null;
    },
    enabled: !!trackingId,
    staleTime: 60_000,
  });

  const agendaItems = initData?.agendaItems ?? [];

  const grouped = useMemo(() => groupByDate(agendaItems), [agendaItems]);

  const hasItems = agendaItems.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBack}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "common.back")}
        >
          <Icon name="chevron-back" size={20} color={group.primary} />
        </Pressable>
        <Text style={styles.title}>
          {t(lang, "group.agenda.title")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {!hasItems ? (
          /* Empty state */
          <View style={styles.emptyState}>
            <Icon
              name="calendar-outline"
              size={48}
              color={group.textMuted}
            />
            <Text style={styles.emptyText}>
              {t(lang, "group.noAgenda")}
            </Text>
          </View>
        ) : (
          /* Grouped agenda items */
          grouped.map((section) => (
            <View key={section.date} style={styles.dateSection}>
              <View style={styles.dateHeaderRow}>
                <View style={styles.dateDot} />
                <Text style={styles.dateHeaderText}>
                  {formatDateHeader(section.date, lang)}
                </Text>
              </View>
              {section.items.map((item) => (
                <AgendaCard key={item.id} item={item} lang={lang} />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

export default function AgendaScreen() {
  const lang = useAppStore((s) => s.lang);
  return (
    <ErrorBoundary lang={lang}>
      <AgendaScreenContent />
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
  },

  // ── Date Section ──
  dateSection: {
    marginBottom: spacing.xl,
  },
  dateHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: group.primary,
  },
  dateHeaderText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },

  // ── Agenda Card ──
  card: {
    backgroundColor: group.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    borderLeftWidth: 4,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: group.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  timeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },
  categoryBadge: {
    borderRadius: radius.sm,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
  categoryText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    lineHeight: 21,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  locationText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },
  descriptionText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    lineHeight: 20,
  },
  calendarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: group.primaryLight,
    marginTop: spacing.xs,
    minHeight: 32,
  },
  calendarBtnText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.primary,
  },

  // ── Empty State ──
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: spacing["6xl"],
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
    textAlign: "center",
  },
});
