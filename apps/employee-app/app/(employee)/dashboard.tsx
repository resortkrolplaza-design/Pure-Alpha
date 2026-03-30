// =============================================================================
// Employee App -- Dashboard (warm cream + hero shift card + clock button)
// =============================================================================

import { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, RefreshControl,
  StyleSheet, Animated, ActivityIndicator, Platform, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { emp, fontSize, radius, spacing, shadow, shiftColors, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useFadeIn, useSlideUp, useScalePress } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { employeeFetch, clockIn, clockOut } from "@/lib/employee-api";
import { checkBiometricAvailability, authenticateWithBiometric } from "@/lib/biometric";
import { isBiometricEnrolled, getCachedCredentials } from "@/lib/auth";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { DashboardData, ShiftData } from "@/lib/types";

function formatHours(num: number, lang: "pl" | "en"): string {
  const fixed = num.toFixed(1);
  return lang === "pl" ? fixed.replace(".", ",") : fixed;
}

function getGreetingKey(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "dash.greeting.morning";
  if (h >= 12 && h < 18) return "dash.greeting.afternoon";
  if (h >= 18 && h < 22) return "dash.greeting.evening";
  return "dash.greeting.night";
}

function DashboardScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const employeeName = useAppStore((s) => s.employeeName);
  const isClockedIn = useAppStore((s) => s.isClockedIn);
  const setClockedIn = useAppStore((s) => s.setClockedIn);
  const [refreshing, setRefreshing] = useState(false);
  const [biometricShield, setBiometricShield] = useState(false);
  const clockingRef = useRef(false);

  // Check if biometric is enrolled to show shield badge
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enrolled = await isBiometricEnrolled();
      if (cancelled) return;
      if (enrolled) {
        const bio = await checkBiometricAvailability();
        if (!cancelled) setBiometricShield(bio.available);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const queryClient = useQueryClient();
  const fadeStyle = useFadeIn();
  const slideStyle = useSlideUp(100);
  const clockPress = useScalePress(0.95);

  const locale = lang === "pl" ? "pl-PL" : "en-US";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["employee-dashboard"],
    queryFn: async () => {
      const res = await employeeFetch<DashboardData>("/dashboard");
      if (res.status !== "success") return null;
      if (res.data?.isClockedIn !== undefined) {
        setClockedIn(res.data.isClockedIn);
      }
      return res.data ?? null;
    },
  });

  const clockMutation = useMutation({
    mutationFn: async (action: "clock-in" | "clock-out") => {
      if (action === "clock-out") {
        return clockOut();
      }
      return clockIn();
    },
    onSuccess: (res) => {
      if (res.status === "success") {
        setClockedIn(!isClockedIn);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
      } else {
        Alert.alert(
          t(lang, "common.error"),
          res.errorMessage ?? t(lang, "common.error"),
        );
      }
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        t(lang, "common.error"),
        t(lang, "common.networkError"),
      );
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const doClock = useCallback(() => {
    clockMutation.mutate(isClockedIn ? "clock-out" : "clock-in");
  }, [clockMutation, isClockedIn]);

  const handleClock = useCallback(async () => {
    if (clockingRef.current) return;
    clockingRef.current = true;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Check if biometric is enrolled for this user
    const enrolled = await isBiometricEnrolled();
    if (!enrolled) {
      clockingRef.current = false;
      doClock();
      return;
    }

    // Check device capability
    const bio = await checkBiometricAvailability();
    if (!bio.available) {
      clockingRef.current = false;
      doClock();
      return;
    }

    // Attempt biometric verification
    const success = await authenticateWithBiometric(t(lang, "clock.biometricPrompt"));
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clockingRef.current = false;
      doClock();
      return;
    }

    // Biometric failed -- offer PIN fallback
    // NOTE: Alert.prompt/Alert.alert are non-blocking. clockingRef stays true
    // until user completes or cancels the alert (prevents double-tap during alert).
    if (Platform.OS === "ios") {
      Alert.prompt(
        t(lang, "clock.pinFallback"),
        undefined,
        async (enteredPin: string) => {
          clockingRef.current = false;
          const creds = await getCachedCredentials();
          if (creds && enteredPin === creds.pin) {
            doClock();
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert(t(lang, "common.error"), t(lang, "clock.pinWrong"));
          }
        },
        "secure-text",
        undefined,
        "number-pad",
      );
    } else {
      // Android: Alert.prompt not available -- offer retry
      Alert.alert(
        t(lang, "clock.pinFallback"),
        t(lang, "clock.biometricFailed"),
        [
          {
            text: t(lang, "common.cancel"),
            style: "cancel",
            onPress: () => { clockingRef.current = false; },
          },
          {
            text: t(lang, "common.retry"),
            onPress: () => {
              clockingRef.current = false;
              handleClock();
            },
          },
        ],
        { cancelable: false },
      );
    }
  }, [lang, doClock]);

  const shiftColor = data?.todayShift
    ? shiftColors[data.todayShift.shiftType] ?? emp.primary
    : emp.primary;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing["6xl"] },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={emp.primary} />
        }
      >
        {/* Greeting */}
        <Animated.View style={fadeStyle}>
          <Text style={styles.greeting}>
            {t(lang, getGreetingKey())}
            {employeeName ? `, ${employeeName}` : ""}
          </Text>
          <Text style={styles.subtitle}>{t(lang, "app.subtitle")}</Text>
        </Animated.View>

        {/* Error State */}
        {isError && (
          <View style={styles.card} accessibilityLiveRegion="polite">
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

        {/* Today's Shift -- hero card */}
        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={emp.primary} />
          </View>
        ) : (
          <Animated.View style={slideStyle}>
            <View style={styles.heroCard}>
              <LinearGradient
                colors={[shiftColor, `${shiftColor}CC`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroGradient}
              >
                <View style={styles.shiftHeader}>
                  <Text style={styles.heroLabel}>{t(lang, "dash.todayShift")}</Text>
                  {data?.todayShift && (
                    <View style={styles.shiftBadge}>
                      <Text style={styles.shiftBadgeText}>
                        {t(lang, `shift.${data.todayShift.shiftType}`)}
                      </Text>
                    </View>
                  )}
                </View>
                {data?.todayShift ? (
                  <View style={styles.shiftDetails}>
                    <Text style={styles.heroTime}>
                      {data.todayShift.startTime} -- {data.todayShift.endTime}
                    </Text>
                    <Text style={styles.heroDept}>{data.todayShift.department}</Text>
                  </View>
                ) : (
                  <Text style={styles.heroEmpty}>{t(lang, "dash.noShift")}</Text>
                )}
              </LinearGradient>
            </View>
          </Animated.View>
        )}

        {/* Clock In/Out Button */}
        <Animated.View style={clockPress.scaleStyle}>
          <Pressable
            style={[
              styles.clockButton,
              { backgroundColor: isClockedIn ? emp.danger : emp.success },
            ]}
            onPress={handleClock}
            onPressIn={clockPress.onPressIn}
            onPressOut={clockPress.onPressOut}
            disabled={clockMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={isClockedIn ? t(lang, "dash.clockOut") : t(lang, "dash.clockIn")}
          >
            {clockMutation.isPending ? (
              <ActivityIndicator size="small" color={emp.white} />
            ) : (
              <>
                <Icon
                  name={isClockedIn ? "stop-circle-outline" : "play-circle-outline"}
                  size={32}
                  color={emp.white}
                />
                <Text style={styles.clockText}>
                  {isClockedIn ? t(lang, "dash.clockOut") : t(lang, "dash.clockIn")}
                </Text>
              </>
            )}
            {biometricShield && (
              <View style={styles.shieldBadge} accessible accessibilityLabel={t(lang, "clock.biometricShield")}>
                <Icon name="shield-checkmark-outline" size={14} color={emp.white} />
              </View>
            )}
          </Pressable>
        </Animated.View>

        {/* Week Stats */}
        <View style={styles.statsRow}>
          <View
            style={styles.statCard}
            accessible={true}
            accessibilityLabel={`${formatHours(data?.weekStats.scheduledHours ?? 0, lang)} ${t(lang, "dash.hours")}`}
          >
            <Text style={styles.statValue}>
              {formatHours(data?.weekStats.scheduledHours ?? 0, lang)}h
            </Text>
            <Text style={styles.statLabel}>{t(lang, "dash.hours")}</Text>
          </View>
          <View
            style={styles.statCard}
            accessible={true}
            accessibilityLabel={`${data?.weekStats.completedShifts ?? 0}/${data?.weekStats.totalShifts ?? 0} ${t(lang, "dash.shifts")}`}
          >
            <Text style={styles.statValue}>
              {data?.weekStats.completedShifts ?? 0}/{data?.weekStats.totalShifts ?? 0}
            </Text>
            <Text style={styles.statLabel}>{t(lang, "dash.shifts")}</Text>
          </View>
        </View>

        {/* Upcoming Shifts */}
        <View>
          <Text style={styles.sectionTitle}>{t(lang, "dash.upcoming")}</Text>
          {!data?.upcomingShifts?.length ? (
            <View style={[styles.card, styles.emptyCard]}>
              <Icon name="calendar-outline" size={32} color={emp.textMuted} />
              <Text style={styles.placeholder}>{t(lang, "common.noData")}</Text>
            </View>
          ) : (
            data.upcomingShifts.map((shift) => (
              <ShiftRow key={shift.id} shift={shift} lang={lang} locale={locale} />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function ShiftRow({
  shift,
  lang,
  locale,
}: {
  shift: ShiftData;
  lang: "pl" | "en";
  locale: string;
}) {
  const color = shiftColors[shift.shiftType] ?? emp.primary;
  return (
    <View
      style={styles.upcomingCard}
      accessible={true}
      accessibilityLabel={`${new Date(shift.shiftDate).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}, ${shift.startTime} -- ${shift.endTime}`}
    >
      <View style={[styles.upcomingStripe, { backgroundColor: color }]} />
      <View style={styles.upcomingInfo}>
        <Text style={styles.upcomingDate}>
          {new Date(shift.shiftDate).toLocaleDateString(locale, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
        </Text>
        <Text style={styles.upcomingTime}>
          {shift.startTime} -- {shift.endTime}
        </Text>
      </View>
      <View style={[styles.upcomingBadge, { backgroundColor: `${color}1A` }]}>
        <Text style={[styles.upcomingType, { color }]}>
          {t(lang, `shift.${shift.shiftType}`)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: emp.bg,
  },
  scroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  greeting: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: emp.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  card: {
    backgroundColor: emp.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.sm,
  },

  // -- Hero Shift Card ----------------------------------------------------------
  heroCard: {
    borderRadius: radius.xl,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: emp.shadowDark,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  heroGradient: {
    padding: spacing.xl,
    gap: spacing.md,
    minHeight: 120,
  },
  shiftHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: emp.heroLabel,
    lineHeight: 18,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  shiftBadge: {
    backgroundColor: emp.heroBadgeBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  shiftBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: emp.white,
  },
  shiftDetails: {
    gap: 4,
  },
  heroTime: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: emp.white,
    letterSpacing: -0.3,
  },
  heroDept: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.heroDept,
    lineHeight: 18,
  },
  heroEmpty: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: emp.heroDept,
    lineHeight: 21,
  },
  placeholder: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.textMuted,
    lineHeight: 18,
  },

  // -- Clock Button -------------------------------------------------------------
  clockButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    borderRadius: radius["2xl"],
    paddingVertical: spacing.xl,
    minHeight: 72,
    ...Platform.select({
      ios: {
        shadowColor: emp.shadowBlack,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  clockText: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: emp.white,
    letterSpacing: -0.3,
  },
  shieldBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.md,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },

  // -- Stats --------------------------------------------------------------------
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: emp.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing.lg,
    alignItems: "center",
    gap: 4,
    ...shadow.sm,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: emp.primary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: emp.textSecondary,
  },

  // -- Upcoming Shifts ----------------------------------------------------------
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: emp.text,
    marginBottom: spacing.sm,
    lineHeight: 24,
  },
  upcomingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: emp.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    marginBottom: spacing.sm,
    minHeight: TOUCH_TARGET,
    overflow: "hidden",
    ...shadow.sm,
  },
  upcomingStripe: {
    width: 4,
    alignSelf: "stretch",
  },
  upcomingInfo: {
    flex: 1,
    gap: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  upcomingDate: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: emp.text,
    lineHeight: 18,
  },
  upcomingTime: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: emp.textSecondary,
  },
  upcomingBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    marginRight: spacing.md,
  },
  upcomingType: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
  },

  // -- Retry / Loading ----------------------------------------------------------
  retryBtn: {
    backgroundColor: emp.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignSelf: "center",
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  retryText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: emp.white,
  },
  loadingCard: {
    backgroundColor: emp.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing["3xl"],
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  emptyCard: {
    alignItems: "center",
  },
});

export default function DashboardScreen() {
  return (
    <ErrorBoundary>
      <DashboardScreenInner />
    </ErrorBoundary>
  );
}
