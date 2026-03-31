// =============================================================================
// Employee App -- Schedule (warm cream + week view + border-left shift color)
// =============================================================================

import { useState, useMemo, useCallback } from "react";
import {
  View, Text, Pressable, FlatList, RefreshControl,
  StyleSheet, ActivityIndicator, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { emp, fontSize, letterSpacing, radius, spacing, shadow, shiftColors, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { employeeFetch } from "@/lib/employee-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { ShiftData } from "@/lib/types";

const DAY_LABEL_KEYS = [
  "sched.day.mon", "sched.day.tue", "sched.day.wed", "sched.day.thu",
  "sched.day.fri", "sched.day.sat", "sched.day.sun",
];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Use local date parts instead of toISOString (which uses UTC and can shift dates)
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ScheduleScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const [weekOffset, setWeekOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const locale = lang === "pl" ? "pl-PL" : "en-US";

  const weekStart = useMemo(() => {
    const now = new Date();
    const ws = getWeekStart(now);
    ws.setDate(ws.getDate() + weekOffset * 7);
    return ws;
  }, [weekOffset]);

  const dayLabels = useMemo(() => DAY_LABEL_KEYS.map((k) => t(lang, k)), [lang]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return {
        date: d,
        dateStr: formatDate(d),
        dayLabel: dayLabels[i],
        isToday: formatDate(d) === formatDate(new Date()),
      };
    });
  }, [weekStart, dayLabels]);

  const startDate = weekDays[0].dateStr;
  const endDate = weekDays[6].dateStr;

  const { data: shifts, isError, refetch } = useQuery({
    queryKey: ["employee-shifts", startDate, endDate],
    queryFn: async () => {
      const res = await employeeFetch<ShiftData[]>(
        `/shifts?startDate=${startDate}&endDate=${endDate}`,
      );
      return res.data ?? [];
    },
  });

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ShiftData[]>();
    const safeShifts = Array.isArray(shifts) ? shifts : [];
    for (const s of safeShifts) {
      const existing = map.get(s.shiftDate) ?? [];
      existing.push(s);
      map.set(s.shiftDate, existing);
    }
    return map;
  }, [shifts]);

  const hasAnyShifts = weekDays.some((day) => {
    const dayShifts = shiftsByDate.get(day.dateStr) ?? [];
    return dayShifts.some((s) => s.isOwnShift);
  });

  const handlePrev = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWeekOffset((o) => o - 1);
  }, []);

  const handleNext = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWeekOffset((o) => o + 1);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing["6xl"],
          },
        ]}
      >
        {/* Header */}
        <Text style={styles.title}>{t(lang, "sched.title")}</Text>

        {/* Week Navigation */}
        <View style={styles.weekNav}>
          <Pressable
            onPress={handlePrev}
            style={styles.navBtn}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "sched.prevWeek")}
          >
            <View style={styles.navBtnCircle}>
              <Icon name="chevron-back" size={20} color={emp.text} />
            </View>
          </Pressable>
          <Text style={styles.weekLabel}>
            {weekDays[0].date.toLocaleDateString(locale, { day: "numeric", month: "short" })}
            {" -- "}
            {weekDays[6].date.toLocaleDateString(locale, { day: "numeric", month: "short" })}
          </Text>
          <Pressable
            onPress={handleNext}
            style={styles.navBtn}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "sched.nextWeek")}
          >
            <View style={styles.navBtnCircle}>
              <Icon name="chevron-forward" size={20} color={emp.text} />
            </View>
          </Pressable>
        </View>

        {/* Error State */}
        {isError && (
          <View style={styles.errorCard} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{t(lang, "common.error")}</Text>
            <Pressable
              onPress={() => refetch()}
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.retry")}
            >
              <Text style={styles.retryText}>{t(lang, "common.retry")}</Text>
            </Pressable>
          </View>
        )}

        {/* No shifts this week */}
        {!isError && !hasAnyShifts && shifts !== undefined && (
          <View style={styles.emptyCard}>
            <Icon name="calendar-outline" size={32} color={emp.textMuted} />
            <Text style={styles.emptyText}>{t(lang, "sched.noShiftsThisWeek")}</Text>
          </View>
        )}

        {/* Day Cards */}
        {shifts === undefined ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={emp.primary} />
          </View>
        ) : (
          <FlatList
            data={weekDays}
            keyExtractor={(d) => d.dateStr}
            renderItem={({ item: day }) => {
              const dayShifts = shiftsByDate.get(day.dateStr) ?? [];
              const ownShifts = dayShifts.filter((s) => s.isOwnShift);
              const firstShift = ownShifts[0];
              const shiftLabel = firstShift
                ? ownShifts.map((s) => `${t(lang, `shift.${s.shiftType}`)} ${s.startTime}--${s.endTime}`).join(", ")
                : t(lang, "dash.noShift");
              const accessLabel = `${day.dayLabel} ${day.date.getDate()}, ${shiftLabel}`;
              const borderColor = firstShift
                ? shiftColors[firstShift.shiftType] ?? shiftColors.CUSTOM
                : "transparent";
              return (
                <View
                  style={[
                    styles.dayCard,
                    day.isToday && styles.dayCardToday,
                    { borderLeftColor: borderColor, borderLeftWidth: firstShift ? 4 : 0 },
                  ]}
                  accessible={true}
                  accessibilityLabel={accessLabel}
                >
                  <View style={styles.dayHeader}>
                    <Text style={[styles.dayLabel, day.isToday && styles.dayLabelToday]}>
                      {day.dayLabel}
                    </Text>
                    <Text style={[styles.dayDate, day.isToday && styles.dayDateToday]}>
                      {day.date.getDate()}
                    </Text>
                  </View>
                  {ownShifts.length > 0 ? (
                    <View style={styles.shiftsColumn}>
                      {ownShifts.map((ownShift) => (
                        <View key={ownShift.id} style={styles.shiftInfo}>
                          <Text style={styles.shiftTime}>
                            {ownShift.startTime}--{ownShift.endTime}
                          </Text>
                          <View
                            style={[
                              styles.shiftTypeBadge,
                              {
                                backgroundColor: `${shiftColors[ownShift.shiftType] ?? shiftColors.CUSTOM}1A`,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.shiftTypeLabel,
                                { color: shiftColors[ownShift.shiftType] ?? shiftColors.CUSTOM },
                              ]}
                            >
                              {t(lang, `shift.${ownShift.shiftType}`)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noShift}>--</Text>
                  )}
                </View>
              );
            }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.dayList}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={emp.primary} />
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: emp.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: emp.text,
    letterSpacing: letterSpacing.tight,
  },

  // -- Week Nav -----------------------------------------------------------------
  weekNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  navBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: emp.surface,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  weekLabel: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: emp.text,
    lineHeight: 21,
  },

  // -- Day Cards ----------------------------------------------------------------
  dayList: {
    gap: spacing.sm,
  },
  dayCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: emp.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing.lg,
    minHeight: TOUCH_TARGET,
    overflow: "hidden",
    ...shadow.sm,
  },
  dayCardToday: {
    backgroundColor: emp.white,
    borderColor: emp.primary,
    ...Platform.select({
      ios: {
        shadowColor: emp.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    width: 80,
  },
  dayLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: emp.textSecondary,
    width: 30,
    lineHeight: 18,
  },
  dayLabelToday: {
    color: emp.primary,
    fontFamily: "Inter_700Bold",
  },
  dayDate: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: emp.text,
    lineHeight: 24,
  },
  dayDateToday: {
    color: emp.primary,
  },
  shiftsColumn: {
    gap: spacing.xs,
  },
  shiftInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  shiftTime: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: emp.text,
    lineHeight: 21,
  },
  shiftTypeBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  shiftTypeLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
  },
  noShift: {
    fontSize: fontSize.base,
    color: emp.textMuted,
    lineHeight: 21,
  },

  // -- Error / Loading ----------------------------------------------------------
  errorCard: {
    backgroundColor: emp.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
    ...shadow.sm,
  },
  errorText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.textMuted,
    lineHeight: 18,
  },
  retryBtn: {
    backgroundColor: emp.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  retryText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: emp.white,
  },
  loadingOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing["4xl"],
  },
  emptyCard: {
    backgroundColor: emp.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing["3xl"],
    alignItems: "center",
    gap: spacing.md,
    ...shadow.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.textMuted,
    lineHeight: 18,
  },
});

export default function ScheduleScreen() {
  return (
    <ErrorBoundary>
      <ScheduleScreenInner />
    </ErrorBoundary>
  );
}
