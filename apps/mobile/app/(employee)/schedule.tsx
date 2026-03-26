// =============================================================================
// Employee App -- Schedule (Week view with day navigation)
// =============================================================================

import { useState, useMemo } from "react";
import { View, Text, Pressable, FlatList, RefreshControl, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { employee, fontSize, radius, spacing, shadow, shiftColors } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { employeeFetch } from "@/lib/employee-api";
import type { ShiftData } from "@/lib/types";

const DAY_LABEL_KEYS = [
  "emp.day.mon", "emp.day.tue", "emp.day.wed", "emp.day.thu",
  "emp.day.fri", "emp.day.sat", "emp.day.sun",
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

export default function ScheduleScreen() {
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
      return { date: d, dateStr: formatDate(d), dayLabel: dayLabels[i], isToday: formatDate(d) === formatDate(new Date()) };
    });
  }, [weekStart, dayLabels]);

  const startDate = weekDays[0].dateStr;
  const endDate = weekDays[6].dateStr;

  const { data: shifts, isError, refetch } = useQuery({
    queryKey: ["employee-shifts", startDate, endDate],
    queryFn: async () => {
      const res = await employeeFetch<ShiftData[]>(`/shifts?startDate=${startDate}&endDate=${endDate}`);
      return res.data ?? [];
    },
  });

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ShiftData[]>();
    for (const s of shifts ?? []) {
      const existing = map.get(s.shiftDate) ?? [];
      existing.push(s);
      map.set(s.shiftDate, existing);
    }
    return map;
  }, [shifts]);

  // Check if the entire week has no shifts at all
  const hasAnyShifts = weekDays.some((day) => {
    const dayShifts = shiftsByDate.get(day.dateStr) ?? [];
    return dayShifts.some((s) => s.isOwnShift);
  });

  const handlePrev = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWeekOffset((o) => o - 1);
  };

  const handleNext = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWeekOffset((o) => o + 1);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <LinearGradient colors={[employee.bgFrom, employee.bgTo]} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}>
        {/* Header */}
        <View>
          <Text style={styles.title}>{t(lang, "emp.tab.schedule")}</Text>
        </View>

        {/* Week Navigation */}
        <View style={styles.weekNav}>
          <Pressable onPress={handlePrev} style={styles.navBtn} accessibilityLabel={t(lang, "emp.prevWeek")}>
            <Icon name="chevron-back" size={24} color={employee.text} />
          </Pressable>
          <Text style={styles.weekLabel}>
            {weekDays[0].date.toLocaleDateString(locale, { day: "numeric", month: "short" })}
            {" -- "}
            {weekDays[6].date.toLocaleDateString(locale, { day: "numeric", month: "short" })}
          </Text>
          <Pressable onPress={handleNext} style={styles.navBtn} accessibilityLabel={t(lang, "emp.nextWeek")}>
            <Icon name="chevron-forward" size={24} color={employee.text} />
          </Pressable>
        </View>

        {/* Error State */}
        {isError && (
          <View style={styles.errorCard}>
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

        {/* No shifts this week message */}
        {!isError && !hasAnyShifts && shifts !== undefined && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t(lang, "emp.noShiftsThisWeek")}</Text>
          </View>
        )}

        {/* Day Cards */}
        <FlatList
          data={weekDays}
          keyExtractor={(d) => d.dateStr}
          renderItem={({ item: day }) => {
            const dayShifts = shiftsByDate.get(day.dateStr) ?? [];
            const ownShift = dayShifts.find((s) => s.isOwnShift);
            return (
              <View style={[styles.dayCard, day.isToday && styles.dayCardToday]}>
                <View style={styles.dayHeader}>
                  <Text style={[styles.dayLabel, day.isToday && styles.dayLabelToday]}>{day.dayLabel}</Text>
                  <Text style={[styles.dayDate, day.isToday && styles.dayDateToday]}>
                    {day.date.getDate()}
                  </Text>
                </View>
                {ownShift ? (
                  <View style={styles.shiftInfo}>
                    <View style={[styles.shiftDot, { backgroundColor: shiftColors[ownShift.shiftType] ?? "#a8a29e" }]} />
                    <Text style={styles.shiftTime}>{ownShift.startTime}--{ownShift.endTime}</Text>
                    <Text style={styles.shiftTypeLabel}>{t(lang, `emp.shift.${ownShift.shiftType}`)}</Text>
                  </View>
                ) : (
                  <Text style={styles.noShift}>--</Text>
                )}
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.dayList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={employee.brand} />}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.lg },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: employee.text, letterSpacing: -0.3 },
  weekNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  weekLabel: { fontSize: fontSize.base, fontFamily: "Inter_600SemiBold", color: employee.text, lineHeight: 21 },
  dayList: { gap: spacing.sm },
  dayCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: employee.card, borderRadius: radius.md, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing.lg, ...shadow.sm,
  },
  dayCardToday: { borderLeftWidth: 3, borderLeftColor: employee.brand },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, width: 80 },
  dayLabel: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: employee.textSecondary, width: 30, lineHeight: 18 },
  dayLabelToday: { color: employee.brand, fontFamily: "Inter_700Bold" },
  dayDate: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: employee.text, lineHeight: 24 },
  dayDateToday: { color: employee.brand },
  shiftInfo: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  shiftDot: { width: 8, height: 8, borderRadius: 4 },
  shiftTime: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: employee.text, lineHeight: 21 },
  shiftTypeLabel: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: employee.textMuted },
  noShift: { fontSize: fontSize.base, color: employee.textMuted, lineHeight: 21 },
  errorCard: {
    backgroundColor: employee.card, borderRadius: radius.md, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing.lg, alignItems: "center", gap: spacing.sm, ...shadow.sm,
  },
  errorText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textMuted, lineHeight: 18 },
  retryBtn: {
    backgroundColor: employee.accent, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  retryText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: employee.brand },
  emptyCard: {
    backgroundColor: employee.card, borderRadius: radius.md, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing.lg, alignItems: "center", ...shadow.sm,
  },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textMuted, lineHeight: 18 },
});
