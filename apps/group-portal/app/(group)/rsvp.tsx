// =============================================================================
// Group Portal -- RSVP Hub (Tab 3)
// Role-branching screen:
//   Participant: RSVP form + Self-registration
//   Organizer:   Guest list (CRUD) + Documents
// =============================================================================

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  group,
  semantic,
  fontSize,
  radius,
  spacing,
  shadow,
  letterSpacing,
  rsvpColors,
  TOUCH_TARGET,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useScalePress, useSlideUp } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch, submitRsvp, fetchPortalInit } from "@/lib/group-api";
import type { GroupGuestData, RsvpPayload } from "@/lib/types";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

// Content imports from sibling screens (no code duplication)
import { RegisterContent } from "./register";
import { GuestsContent } from "./guests";
import { DocumentsContent } from "./documents";

// =============================================================================
// Segment Control (shared between both role views)
// =============================================================================

function SegmentControl({
  segments,
  activeIndex,
  onSelect,
}: {
  segments: readonly string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View style={hubStyles.segmentRow} accessibilityRole="tablist">
      {segments.map((label, i) => {
        const isActive = i === activeIndex;
        return (
          <Pressable
            key={label}
            style={[
              hubStyles.segmentItem,
              isActive && hubStyles.segmentItemActive,
            ]}
            onPress={() => {
              if (!isActive) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(i);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <Text
              style={[
                hubStyles.segmentText,
                isActive && hubStyles.segmentTextActive,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// =============================================================================
// RSVP Form Content (inline -- originally the full rsvp screen)
// =============================================================================

function GuestSearchItem({
  guest,
  lang,
  isSelected,
  onSelect,
}: {
  guest: GroupGuestData;
  lang: "pl" | "en";
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { scaleStyle, onPressIn, onPressOut } = useScalePress(0.98);
  const initials = `${(guest.firstName?.[0] ?? "").toUpperCase()}${(guest.lastName?.[0] ?? "").toUpperCase()}`;
  const rsvp = rsvpColors[guest.rsvpStatus] ?? rsvpColors.pending;

  return (
    <Pressable
      onPress={onSelect}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[formStyles.guestItem, isSelected && formStyles.guestItemSelected]}
      accessibilityRole="button"
      accessibilityHint={t(lang, "rsvp.selectHint")}
    >
      <Animated.View style={scaleStyle}>
        <View style={formStyles.guestRow}>
          <View style={[formStyles.avatar, { backgroundColor: group.primary }]}>
            <Text style={formStyles.avatarText}>{initials}</Text>
          </View>
          <View style={formStyles.guestInfo}>
            <Text style={formStyles.guestName}>
              {guest.firstName} {guest.lastName}
            </Text>
            <View style={[formStyles.rsvpBadge, { backgroundColor: rsvp.bg }]}>
              <Text style={[formStyles.rsvpBadgeText, { color: rsvp.text }]}>
                {t(lang, `group.rsvp.${guest.rsvpStatus}`)}
              </Text>
            </View>
          </View>
          {isSelected && (
            <Icon name="checkmark-circle" size={24} color={group.primary} />
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

function RsvpStatusContent() {
  const lang = useAppStore((s) => s.lang);
  const guest = useAppStore((s) => s.guest);
  const setGuest = useAppStore((s) => s.setGuest);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const rsvpToken = useAppStore((s) => s.rsvpToken);
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);
  const [newStatus, setNewStatus] = useState<"confirmed" | "declined" | null>(null);

  // Change answer mutation
  const changeMutation = useMutation({
    mutationFn: async (status: "confirmed" | "declined") => {
      if (!guest) throw new Error("No guest");
      const payload: RsvpPayload = { rsvpStatus: status };
      if (rsvpToken) payload.rsvpToken = rsvpToken;
      const res = await submitRsvp(trackingId, guest.id, payload);
      if (res.status !== "success") throw new Error(res.errorMessage || "Failed");
      return status;
    },
    onSuccess: (status) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (guest) setGuest({ ...guest, rsvpStatus: status });
      queryClient.invalidateQueries({ queryKey: ["portal-init"] });
      setChanging(false);
      setNewStatus(null);
    },
    onError: () => {
      Alert.alert(t(lang, "common.error"), t(lang, "common.error"));
    },
  });

  const status = guest?.rsvpStatus ?? "pending";
  const statusConfig = {
    confirmed: { icon: "checkmark-circle" as const, color: semantic.success, labelKey: "rsvp.status.confirmed" },
    declined: { icon: "close-circle" as const, color: semantic.danger, labelKey: "rsvp.status.declined" },
    pending: { icon: "time-outline" as const, color: group.textMuted, labelKey: "rsvp.status.pending" },
  };
  const cfg = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.pending;

  // No guest record -- prompt to self-register
  if (!guest) {
    return (
      <View style={formStyles.successContainer}>
        <Icon name="person-add-outline" size={48} color={group.primary} />
        <Text style={formStyles.unknownGuestTitle}>{t(lang, "rsvp.notOnList")}</Text>
        <Text style={formStyles.unknownGuestDesc}>{t(lang, "rsvp.notOnListDesc")}</Text>
      </View>
    );
  }

  return (
    <View style={formStyles.statusViewContainer}>
      {/* Status card */}
      <View style={formStyles.statusCard}>
        <View style={[formStyles.statusIconCircle, { backgroundColor: `${cfg.color}18` }]}>
          <Icon name={cfg.icon} size={40} color={cfg.color} />
        </View>
        <Text style={formStyles.statusLabel}>{t(lang, "rsvp.yourStatus")}</Text>
        <Text style={[formStyles.statusValue, { color: cfg.color }]}>
          {t(lang, cfg.labelKey)}
        </Text>
        <Text style={formStyles.statusGuestName}>
          {guest.firstName} {guest.lastName ?? ""}
        </Text>
      </View>

      {/* Change answer */}
      {!changing ? (
        <Pressable
          style={formStyles.changeAnswerBtn}
          onPress={() => setChanging(true)}
          accessibilityRole="button"
        >
          <Icon name="create-outline" size={18} color={group.primary} />
          <Text style={formStyles.changeAnswerText}>{t(lang, "rsvp.changeAnswer")}</Text>
        </Pressable>
      ) : (
        <View style={formStyles.changeSection}>
          <View style={formStyles.statusRow}>
            <Pressable
              style={[formStyles.statusBtn, newStatus === "confirmed" && formStyles.statusBtnConfirmed]}
              onPress={() => setNewStatus("confirmed")}
              accessibilityRole="radio"
              accessibilityState={{ selected: newStatus === "confirmed" }}
            >
              <Icon
                name={newStatus === "confirmed" ? "checkmark-circle" : "checkmark-circle-outline"}
                size={22}
                color={newStatus === "confirmed" ? group.white : semantic.success}
              />
              <Text style={[formStyles.statusBtnText, newStatus === "confirmed" && formStyles.statusBtnTextActive]}>
                {t(lang, "rsvp.confirm")}
              </Text>
            </Pressable>
            <Pressable
              style={[formStyles.statusBtn, newStatus === "declined" && formStyles.statusBtnDeclined]}
              onPress={() => setNewStatus("declined")}
              accessibilityRole="radio"
              accessibilityState={{ selected: newStatus === "declined" }}
            >
              <Icon
                name={newStatus === "declined" ? "close-circle" : "close-circle-outline"}
                size={22}
                color={newStatus === "declined" ? group.white : semantic.danger}
              />
              <Text style={[formStyles.statusBtnText, newStatus === "declined" && formStyles.statusBtnTextActive]}>
                {t(lang, "rsvp.decline")}
              </Text>
            </Pressable>
          </View>
          {newStatus && (
            <Pressable
              style={[formStyles.submitBtn, newStatus === "confirmed" ? formStyles.submitBtnConfirm : formStyles.submitBtnDecline]}
              onPress={() => changeMutation.mutate(newStatus)}
              disabled={changeMutation.isPending}
              accessibilityRole="button"
            >
              {changeMutation.isPending ? (
                <ActivityIndicator color={group.white} />
              ) : (
                <Text style={formStyles.submitBtnText}>
                  {t(lang, newStatus === "confirmed" ? "rsvp.submitConfirm" : "rsvp.submitDecline")}
                </Text>
              )}
            </Pressable>
          )}
          <Pressable
            style={formStyles.cancelChangeBtn}
            onPress={() => { setChanging(false); setNewStatus(null); }}
            accessibilityRole="button"
          >
            <Text style={formStyles.cancelChangeText}>{t(lang, "common.cancel")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// =============================================================================
// Participant Hub (RSVP + self-registration)
// =============================================================================

function ParticipantHub() {
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";

  const { data: portalData } = useQuery({
    queryKey: ["portal-init", trackingId],
    queryFn: async () => {
      if (!trackingId) return null;
      const res = await fetchPortalInit(trackingId);
      return res.status === "success" ? res.data : null;
    },
    enabled: !!trackingId,
    staleTime: 60_000,
  });

  const selfRegEnabled = portalData?.portal?.selfRegistrationEnabled === true;

  const segments = useMemo(() => {
    const list = [t(lang, "group.segment.confirmAttendance")];
    if (selfRegEnabled) {
      list.push(t(lang, "group.segment.joinEvent"));
    }
    return list;
  }, [lang, selfRegEnabled]);

  const [activeIdx, setActiveIdx] = useState(0);

  // P2: Clamp index when segments shrink
  useEffect(() => {
    if (segments.length > 0 && activeIdx >= segments.length) {
      setActiveIdx(0);
    }
  }, [segments.length, activeIdx]);

  return (
    <View style={hubStyles.flex}>
      {segments.length > 1 && (
        <SegmentControl
          segments={segments}
          activeIndex={activeIdx}
          onSelect={setActiveIdx}
        />
      )}
      {activeIdx === 0 ? (
        <RsvpStatusContent />
      ) : (
        <RegisterContent embedded />
      )}
    </View>
  );
}

// =============================================================================
// Organizer Hub (Guest list + Documents)
// =============================================================================

function OrganizerHub() {
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";

  const { data: portalData } = useQuery({
    queryKey: ["portal-init", trackingId],
    queryFn: async () => {
      if (!trackingId) return null;
      const res = await fetchPortalInit(trackingId);
      return res.status === "success" ? res.data : null;
    },
    enabled: !!trackingId,
    staleTime: 60_000,
  });

  // Build segments conditionally from feature flags
  const segmentEntries = useMemo(() => {
    const entries: { key: string; label: string }[] = [];
    if (portalData?.portal?.guestListEnabled !== false) {
      entries.push({ key: "guests", label: t(lang, "group.segment.guestList") });
    }
    if (portalData?.portal?.documentsEnabled !== false) {
      entries.push({ key: "documents", label: t(lang, "group.segment.documents") });
    }
    return entries;
  }, [lang, portalData]);

  const segmentLabels = useMemo(
    () => segmentEntries.map((e) => e.label),
    [segmentEntries],
  );

  const [activeIdx, setActiveIdx] = useState(0);

  // P2: Clamp index when segments shrink (e.g. feature toggled off)
  useEffect(() => {
    if (segmentEntries.length > 0 && activeIdx >= segmentEntries.length) {
      setActiveIdx(0);
    }
  }, [segmentEntries.length, activeIdx]);

  // Empty state: both features disabled
  if (segmentEntries.length === 0) {
    return (
      <View style={hubStyles.emptyContainer}>
        <Icon name="settings-outline" size={48} color={group.textMuted} />
        <Text style={hubStyles.emptyText}>
          {t(lang, "group.manage.noFeatures")}
        </Text>
      </View>
    );
  }

  const activeKey = segmentEntries[activeIdx]?.key;

  return (
    <View style={hubStyles.flex}>
      {/* Only show segment control if more than one segment */}
      {segmentEntries.length > 1 && (
        <SegmentControl
          segments={segmentLabels}
          activeIndex={activeIdx}
          onSelect={setActiveIdx}
        />
      )}
      {activeKey === "guests" ? (
        <GuestsContent embedded />
      ) : (
        <DocumentsContent embedded />
      )}
    </View>
  );
}

// =============================================================================
// Hub Screen (role branching)
// =============================================================================

function RsvpHubInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const portalRole = useAppStore((s) => s.portalRole);
  const isOrganizer = portalRole === "organizer";
  const headerSlide = useSlideUp(0, 12);

  const title = isOrganizer
    ? t(lang, "group.tab.manage")
    : t(lang, "group.tab.attendance");

  return (
    <View style={[hubStyles.container, { paddingTop: insets.top + 8 }]}>
      {/* Screen header */}
      <Animated.View style={[hubStyles.header, headerSlide]}>
        <Text style={hubStyles.title}>{title}</Text>
      </Animated.View>

      {/* Role-branched content */}
      {isOrganizer ? <OrganizerHub /> : <ParticipantHub />}
    </View>
  );
}

// =============================================================================
// Default Export
// =============================================================================

export default function RsvpScreen() {
  return (
    <ErrorBoundary>
      <RsvpHubInner />
    </ErrorBoundary>
  );
}

// =============================================================================
// Hub Styles
// =============================================================================

const hubStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: group.bg,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
  },

  // Segment control
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: group.inputBg,
    borderRadius: radius.xl,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    minHeight: TOUCH_TARGET,
  },
  segmentItemActive: {
    backgroundColor: group.white,
    ...shadow.sm,
  },
  segmentText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
  },
  segmentTextActive: {
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },

  // Empty state (no features enabled)
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing["3xl"],
  },
  emptyText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
});

// =============================================================================
// RSVP Form Styles
// =============================================================================

const formStyles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },

  // Step labels
  stepLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: group.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // Sections
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    marginBottom: spacing.md,
  },

  // Search
  searchInput: {
    backgroundColor: group.white,
    borderWidth: 1,
    borderColor: group.cardBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    minHeight: 48,
    marginBottom: spacing.md,
  },
  loader: { marginVertical: spacing.xl },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    marginVertical: spacing.lg,
  },

  // Guest list items
  guestItem: {
    backgroundColor: group.white,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: group.cardBorder,
  },
  guestItemSelected: {
    borderColor: group.primary,
    borderWidth: 2,
  },
  guestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
  guestInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  guestName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  rsvpBadge: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  rsvpBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
  },

  // Selected guest banner (replaces search after selection)
  selectedGuestBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: group.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: group.primary,
    marginBottom: spacing.md,
  },
  changeGuestBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: group.primaryLight,
    minHeight: 44,
    justifyContent: "center" as const,
  },
  changeGuestText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.primary,
  },
  alreadyRespondedText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
  },
  alreadyRespondedInfo: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    textAlign: "center" as const,
    marginBottom: spacing.md,
    lineHeight: 18,
  },

  // Email section
  emailSection: {
    marginTop: spacing.sm,
  },
  emailInputRow: {
    position: "relative" as const,
  },
  emailInput: {
    flex: 1,
    paddingRight: 44,
  },
  emailValidIcon: {
    position: "absolute" as const,
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: "center" as const,
  },
  inputError: {
    borderColor: semantic.danger,
  },

  // Unknown guest card (not on list)
  unknownGuestCard: {
    alignItems: "center" as const,
    gap: spacing.md,
    backgroundColor: group.white,
    borderRadius: radius.xl,
    padding: spacing["2xl"],
    borderWidth: 1,
    borderColor: group.cardBorder,
  },
  unknownGuestTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    textAlign: "center" as const,
  },
  unknownGuestDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center" as const,
    lineHeight: 18,
  },

  // Identified banner (legacy, kept for backward compat)
  identifiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: group.primaryLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  identifiedText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },

  // Status buttons
  statusRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statusBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: group.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    minHeight: 56,
    borderWidth: 1,
    borderColor: group.cardBorder,
    ...shadow.sm,
  },
  statusBtnConfirmed: {
    backgroundColor: semantic.success,
    borderColor: semantic.success,
  },
  statusBtnDeclined: {
    backgroundColor: semantic.danger,
    borderColor: semantic.danger,
  },
  statusBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  statusBtnTextActive: {
    color: group.white,
  },

  // Form inputs
  inputLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: group.white,
    borderWidth: 1,
    borderColor: group.cardBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    minHeight: 48,
  },
  textArea: {
    minHeight: 80,
    paddingTop: spacing.md,
    textAlignVertical: "top",
  },

  // Consent
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
    minHeight: 44,
  },
  consentText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    lineHeight: 18,
  },

  // Status view (read-only)
  statusViewContainer: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing["2xl"],
    gap: spacing.xl,
  },
  statusCard: {
    backgroundColor: group.white,
    borderRadius: radius["2xl"],
    padding: spacing["3xl"],
    alignItems: "center" as const,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: group.cardBorder,
    ...shadow.sm,
  },
  statusIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  statusLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  statusValue: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
  },
  statusGuestName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    marginTop: spacing.xs,
  },
  changeAnswerBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    minHeight: 48,
  },
  changeAnswerText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.primary,
  },
  changeSection: {
    gap: spacing.md,
  },
  cancelChangeBtn: {
    alignItems: "center" as const,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  cancelChangeText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
  },

  // Submit (visually distinct from status toggle)
  submitBtn: {
    flexDirection: "row" as const,
    gap: spacing.sm,
    backgroundColor: group.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    ...shadow.md,
  },
  submitBtnConfirm: {
    backgroundColor: semantic.success,
  },
  submitBtnDecline: {
    backgroundColor: semantic.danger,
  },
  submitBtnDisabled: {
    backgroundColor: group.disabledBg,
  },
  submitBtnText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: group.white,
  },

  // Success
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xl,
    padding: spacing["3xl"],
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: group.text,
    textAlign: "center",
  },
  backBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing["2xl"],
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  backBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
});
