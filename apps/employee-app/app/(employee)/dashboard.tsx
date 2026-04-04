// =============================================================================
// Employee App -- Dashboard (warm cream + hero shift card + clock button)
// =============================================================================

import { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, RefreshControl, TextInput,
  StyleSheet, Animated, ActivityIndicator, Platform, Alert, Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { emp, fontSize, letterSpacing, radius, spacing, shadow, shiftColors, TOUCH_TARGET, PIN_LENGTH } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useFadeIn, useSlideUp, useScalePress } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { employeeFetch, clockIn, clockOut } from "@/lib/employee-api";
import { checkBiometricAvailability, authenticateWithBiometric } from "@/lib/biometric";
import { isBiometricEnrolled, getCachedCredentials } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { DashboardData, ShiftData } from "@/lib/types";

function formatHours(num: number, lang: "pl" | "en"): string {
  const fixed = num.toFixed(1);
  return lang === "pl" ? fixed.replace(".", ",") : fixed;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const pinModalRef = useRef<TextInput>(null);
  const pinValueRef = useRef("");
  // Ref to hold pending clock-in data during PIN fallback (avoids re-triggering useEffect)
  const pendingClockInRef = useRef<{ qrToken: string; latitude: number; longitude: number; gpsAccuracy?: number } | null>(null);

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

  const pendingClockIn = useAppStore((s) => s.pendingClockIn);

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
    mutationFn: async (params: {
      action: "clock-in" | "clock-out";
      qrToken?: string;
      latitude?: number;
      longitude?: number;
      gpsAccuracy?: number;
    }) => {
      if (params.action === "clock-out") {
        return clockOut(
          params.latitude != null
            ? { latitude: params.latitude, longitude: params.longitude, gpsAccuracy: params.gpsAccuracy }
            : undefined,
        );
      }
      return clockIn({
        qrToken: params.qrToken!,
        latitude: params.latitude!,
        longitude: params.longitude!,
        gpsAccuracy: params.gpsAccuracy,
      });
    },
    onSuccess: (res, params) => {
      if (res.status === "success") {
        setClockedIn(params.action === "clock-in");
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

  // Watch for pendingClockIn from clock-scan screen
  useEffect(() => {
    if (!pendingClockIn) return;
    const pending = pendingClockIn;
    useAppStore.getState().setPendingClockIn(null);

    (async () => {
      // Biometric verification before finalizing clock-in
      const enrolled = await isBiometricEnrolled();
      if (enrolled) {
        const bio = await checkBiometricAvailability();
        if (bio.available) {
          const success = await authenticateWithBiometric(t(lang, "clock.biometricPrompt"));
          if (!success) {
            // Biometric failed -- show PIN fallback
            if (Platform.OS === "ios") {
              Alert.prompt(
                t(lang, "clock.pinFallback"),
                undefined,
                async (enteredPin: string) => {
                  const creds = await getCachedCredentials();
                  if (creds && enteredPin === creds.pin) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    clockMutation.mutate({ action: "clock-in", ...pending });
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
              // Android: store in ref (not Zustand) to avoid re-triggering this effect
              pendingClockInRef.current = pending;
              setPinInput("");
              setShowPinModal(true);
              setTimeout(() => pinModalRef.current?.focus(), 300);
            }
            return;
          }
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clockMutation.mutate({ action: "clock-in", ...pending });
    })();
  }, [pendingClockIn, lang]); // clockMutation.mutate is stable in TanStack Query v5

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const doClockOut = useCallback(async () => {
    const loc = await getCurrentLocation();
    clockMutation.mutate({
      action: "clock-out",
      latitude: loc.ok ? loc.data.latitude : undefined,
      longitude: loc.ok ? loc.data.longitude : undefined,
      gpsAccuracy: loc.ok ? (loc.data.accuracy ?? undefined) : undefined,
    });
  }, [clockMutation]);

  const handleClock = useCallback(async () => {
    if (clockingRef.current) return;
    clockingRef.current = true;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Clock IN: redirect to QR scanner (GPS collected there)
    if (!isClockedIn) {
      clockingRef.current = false;
      router.push("/clock-scan");
      return;
    }

    // Clock OUT: biometric verification then send with GPS
    const enrolled = await isBiometricEnrolled();
    if (!enrolled) {
      clockingRef.current = false;
      doClockOut();
      return;
    }

    const bio = await checkBiometricAvailability();
    if (!bio.available) {
      clockingRef.current = false;
      doClockOut();
      return;
    }

    const success = await authenticateWithBiometric(t(lang, "clock.biometricPrompt"));
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clockingRef.current = false;
      doClockOut();
      return;
    }

    // Biometric failed -- offer PIN fallback
    if (Platform.OS === "ios") {
      Alert.prompt(
        t(lang, "clock.pinFallback"),
        undefined,
        async (enteredPin: string) => {
          clockingRef.current = false;
          const creds = await getCachedCredentials();
          if (creds && enteredPin === creds.pin) {
            doClockOut();
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
      clockingRef.current = false;
      setPinInput("");
      setShowPinModal(true);
      setTimeout(() => pinModalRef.current?.focus(), 300);
    }
  }, [lang, isClockedIn, doClockOut]);

  const handlePinModalSubmit = useCallback(async (submittedPin: string) => {
    setShowPinModal(false);
    clockingRef.current = false;
    const creds = await getCachedCredentials();
    if (creds && submittedPin === creds.pin) {
      // Check if this is a clock-in PIN fallback (stored in ref, not Zustand)
      const pending = pendingClockInRef.current;
      if (pending) {
        pendingClockInRef.current = null;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        clockMutation.mutate({ action: "clock-in", ...pending });
      } else {
        doClockOut();
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t(lang, "common.error"), t(lang, "clock.pinWrong"));
      pendingClockInRef.current = null;
    }
    setPinInput("");
    pinValueRef.current = "";
  }, [lang, doClockOut, clockMutation]);

  const handlePinModalCancel = useCallback(() => {
    setShowPinModal(false);
    clockingRef.current = false;
    setPinInput("");
    pendingClockInRef.current = null;
  }, []);

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

        {/* Monthly Stats */}
        <View style={styles.statsGrid}>
          {/* Zarobki */}
          <View style={[styles.statCard, { borderTopColor: emp.success, borderTopWidth: 3 }]}>
            <Icon name="cash-outline" size={22} color={emp.success} />
            <View style={styles.statValueRow}>
              <Text style={styles.statValue}>
                {data?.stats?.earningsThisMonth != null
                  ? formatMoney(data.stats.earningsThisMonth)
                  : "\u2014"}
              </Text>
              {data?.stats?.earningsProjected != null && (
                <Text style={styles.statProjected}>
                  {" "}/ ~{formatMoney(data.stats.earningsProjected)}
                </Text>
              )}
            </View>
            <Text style={styles.statUnit}>PLN</Text>
            <Text style={styles.statLabel}>
              {t(lang, "dash.earnings")}{data?.stats?.isNetRate === false ? ` ${t(lang, "dash.gross")}` : ""}
            </Text>
          </View>

          {/* Godziny */}
          <View style={[styles.statCard, { borderTopColor: emp.primary, borderTopWidth: 3 }]}>
            <Icon name="time-outline" size={22} color={emp.primary} />
            <View style={styles.statValueRow}>
              <Text style={styles.statValue}>
                {formatHours(data?.stats?.hoursThisMonth ?? 0, lang)}
              </Text>
              <Text style={styles.statProjected}>
                {" "}/ {formatHours(data?.stats?.scheduledHoursThisMonth ?? 0, lang)}h
              </Text>
            </View>
            <Text style={styles.statLabel}>{t(lang, "dash.monthlyHours")}</Text>
          </View>

          {/* Nadgodziny */}
          <View style={[styles.statCard, { borderTopColor: emp.warning, borderTopWidth: 3 }]}>
            <Icon name="trending-up-outline" size={22} color={emp.warning} />
            <Text style={styles.statValue}>
              {formatHours(data?.stats?.overtimeThisMonth ?? 0, lang)}h
            </Text>
            <Text style={styles.statLabel}>{t(lang, "dash.overtime")}</Text>
          </View>

          {/* Urlop */}
          <View style={[styles.statCard, { borderTopColor: emp.info, borderTopWidth: 3 }]}>
            <Icon name="sunny-outline" size={22} color={emp.info} />
            <Text style={styles.statValue}>
              {data?.leaveBalance?.remainingDays ?? 0}
            </Text>
            <Text style={styles.statUnit}>{t(lang, "dash.remaining")}</Text>
            <Text style={styles.statLabel}>{t(lang, "dash.vacation")}</Text>
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
      {/* Android PIN Fallback Modal */}
      <Modal
        visible={showPinModal}
        transparent
        animationType="fade"
        onRequestClose={handlePinModalCancel}
      >
        <View style={styles.pinModalOverlay}>
          <View style={styles.pinModalCard} accessibilityViewIsModal={true}>
            <Text style={styles.pinModalTitle}>{t(lang, "clock.pinFallback")}</Text>
            <View style={styles.pinDotsRow}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.pinDot,
                    i < pinInput.length && styles.pinDotFilled,
                  ]}
                />
              ))}
            </View>
            <TextInput
              ref={pinModalRef}
              style={styles.hiddenInput}
              value={pinInput}
              onChangeText={(v) => {
                const cleaned = v.replace(/\D/g, "").slice(0, PIN_LENGTH);
                setPinInput(cleaned);
                pinValueRef.current = cleaned;
                if (cleaned.length === PIN_LENGTH) {
                  setTimeout(() => handlePinModalSubmit(cleaned), 100);
                }
              }}
              keyboardType="number-pad"
              maxLength={PIN_LENGTH}
              secureTextEntry
              accessibilityLabel={t(lang, "clock.pinFallback")}
              importantForAccessibility="yes"
            />
            <View style={styles.pinModalBtns}>
              <Pressable
                style={styles.pinModalCancelBtn}
                onPress={handlePinModalCancel}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "common.cancel")}
              >
                <Text style={styles.pinModalCancelText}>{t(lang, "common.cancel")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    letterSpacing: letterSpacing.tight,
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
    letterSpacing: letterSpacing.tight,
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
    letterSpacing: letterSpacing.tight,
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
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  statCard: {
    width: "47%" as any,
    backgroundColor: emp.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
    ...shadow.sm,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  statValue: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: emp.primary,
  },
  statProjected: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.textSecondary,
  },
  statUnit: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: emp.textSecondary,
    marginTop: -2,
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

  // -- Android PIN Modal --------------------------------------------------------
  pinModalOverlay: {
    flex: 1,
    backgroundColor: emp.overlay,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing["2xl"],
  },
  pinModalCard: {
    backgroundColor: emp.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing["2xl"],
    alignItems: "center",
    gap: spacing.lg,
    width: "100%",
    maxWidth: 320,
    ...shadow.lg,
  },
  pinModalTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: emp.text,
  },
  pinDotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  pinDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: emp.inputBorder,
    backgroundColor: emp.inputBg,
  },
  pinDotFilled: {
    backgroundColor: emp.primary,
    borderColor: emp.primary,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  pinModalBtns: {
    flexDirection: "row",
    gap: spacing.md,
  },
  pinModalCancelBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  pinModalCancelText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: emp.textMuted,
  },
});

export default function DashboardScreen() {
  return (
    <ErrorBoundary>
      <DashboardScreenInner />
    </ErrorBoundary>
  );
}
