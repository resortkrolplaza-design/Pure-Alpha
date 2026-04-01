// =============================================================================
// Employee App -- Leave Requests (warm cream + 3 stat cards + FAB + modal)
// =============================================================================

import { useState, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, RefreshControl, TextInput,
  StyleSheet, ActivityIndicator, Modal, Platform, Alert, KeyboardAvoidingView,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  emp, fontSize, letterSpacing, radius, spacing, shadow,
  leaveStatusColors, TOUCH_TARGET,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  submitLeaveRequest,
  cancelLeaveRequest,
  fetchLeaveRequests,
  fetchLeaveBalance,
} from "@/lib/employee-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { LeaveRequest, LeaveType, LeaveBalance } from "@/lib/types";

const LEAVE_TYPES: LeaveType[] = [
  "vacation", "sick", "personal", "unpaid", "parental",
  "childcare", "compassionate", "training", "blood_donation",
  "maternity", "paternity", "sick_childcare", "other",
];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Map frontend form leave types to backend UPPERCASE enum values
const LEAVE_TYPE_MAP: Record<string, string> = {
  vacation: "VACATION",
  sick: "SICK",
  personal: "ON_DEMAND",
  unpaid: "UNPAID",
  parental: "PARENTAL",
  childcare: "CHILDCARE_LEAVE",
  compassionate: "COMPASSIONATE",
  training: "TRAINING",
  blood_donation: "BLOOD_DONATION",
  maternity: "MATERNITY",
  paternity: "PATERNITY",
  sick_childcare: "SICK_CHILDCARE",
  other: "OTHER",
};

function mapLeaveTypeToBackend(type: string): string {
  return LEAVE_TYPE_MAP[type] ?? "OTHER";
}

function LeaveScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formType, setFormType] = useState<LeaveType>("vacation");
  const [formDateFrom, setFormDateFrom] = useState("");
  const [formDateTo, setFormDateTo] = useState("");
  const [formReason, setFormReason] = useState("");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<"from" | "to" | null>(null);

  // Fetch leave balance
  const balanceQuery = useQuery({
    queryKey: ["employee-leave-balance"],
    queryFn: async () => {
      const res = await fetchLeaveBalance();
      if (res.status !== "success") return null;
      return res.data ?? null;
    },
  });

  // Fetch leave requests list
  const requestsQuery = useQuery({
    queryKey: ["employee-leave-requests"],
    queryFn: async () => {
      const res = await fetchLeaveRequests();
      if (res.status !== "success") return null;
      return (res.data ?? []) as LeaveRequest[];
    },
  });

  const isLoading = balanceQuery.isLoading || requestsQuery.isLoading;
  const isError = balanceQuery.isError || requestsQuery.isError;

  const resetForm = useCallback(() => {
    setShowForm(false);
    setFormType("vacation");
    setFormDateFrom("");
    setFormDateTo("");
    setFormReason("");
  }, []);

  const formatDateLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const handleDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === "android") setShowDatePicker(null);
      if (!selectedDate) return;
      const formatted = formatDateLocal(selectedDate);
      if (showDatePicker === "from") {
        setFormDateFrom(formatted);
        // Auto-set "to" if empty or before "from"
        if (!formDateTo || formDateTo < formatted) setFormDateTo(formatted);
      } else if (showDatePicker === "to") {
        setFormDateTo(formatted);
      }
    },
    [showDatePicker, formDateTo],
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      return submitLeaveRequest({
        leaveType: mapLeaveTypeToBackend(formType),
        startDate: `${formDateFrom}T00:00:00Z`,
        endDate: `${formDateTo}T00:00:00Z`,
        reason: formReason || undefined,
      });
    },
    onSuccess: (res) => {
      if (res.status === "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["employee-leave-requests"] });
        queryClient.invalidateQueries({ queryKey: ["employee-leave-balance"] });
        resetForm();
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

  const cancelMutation = useMutation({
    mutationFn: (requestId: string) => cancelLeaveRequest(requestId),
    onSuccess: (res) => {
      if (res.status === "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t(lang, "leave.cancelSuccess"));
        queryClient.invalidateQueries({ queryKey: ["employee-leave-requests"] });
        queryClient.invalidateQueries({ queryKey: ["employee-leave-balance"] });
      } else {
        Alert.alert(t(lang, "common.error"), res.errorMessage ?? t(lang, "common.error"));
      }
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t(lang, "common.error"), t(lang, "common.networkError"));
    },
  });

  const handleCancelRequest = useCallback((requestId: string) => {
    cancelMutation.mutate(requestId);
  }, [cancelMutation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([balanceQuery.refetch(), requestsQuery.refetch()]);
    setRefreshing(false);
  }, [balanceQuery, requestsQuery]);

  const handleSubmit = () => {
    // Validate date format YYYY-MM-DD
    if (!DATE_REGEX.test(formDateFrom) || !DATE_REGEX.test(formDateTo)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t(lang, "common.error"), t(lang, "leave.dateInvalid"));
      return;
    }
    // Validate from <= to
    if (formDateFrom > formDateTo) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t(lang, "common.error"), t(lang, "leave.dateFromAfterTo"));
      return;
    }
    // Validate dates are today or in the future (use local date, not UTC)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (formDateFrom < today) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t(lang, "common.error"), t(lang, "leave.datePast"));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    submitMutation.mutate();
  };

  const canSubmit =
    DATE_REGEX.test(formDateFrom) &&
    DATE_REGEX.test(formDateTo);

  // Build balance object for display (backend returns full shape, use directly)
  const balance: LeaveBalance | null = balanceQuery.data ?? null;

  const requests = Array.isArray(requestsQuery.data) ? requestsQuery.data : [];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing["6xl"],
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={emp.primary} />
        }
      >
        {/* Header */}
        <Text style={styles.title}>{t(lang, "leave.title")}</Text>

        {/* Error State */}
        {isError && (
          <View style={styles.card} accessibilityLiveRegion="polite">
            <Text style={styles.placeholder}>{t(lang, "common.error")}</Text>
            <Pressable
              onPress={() => onRefresh()}
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.retry")}
            >
              <Text style={styles.retryText}>{t(lang, "common.retry")}</Text>
            </Pressable>
          </View>
        )}

        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={emp.primary} />
          </View>
        )}

        {/* Balance -- 3 Stat Cards */}
        {balance && (
          <View>
            <Text style={styles.sectionTitle}>{t(lang, "leave.balance")}</Text>
            <View style={styles.statRow}>
              <View
                style={styles.statCard}
                accessible={true}
                accessibilityLabel={`${balance.totalDays} ${t(lang, "leave.total")}`}
              >
                <Text style={[styles.statValue, { color: emp.primary }]}>
                  {balance.totalDays}
                </Text>
                <Text style={styles.statLabel}>{t(lang, "leave.total")}</Text>
              </View>
              <View
                style={styles.statCard}
                accessible={true}
                accessibilityLabel={`${balance.usedDays} ${t(lang, "leave.used")}`}
              >
                <Text style={[styles.statValue, { color: emp.warning }]}>
                  {balance.usedDays}
                </Text>
                <Text style={styles.statLabel}>{t(lang, "leave.used")}</Text>
              </View>
              <View
                style={styles.statCard}
                accessible={true}
                accessibilityLabel={`${balance.remainingDays} ${t(lang, "leave.remaining")}`}
              >
                <Text style={[styles.statValue, { color: emp.success }]}>
                  {balance.remainingDays}
                </Text>
                <Text style={styles.statLabel}>{t(lang, "leave.remaining")}</Text>
              </View>
            </View>
            {(balance.pendingRequests ?? 0) > 0 && (
              <Text style={styles.pendingNote}>
                {t(lang, "leave.pending")}: {balance.pendingRequests} {t(lang, "leave.pendingCount")}
              </Text>
            )}
          </View>
        )}

        {/* Requests List */}
        <View>
          <Text style={styles.sectionTitle}>{t(lang, "leave.requests")}</Text>
          {requests.length === 0 && !isLoading ? (
            <View style={[styles.card, styles.emptyCard]}>
              <Icon name="airplane-outline" size={32} color={emp.textMuted} />
              <Text style={styles.placeholder}>{t(lang, "leave.noRequests")}</Text>
            </View>
          ) : (
            requests.map((req) => (
              <LeaveRequestRow key={req.id} request={req} lang={lang} onCancel={handleCancelRequest} />
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB: New Request */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 100 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowForm(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={t(lang, "leave.newRequest")}
        accessibilityHint={lang === "pl" ? "Otwiera formularz wniosku urlopowego" : "Opens leave request form"}
      >
        <Icon name="add" size={28} color={emp.white} />
      </Pressable>

      {/* New Request Modal */}
      <Modal
        visible={showForm}
        animationType="slide"
        transparent={true}
        onRequestClose={resetForm}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={[
              styles.modalContent,
              { paddingBottom: insets.bottom + spacing.xl },
            ]}
            accessibilityViewIsModal={true}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t(lang, "leave.newRequest")}</Text>
              <Pressable
                onPress={resetForm}
                style={styles.modalClose}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "common.close")}
              >
                <Icon name="close" size={24} color={emp.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.formScroll}>
              {/* Leave Type */}
              <Text style={styles.fieldLabel}>{t(lang, "leave.type")}</Text>
              <Pressable
                style={styles.typeSelector}
                onPress={() => setShowTypePicker(!showTypePicker)}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "leave.type")}
              >
                <Text style={styles.typeSelectorText}>
                  {t(lang, `leave.type.${formType}`)}
                </Text>
                <Icon
                  name={showTypePicker ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={emp.textMuted}
                />
              </Pressable>

              {showTypePicker && (
                <View style={styles.typeList} accessibilityRole="radiogroup">
                  {LEAVE_TYPES.map((lt) => (
                    <Pressable
                      key={lt}
                      style={[
                        styles.typeOption,
                        lt === formType && styles.typeOptionActive,
                      ]}
                      onPress={() => {
                        setFormType(lt);
                        setShowTypePicker(false);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: lt === formType }}
                      accessibilityLabel={t(lang, `leave.type.${lt}`)}
                    >
                      <Text
                        style={[
                          styles.typeOptionText,
                          lt === formType && styles.typeOptionTextActive,
                        ]}
                      >
                        {t(lang, `leave.type.${lt}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Date From */}
              <Text style={styles.fieldLabel}>{t(lang, "leave.dateFrom")}</Text>
              <Pressable
                style={styles.datePickerBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowDatePicker("from");
                }}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "leave.dateFrom")}
              >
                <Icon name="calendar-outline" size={20} color={emp.primary} />
                <Text style={[styles.datePickerText, !formDateFrom && styles.datePickerPlaceholder]}>
                  {formDateFrom || t(lang, "leave.datePlaceholder")}
                </Text>
              </Pressable>
              {showDatePicker === "from" && (
                <View>
                  <DateTimePicker
                    value={formDateFrom ? new Date(formDateFrom + "T12:00:00") : new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    minimumDate={new Date()}
                    onChange={handleDateChange}
                    locale={lang === "pl" ? "pl-PL" : "en-US"}
                  />
                  {Platform.OS === "ios" && (
                    <Pressable style={styles.datePickerDone} onPress={() => setShowDatePicker(null)} accessibilityRole="button">
                      <Text style={styles.datePickerDoneText}>{t(lang, "common.confirm")}</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Date To */}
              <Text style={styles.fieldLabel}>{t(lang, "leave.dateTo")}</Text>
              <Pressable
                style={styles.datePickerBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowDatePicker("to");
                }}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "leave.dateTo")}
              >
                <Icon name="calendar-outline" size={20} color={emp.primary} />
                <Text style={[styles.datePickerText, !formDateTo && styles.datePickerPlaceholder]}>
                  {formDateTo || t(lang, "leave.datePlaceholder")}
                </Text>
              </Pressable>
              {showDatePicker === "to" && (
                <View>
                  <DateTimePicker
                    value={formDateTo ? new Date(formDateTo + "T12:00:00") : (formDateFrom ? new Date(formDateFrom + "T12:00:00") : new Date())}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    minimumDate={formDateFrom ? new Date(formDateFrom + "T12:00:00") : new Date()}
                    onChange={handleDateChange}
                    locale={lang === "pl" ? "pl-PL" : "en-US"}
                  />
                  {Platform.OS === "ios" && (
                    <Pressable style={styles.datePickerDone} onPress={() => setShowDatePicker(null)} accessibilityRole="button">
                      <Text style={styles.datePickerDoneText}>{t(lang, "common.confirm")}</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Reason */}
              <Text style={styles.fieldLabel}>{t(lang, "leave.reason")}</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={formReason}
                onChangeText={setFormReason}
                placeholder={t(lang, "leave.reasonPlaceholder")}
                placeholderTextColor={emp.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                accessibilityLabel={t(lang, "leave.reason")}
              />

              {/* Submit / Cancel */}
              <Pressable
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit || submitMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "leave.submit")}
              >
                {submitMutation.isPending ? (
                  <ActivityIndicator size="small" color={emp.white} />
                ) : (
                  <Text style={styles.submitText}>{t(lang, "leave.submit")}</Text>
                )}
              </Pressable>

              <Pressable
                style={styles.cancelBtn}
                onPress={resetForm}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "leave.cancel")}
              >
                <Text style={styles.cancelText}>{t(lang, "leave.cancel")}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function LeaveRequestRow({
  request,
  lang,
  onCancel,
}: {
  request: LeaveRequest;
  lang: "pl" | "en";
  onCancel?: (id: string) => void;
}) {
  const locale = lang === "pl" ? "pl-PL" : "en-US";
  const statusColors = leaveStatusColors[request.status] ?? leaveStatusColors.pending;
  const canCancel = onCancel && ["PENDING", "APPROVED"].includes(request.status);

  const formatLeaveDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
      });
    } catch {
      return dateStr;
    }
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t(lang, "leave.cancelConfirmTitle"),
      t(lang, "leave.cancelConfirmMessage"),
      [
        { text: t(lang, "common.cancel"), style: "cancel" },
        {
          text: t(lang, "leave.cancelRequest"),
          style: "destructive",
          onPress: () => onCancel?.(request.id),
        },
      ],
    );
  };

  return (
    <View
      style={styles.requestCard}
      accessible={true}
      accessibilityLabel={`${t(lang, `leave.type.${request.leaveType}`)}, ${formatLeaveDate(request.startDate)} -- ${formatLeaveDate(request.endDate)}, ${t(lang, `leave.status.${request.status}`)}`}
    >
      <View style={styles.requestHeader}>
        <Text style={styles.requestType}>
          {t(lang, `leave.type.${request.leaveType}`)}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
          <Text style={[styles.statusText, { color: statusColors.text }]}>
            {t(lang, `leave.status.${request.status}`)}
          </Text>
        </View>
      </View>
      <Text style={styles.requestDates}>
        {formatLeaveDate(request.startDate)} -- {formatLeaveDate(request.endDate)}
      </Text>
      {request.reason ? (
        <Text style={styles.requestReason} numberOfLines={2}>
          {request.reason}
        </Text>
      ) : null}
      {canCancel && (
        <Pressable
          onPress={handleCancel}
          style={styles.cancelRequestBtn}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "leave.cancelRequest")}
        >
          <Icon name="close-circle-outline" size={16} color={emp.danger} />
          <Text style={styles.cancelRequestText}>{t(lang, "leave.cancelRequest")}</Text>
        </Pressable>
      )}
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
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: emp.text,
    letterSpacing: letterSpacing.tight,
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
  placeholder: {
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

  // -- Balance: 3 Stat Cards ---------------------------------------------------
  statRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: emp.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing.lg,
    alignItems: "center",
    gap: 4,
    ...shadow.sm,
  },
  statValue: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: emp.primary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: emp.textSecondary,
  },
  pendingNote: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: emp.warning,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 16,
  },

  // -- Section ----------------------------------------------------------------
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: emp.text,
    marginBottom: spacing.sm,
    lineHeight: 24,
  },

  // -- Request Card -----------------------------------------------------------
  requestCard: {
    backgroundColor: emp.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: emp.cardBorder,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.xs,
    ...shadow.sm,
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  requestType: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: emp.text,
    lineHeight: 21,
  },
  statusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
  },
  requestDates: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: emp.textSecondary,
    lineHeight: 18,
  },
  requestReason: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: emp.textMuted,
    lineHeight: 16,
  },
  cancelRequestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: "flex-start",
    minHeight: TOUCH_TARGET,
  },
  cancelRequestText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: emp.danger,
  },

  // -- FAB --------------------------------------------------------------------
  fab: {
    position: "absolute",
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: emp.primary,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: emp.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },

  // -- Modal ------------------------------------------------------------------
  modalOverlay: {
    flex: 1,
    backgroundColor: emp.overlay,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: emp.bgLight,
    borderTopLeftRadius: radius["2xl"],
    borderTopRightRadius: radius["2xl"],
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: emp.text,
  },
  modalClose: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  formScroll: {
    gap: spacing.sm,
  },

  // -- Form Fields ------------------------------------------------------------
  fieldLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: emp.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  typeSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: emp.inputBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: emp.inputBorder,
    padding: spacing.lg,
    minHeight: TOUCH_TARGET,
  },
  typeSelectorText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: emp.text,
  },
  typeList: {
    backgroundColor: emp.inputBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: emp.inputBorder,
    marginTop: spacing.xs,
    overflow: "hidden",
  },
  typeOption: {
    padding: spacing.lg,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  typeOptionActive: {
    backgroundColor: emp.primaryLight,
  },
  typeOptionText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: emp.text,
  },
  typeOptionTextActive: {
    fontFamily: "Inter_600SemiBold",
    color: emp.primary,
  },
  input: {
    backgroundColor: emp.inputBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: emp.inputBorder,
    padding: spacing.lg,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: emp.text,
    minHeight: TOUCH_TARGET,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: spacing.md,
  },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: emp.inputBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: emp.inputBorder,
    padding: spacing.lg,
    minHeight: TOUCH_TARGET,
  },
  datePickerText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: emp.text,
  },
  datePickerPlaceholder: {
    color: emp.textMuted,
    fontFamily: "Inter_400Regular",
  },
  datePickerDone: {
    alignSelf: "flex-end",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  datePickerDoneText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: emp.primary,
  },
  submitBtn: {
    backgroundColor: emp.primary,
    borderRadius: radius["2xl"],
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: TOUCH_TARGET + 8,
    ...Platform.select({
      ios: {
        shadowColor: emp.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: emp.white,
  },
  cancelBtn: {
    paddingVertical: spacing.lg,
    alignItems: "center",
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  cancelText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: emp.textMuted,
  },
});

export default function LeaveScreen() {
  return (
    <ErrorBoundary>
      <LeaveScreenInner />
    </ErrorBoundary>
  );
}
