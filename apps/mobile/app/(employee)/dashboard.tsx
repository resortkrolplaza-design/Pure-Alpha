// =============================================================================
// Employee App -- Dashboard (Today's shift, week stats, upcoming shifts)
// =============================================================================

import { useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, Animated, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { employee, fontSize, radius, spacing, shadow, shiftColors } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useFadeIn, useSlideUp } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { employeeFetch } from "@/lib/employee-api";
import type { DashboardData, ShiftData } from "@/lib/types";

function getGreetingKey(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "stay.greeting.morning";
  if (h >= 12 && h < 18) return "stay.greeting.afternoon";
  if (h >= 18 && h < 22) return "stay.greeting.evening";
  return "stay.greeting.night";
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const employeeName = useAppStore((s) => s.employeeName);
  const [refreshing, setRefreshing] = useState(false);

  const fadeStyle = useFadeIn();
  const slideStyle = useSlideUp(100);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["employee-dashboard"],
    queryFn: async () => {
      const res = await employeeFetch<DashboardData>("/dashboard");
      if (res.status !== "success") return null;
      return res.data ?? null;
    },
  });

  const locale = lang === "pl" ? "pl-PL" : "en-US";

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <LinearGradient colors={[employee.bgFrom, employee.bgTo]} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing["6xl"] }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={employee.brand} />}
      >
        <Animated.View style={fadeStyle}>
          <Text style={styles.greeting}>
            {t(lang, getGreetingKey())}{employeeName ? `, ${employeeName}` : ""}
          </Text>
          <Text style={styles.subtitle}>Pure Alpha Employee App</Text>
        </Animated.View>

        {/* Error State */}
        {isError && (
          <View style={styles.card}>
            <Text style={styles.placeholder}>{t(lang, "common.error")}</Text>
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

        {/* Today's Shift */}
        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={employee.brand} />
          </View>
        ) : (
          <Animated.View style={[styles.card, styles.shiftCard, slideStyle]}>
            <View style={styles.shiftHeader}>
              <Text style={styles.shiftTitle}>{t(lang, "emp.todayShift")}</Text>
              {data?.todayShift && (
                <View style={[styles.shiftBadge, { backgroundColor: shiftColors[data.todayShift.shiftType] ?? employee.accent }]}>
                  <Text style={styles.shiftBadgeText}>{t(lang, `emp.shift.${data.todayShift.shiftType}`)}</Text>
                </View>
              )}
            </View>
            {data?.todayShift ? (
              <View style={styles.shiftDetails}>
                <Text style={styles.shiftTime}>
                  {data.todayShift.startTime} -- {data.todayShift.endTime}
                </Text>
                <Text style={styles.shiftDept}>{data.todayShift.department}</Text>
              </View>
            ) : (
              <Text style={styles.placeholder}>{t(lang, "emp.noShift")}</Text>
            )}
          </Animated.View>
        )}

        {/* Week Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{(data?.weekStats.scheduledHours ?? 0).toFixed(1)}h</Text>
            <Text style={styles.statLabel}>{t(lang, "emp.hours")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {data?.weekStats.completedShifts ?? 0}/{data?.weekStats.totalShifts ?? 0}
            </Text>
            <Text style={styles.statLabel}>{t(lang, "emp.shifts")}</Text>
          </View>
        </View>

        {/* Upcoming Shifts */}
        <View>
          <Text style={styles.sectionTitle}>{t(lang, "emp.upcoming")}</Text>
          {!data?.upcomingShifts?.length ? (
            <View style={[styles.card, styles.emptyCard]}>
              <Icon name="calendar-outline" size={32} color={employee.textMuted} />
              <Text style={styles.placeholder}>{t(lang, "common.noData")}</Text>
            </View>
          ) : (
            data.upcomingShifts.map((shift) => (
              <ShiftRow key={shift.id} shift={shift} lang={lang} locale={locale} />
            ))
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function ShiftRow({ shift, lang, locale }: { shift: ShiftData; lang: "pl" | "en"; locale: string }) {
  const color = shiftColors[shift.shiftType] ?? employee.accent;
  return (
    <View style={styles.upcomingCard}>
      <View style={[styles.upcomingDot, { backgroundColor: color }]} />
      <View style={styles.upcomingInfo}>
        <Text style={styles.upcomingDate}>
          {new Date(shift.shiftDate).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
        </Text>
        <Text style={styles.upcomingTime}>{shift.startTime} -- {shift.endTime}</Text>
      </View>
      <Text style={styles.upcomingType}>{t(lang, `emp.shift.${shift.shiftType}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  greeting: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: employee.text, letterSpacing: -0.3 },
  subtitle: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textSecondary, marginTop: 2, lineHeight: 18 },
  card: {
    backgroundColor: employee.card, borderRadius: radius.xl, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing.xl, gap: spacing.md, ...shadow.sm,
  },
  shiftCard: { borderLeftWidth: 4, borderLeftColor: employee.brand },
  shiftHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  shiftTitle: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: employee.text, lineHeight: 24 },
  shiftBadge: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 2 },
  shiftBadgeText: { fontSize: fontSize.xs, fontFamily: "Inter_600SemiBold", color: employee.text },
  shiftDetails: { gap: 4 },
  shiftTime: { fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: employee.brand },
  shiftDept: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textSecondary, lineHeight: 18 },
  placeholder: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textMuted, lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: spacing.md },
  statCard: {
    flex: 1, backgroundColor: employee.card, borderRadius: radius.lg, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing.lg, alignItems: "center", gap: 4, ...shadow.sm,
  },
  statValue: { fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: employee.brand },
  statLabel: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: employee.textSecondary },
  sectionTitle: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: employee.text, marginBottom: spacing.sm, lineHeight: 24 },
  upcomingCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: employee.card, borderRadius: radius.md, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing.md, marginBottom: spacing.sm, gap: spacing.md, ...shadow.sm,
  },
  upcomingDot: { width: 8, height: 8, borderRadius: 4 },
  upcomingInfo: { flex: 1, gap: 2 },
  upcomingDate: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: employee.text, lineHeight: 18 },
  upcomingTime: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: employee.textSecondary },
  upcomingType: { fontSize: fontSize.xs, fontFamily: "Inter_600SemiBold", color: employee.textMuted },
  retryBtn: {
    backgroundColor: employee.accent, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignSelf: "center",
    minHeight: 44, justifyContent: "center",
  },
  retryText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: employee.brand },
  loadingCard: {
    backgroundColor: employee.card, borderRadius: radius.xl, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing["3xl"], alignItems: "center", justifyContent: "center", ...shadow.sm,
  },
  emptyCard: { alignItems: "center" },
});
