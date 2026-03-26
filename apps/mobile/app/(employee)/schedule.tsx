// =============================================================================
// Employee App — Schedule (Week view with day navigation)
// =============================================================================

import { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { employee, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { employeeFetch } from "@/lib/employee-api";
import type { ShiftData } from "@/lib/types";

const DAY_LABELS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Ndz"];

const SHIFT_COLORS: Record<string, string> = {
  MORNING: "#fbbf24",
  AFTERNOON: "#60a5fa",
  NIGHT: "#818cf8",
  DAY: "#34d399",
  SPLIT: "#a78bfa",
  REST_DAY: "#e7e5e4",
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const now = new Date();
    const ws = getWeekStart(now);
    ws.setDate(ws.getDate() + weekOffset * 7);
    return ws;
  }, [weekOffset]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return { date: d, dateStr: formatDate(d), dayLabel: DAY_LABELS[i], isToday: formatDate(d) === formatDate(new Date()) };
    });
  }, [weekStart]);

  const startDate = weekDays[0].dateStr;
  const endDate = weekDays[6].dateStr;

  const { data: shifts } = useQuery({
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

  const handlePrev = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWeekOffset((o) => o - 1);
  };

  const handleNext = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWeekOffset((o) => o + 1);
  };

  return (
    <LinearGradient colors={[employee.bgFrom, employee.bgTo]} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.title}>{t(lang, "emp.tab.schedule")}</Text>
        </Animated.View>

        {/* Week Navigation */}
        <View style={styles.weekNav}>
          <Pressable onPress={handlePrev} style={styles.navBtn} accessibilityLabel="Poprzedni tydzień">
            <Text style={styles.navBtnText}>‹</Text>
          </Pressable>
          <Text style={styles.weekLabel}>
            {weekDays[0].date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
            {" — "}
            {weekDays[6].date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
          </Text>
          <Pressable onPress={handleNext} style={styles.navBtn} accessibilityLabel="Następny tydzień">
            <Text style={styles.navBtnText}>›</Text>
          </Pressable>
        </View>

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
                    <View style={[styles.shiftDot, { backgroundColor: SHIFT_COLORS[ownShift.shiftType] ?? "#a8a29e" }]} />
                    <Text style={styles.shiftTime}>{ownShift.startTime}–{ownShift.endTime}</Text>
                  </View>
                ) : (
                  <Text style={styles.noShift}>—</Text>
                )}
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.dayList}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.lg },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: employee.text },
  weekNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  navBtnText: { fontSize: 28, color: employee.brand, fontFamily: "Inter_500Medium" },
  weekLabel: { fontSize: fontSize.base, fontFamily: "Inter_600SemiBold", color: employee.text },
  dayList: { gap: spacing.sm },
  dayCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: employee.card, borderRadius: radius.md, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing.lg, ...shadow.sm,
  },
  dayCardToday: { borderLeftWidth: 3, borderLeftColor: employee.brand },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, width: 80 },
  dayLabel: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: employee.textSecondary, width: 30 },
  dayLabelToday: { color: employee.brand, fontFamily: "Inter_700Bold" },
  dayDate: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: employee.text },
  dayDateToday: { color: employee.brand },
  shiftInfo: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  shiftDot: { width: 8, height: 8, borderRadius: 4 },
  shiftTime: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: employee.text },
  noShift: { fontSize: fontSize.base, color: employee.textMuted },
});
