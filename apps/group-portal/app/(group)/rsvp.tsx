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

function RsvpFormContent() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const storedGuest = useAppStore((s) => s.guest);
  const storedRsvpToken = useAppStore((s) => s.rsvpToken);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(
    storedGuest?.id ?? null,
  );
  const [emailVerify, setEmailVerify] = useState("");
  const [rsvpStatus, setRsvpStatus] = useState<"confirmed" | "declined" | null>(null);
  const [dietaryNeeds, setDietaryNeeds] = useState("");
  const [allergies, setAllergies] = useState("");
  const [rsvpNote, setRsvpNote] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const formSlide = useSlideUp(80, 16);
  const { scaleStyle, onPressIn, onPressOut } = useScalePress();

  // Read portal flags (shared cache with overview + _layout)
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
  const dietaryEnabled = portalData?.portal?.dietaryEnabled !== false;

  // Fetch guest list for selection
  const { data: guests, isLoading } = useQuery({
    queryKey: ["group-guests", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<GroupGuestData[]>(trackingId, "/guests");
      return res.data ?? [];
    },
    enabled: !!trackingId,
  });

  // Filter guests by search
  const filteredGuests = useMemo(() => {
    if (!guests?.length) return [];
    if (!search.trim()) return guests;
    const q = search.trim().toLowerCase();
    return guests.filter(
      (g) =>
        g.firstName.toLowerCase().includes(q) ||
        g.lastName.toLowerCase().includes(q),
    );
  }, [guests, search]);

  // Pre-identified: user logged in and we know their guest record
  const isPreIdentified = !!storedGuest && !!storedRsvpToken;

  // Can submit: guest selected + status chosen + identity verified
  const canSubmit =
    !!selectedGuestId &&
    !!rsvpStatus &&
    (isPreIdentified || emailVerify.trim().length > 0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedGuestId || !rsvpStatus) throw new Error("Invalid state");
      const payload: RsvpPayload = { rsvpStatus };
      if (rsvpStatus === "confirmed") {
        if (dietaryNeeds.trim()) payload.dietaryNeeds = dietaryNeeds.trim();
        if (allergies.trim()) payload.allergies = allergies.trim();
        if (marketingConsent) payload.marketingConsent = true;
      }
      if (rsvpNote.trim()) payload.rsvpNote = rsvpNote.trim();

      // Identity: prefer rsvpToken, fallback to email
      if (storedRsvpToken) {
        payload.rsvpToken = storedRsvpToken;
      } else if (emailVerify.trim()) {
        payload.emailVerify = emailVerify.trim().toLowerCase();
      }

      const res = await submitRsvp(trackingId, selectedGuestId, payload);
      if (res.status !== "success") {
        throw new Error(res.errorMessage || t(lang, "common.error"));
      }
      return res.data;
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["group-guests"] });
      queryClient.invalidateQueries({ queryKey: ["portal-init"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => {
      Alert.alert(
        t(lang, "common.error"),
        err instanceof Error ? err.message : t(lang, "common.error"),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleSubmit = useCallback(() => {
    if (!canSubmit || mutation.isPending) return;
    mutation.mutate();
  }, [canSubmit, mutation]);

  // -- Success state ----------------------------------------------------------
  if (submitted) {
    return (
      <View style={formStyles.successContainer}>
        <View style={[formStyles.successCircle, { backgroundColor: rsvpStatus === "confirmed" ? semantic.success : semantic.danger }]}>
          <Icon
            name={rsvpStatus === "confirmed" ? "checkmark" : "close"}
            size={40}
            color={group.white}
          />
        </View>
        <Text style={formStyles.successTitle}>
          {t(lang, rsvpStatus === "confirmed" ? "rsvp.success" : "rsvp.declineSuccess")}
        </Text>
        <Pressable
          style={formStyles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={formStyles.backBtnText}>{t(lang, "common.back")}</Text>
        </Pressable>
      </View>
    );
  }

  // -- Main form --------------------------------------------------------------
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={hubStyles.flex}
    >
      <ScrollView
        contentContainerStyle={[
          formStyles.scroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={formSlide}>
          {/* Step 1: Select guest (skip if pre-identified) */}
          {!isPreIdentified && (
            <View style={formStyles.section}>
              <Text style={formStyles.sectionTitle}>
                {t(lang, "rsvp.selectGuest")}
              </Text>
              <TextInput
                style={formStyles.searchInput}
                placeholder={t(lang, "rsvp.searchGuest")}
                placeholderTextColor={group.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="words"
              />
              {isLoading ? (
                <ActivityIndicator color={group.primary} style={formStyles.loader} />
              ) : filteredGuests.length === 0 ? (
                <Text style={formStyles.emptyText}>{t(lang, "rsvp.noMatch")}</Text>
              ) : (
                filteredGuests.slice(0, 20).map((g) => (
                  <GuestSearchItem
                    key={g.id}
                    guest={g}
                    lang={lang}
                    isSelected={g.id === selectedGuestId}
                    onSelect={() => setSelectedGuestId(g.id)}
                  />
                ))
              )}
            </View>
          )}

          {/* Pre-identified banner */}
          {isPreIdentified && storedGuest && (
            <View style={formStyles.identifiedBanner}>
              <Icon name="person-circle-outline" size={24} color={group.primary} />
              <Text style={formStyles.identifiedText}>
                {storedGuest.firstName} {storedGuest.lastName ?? ""}
              </Text>
            </View>
          )}

          {/* Email verification (only if not pre-identified and guest selected) */}
          {!isPreIdentified && selectedGuestId && (
            <View style={formStyles.section}>
              <Text style={formStyles.sectionTitle}>
                {t(lang, "rsvp.verifyEmail")}
              </Text>
              <TextInput
                style={formStyles.input}
                placeholder="jan@example.com"
                placeholderTextColor={group.textMuted}
                value={emailVerify}
                onChangeText={setEmailVerify}
                autoCapitalize="none"
                keyboardType="email-address"
                maxLength={320}
              />
            </View>
          )}

          {/* Step 2: Confirm / Decline */}
          {(isPreIdentified || selectedGuestId) && (
            <View style={formStyles.section}>
              <View style={formStyles.statusRow}>
                <Pressable
                  style={[
                    formStyles.statusBtn,
                    rsvpStatus === "confirmed" && formStyles.statusBtnConfirmed,
                  ]}
                  onPress={() => setRsvpStatus("confirmed")}
                  accessibilityRole="button"
                >
                  <Icon
                    name="checkmark-circle-outline"
                    size={22}
                    color={rsvpStatus === "confirmed" ? group.white : semantic.success}
                  />
                  <Text
                    style={[
                      formStyles.statusBtnText,
                      rsvpStatus === "confirmed" && formStyles.statusBtnTextActive,
                    ]}
                  >
                    {t(lang, "rsvp.confirm")}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    formStyles.statusBtn,
                    rsvpStatus === "declined" && formStyles.statusBtnDeclined,
                  ]}
                  onPress={() => setRsvpStatus("declined")}
                  accessibilityRole="button"
                >
                  <Icon
                    name="close-circle-outline"
                    size={22}
                    color={rsvpStatus === "declined" ? group.white : semantic.danger}
                  />
                  <Text
                    style={[
                      formStyles.statusBtnText,
                      rsvpStatus === "declined" && formStyles.statusBtnTextActive,
                    ]}
                  >
                    {t(lang, "rsvp.decline")}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Step 3: Dietary + Note (only when confirming) */}
          {rsvpStatus === "confirmed" && (
            <View style={formStyles.section}>
              {dietaryEnabled && (
                <>
                  <Text style={formStyles.inputLabel}>{t(lang, "rsvp.dietary")}</Text>
                  <TextInput
                    style={formStyles.input}
                    value={dietaryNeeds}
                    onChangeText={setDietaryNeeds}
                    placeholder={t(lang, "rsvp.dietary")}
                    placeholderTextColor={group.textMuted}
                    maxLength={500}
                  />

                  <Text style={[formStyles.inputLabel, { marginTop: spacing.md }]}>
                    {t(lang, "rsvp.allergies")}
                  </Text>
                  <TextInput
                    style={formStyles.input}
                    value={allergies}
                    onChangeText={setAllergies}
                    placeholder={t(lang, "rsvp.allergies")}
                    placeholderTextColor={group.textMuted}
                    maxLength={500}
                  />
                </>
              )}

              <Pressable
                style={formStyles.consentRow}
                onPress={() => setMarketingConsent(!marketingConsent)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: marketingConsent }}
              >
                <Icon
                  name={marketingConsent ? "checkbox" : "square-outline"}
                  size={22}
                  color={marketingConsent ? group.primary : group.textMuted}
                />
                <Text style={formStyles.consentText}>
                  {t(lang, "rsvp.marketingConsent")}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Note (both confirm and decline) */}
          {rsvpStatus && (
            <View style={formStyles.section}>
              <Text style={formStyles.inputLabel}>{t(lang, "rsvp.note")}</Text>
              <TextInput
                style={[formStyles.input, formStyles.textArea]}
                value={rsvpNote}
                onChangeText={setRsvpNote}
                placeholder={t(lang, "rsvp.note")}
                placeholderTextColor={group.textMuted}
                multiline
                maxLength={500}
              />
            </View>
          )}

          {/* Submit */}
          {canSubmit && (
            <Animated.View style={scaleStyle}>
              <Pressable
                style={[
                  formStyles.submitBtn,
                  mutation.isPending && formStyles.submitBtnDisabled,
                ]}
                onPress={handleSubmit}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={mutation.isPending}
                accessibilityRole="button"
              >
                {mutation.isPending ? (
                  <ActivityIndicator color={group.white} />
                ) : (
                  <Text style={formStyles.submitBtnText}>
                    {rsvpStatus === "confirmed"
                      ? t(lang, "rsvp.confirm")
                      : t(lang, "rsvp.decline")}
                  </Text>
                )}
              </Pressable>
            </Animated.View>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
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
        <RsvpFormContent />
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
    : t(lang, "group.tab.rsvp");

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

  // Identified banner
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

  // Submit
  submitBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    ...shadow.md,
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
