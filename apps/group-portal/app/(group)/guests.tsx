// =============================================================================
// Group Portal — Guests Tab (Guest list + RSVP status + Organizer CRUD)
// World-class redesign: Airbnb + Apple HIG
// =============================================================================

import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  TextInput,
  Animated,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  group,
  fontSize,
  radius,
  spacing,
  shadow,
  rsvpColors,
  semantic,
  letterSpacing,
  TOUCH_TARGET,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useScalePress, useSlideUp } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch, addGuest, editGuest, deleteGuest } from "@/lib/group-api";
import type { AddGuestPayload, EditGuestPayload } from "@/lib/group-api";
import type { GroupGuestData } from "@/lib/types";
import { useCallback, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

// -- Avatar gradient presets ------------------------------------------------

const AVATAR_GRADIENTS = [
  ["#6366f1", "#818cf8"], // indigo
  ["#8b5cf6", "#a78bfa"], // violet
  ["#ec4899", "#f472b6"], // pink
  ["#14b8a6", "#2dd4bf"], // teal
  ["#f59e0b", "#fbbf24"], // amber
] as const;

function getAvatarGradient(name: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

// -- RSVP label keys -------------------------------------------------------

const RSVP_LABEL_KEYS: Record<string, string> = {
  confirmed: "group.rsvp.confirmed",
  declined: "group.rsvp.declined",
  pending: "group.rsvp.pending",
};

// -- Guest Form Modal -------------------------------------------------------

interface GuestFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dietaryNeeds: string;
  allergies: string;
}

const EMPTY_FORM: GuestFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dietaryNeeds: "",
  allergies: "",
};

function GuestFormModal({
  visible,
  lang,
  editingGuest,
  isSaving,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  lang: "pl" | "en";
  editingGuest: GroupGuestData | null;
  isSaving: boolean;
  onSubmit: (form: GuestFormState) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<GuestFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof GuestFormState, string>>>({});

  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const dietaryRef = useRef<TextInput>(null);
  const allergiesRef = useRef<TextInput>(null);

  // Reset form when modal opens/closes or editing guest changes
  const prevVisibleRef = useRef(false);
  if (visible && !prevVisibleRef.current) {
    // Modal just opened
    if (editingGuest) {
      setForm({
        firstName: editingGuest.firstName,
        lastName: editingGuest.lastName,
        email: editingGuest.email ?? "",
        phone: editingGuest.phone ?? "",
        dietaryNeeds: editingGuest.dietaryNeeds ?? "",
        allergies: editingGuest.allergies ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});
  }
  prevVisibleRef.current = visible;

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof GuestFormState, string>> = {};
    if (!form.firstName.trim()) {
      newErrors.firstName = t(lang, "guests.firstNameRequired");
    }
    if (!form.lastName.trim()) {
      newErrors.lastName = t(lang, "guests.lastNameRequired");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, lang]);

  const handleSubmit = useCallback(() => {
    if (!validate()) return;
    onSubmit(form);
  }, [form, validate, onSubmit]);

  const isEdit = !!editingGuest;
  const modalTitle = isEdit ? t(lang, "guests.edit") : t(lang, "guests.add");

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={modalStyles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={modalStyles.header}>
          <Pressable
            onPress={onClose}
            style={modalStyles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "common.cancel")}
            disabled={isSaving}
          >
            <Text style={modalStyles.headerCancelText}>
              {t(lang, "common.cancel")}
            </Text>
          </Pressable>
          <Text style={modalStyles.headerTitle}>{modalTitle}</Text>
          <Pressable
            onPress={handleSubmit}
            style={[
              modalStyles.headerBtn,
              modalStyles.headerSaveBtn,
              isSaving && modalStyles.headerBtnDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "common.save")}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color={group.white} size="small" />
            ) : (
              <Text style={modalStyles.headerSaveText}>
                {t(lang, "common.save")}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Form */}
        <ScrollView
          style={modalStyles.scrollArea}
          contentContainerStyle={modalStyles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* First name (required) */}
          <View style={modalStyles.fieldGroup}>
            <Text style={modalStyles.fieldLabel}>{t(lang, "guests.firstName")} *</Text>
            <TextInput
              style={[
                modalStyles.input,
                errors.firstName ? modalStyles.inputError : null,
              ]}
              value={form.firstName}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, firstName: v }));
                if (errors.firstName) setErrors((e) => ({ ...e, firstName: undefined }));
              }}
              placeholder={t(lang, "guests.firstName")}
              placeholderTextColor={group.textMuted}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => lastNameRef.current?.focus()}
              accessibilityLabel={t(lang, "guests.firstName")}
            />
            {errors.firstName ? (
              <Text style={modalStyles.errorText}>{errors.firstName}</Text>
            ) : null}
          </View>

          {/* Last name (required) */}
          <View style={modalStyles.fieldGroup}>
            <Text style={modalStyles.fieldLabel}>{t(lang, "guests.lastName")} *</Text>
            <TextInput
              ref={lastNameRef}
              style={[
                modalStyles.input,
                errors.lastName ? modalStyles.inputError : null,
              ]}
              value={form.lastName}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, lastName: v }));
                if (errors.lastName) setErrors((e) => ({ ...e, lastName: undefined }));
              }}
              placeholder={t(lang, "guests.lastName")}
              placeholderTextColor={group.textMuted}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              accessibilityLabel={t(lang, "guests.lastName")}
            />
            {errors.lastName ? (
              <Text style={modalStyles.errorText}>{errors.lastName}</Text>
            ) : null}
          </View>

          {/* Email (optional) */}
          <View style={modalStyles.fieldGroup}>
            <Text style={modalStyles.fieldLabel}>{t(lang, "guests.email")}</Text>
            <TextInput
              ref={emailRef}
              style={modalStyles.input}
              value={form.email}
              onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
              placeholder={t(lang, "guests.email")}
              placeholderTextColor={group.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
              accessibilityLabel={t(lang, "guests.email")}
            />
          </View>

          {/* Phone (optional) */}
          <View style={modalStyles.fieldGroup}>
            <Text style={modalStyles.fieldLabel}>{t(lang, "guests.phone")}</Text>
            <TextInput
              ref={phoneRef}
              style={modalStyles.input}
              value={form.phone}
              onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
              placeholder={t(lang, "guests.phone")}
              placeholderTextColor={group.textMuted}
              keyboardType="phone-pad"
              returnKeyType="next"
              onSubmitEditing={() => dietaryRef.current?.focus()}
              accessibilityLabel={t(lang, "guests.phone")}
            />
          </View>

          {/* Dietary preferences (optional) */}
          <View style={modalStyles.fieldGroup}>
            <Text style={modalStyles.fieldLabel}>{t(lang, "guests.dietary")}</Text>
            <TextInput
              ref={dietaryRef}
              style={modalStyles.input}
              value={form.dietaryNeeds}
              onChangeText={(v) => setForm((f) => ({ ...f, dietaryNeeds: v }))}
              placeholder={t(lang, "guests.dietary")}
              placeholderTextColor={group.textMuted}
              returnKeyType="next"
              onSubmitEditing={() => allergiesRef.current?.focus()}
              accessibilityLabel={t(lang, "guests.dietary")}
            />
          </View>

          {/* Allergies (optional) */}
          <View style={modalStyles.fieldGroup}>
            <Text style={modalStyles.fieldLabel}>{t(lang, "guests.allergies")}</Text>
            <TextInput
              ref={allergiesRef}
              style={modalStyles.input}
              value={form.allergies}
              onChangeText={(v) => setForm((f) => ({ ...f, allergies: v }))}
              placeholder={t(lang, "guests.allergies")}
              placeholderTextColor={group.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              accessibilityLabel={t(lang, "guests.allergies")}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: group.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: group.cardBorder,
    backgroundColor: group.card,
  },
  headerBtn: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  headerSaveBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  headerBtnDisabled: {
    opacity: 0.5,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
  },
  headerCancelText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.primary,
  },
  headerSaveText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing["2xl"],
    gap: spacing.lg,
    paddingBottom: spacing["5xl"],
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  input: {
    backgroundColor: group.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    minHeight: TOUCH_TARGET,
  },
  inputError: {
    borderColor: semantic.danger,
  },
  errorText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: semantic.danger,
  },
});

// -- Guest Card (Airbnb-style) with organizer actions -------------------------

function GuestCard({
  guest,
  lang,
  isOrganizer,
  onEdit,
  onDelete,
}: {
  guest: GroupGuestData;
  lang: "pl" | "en";
  isOrganizer: boolean;
  onEdit: (guest: GroupGuestData) => void;
  onDelete: (guest: GroupGuestData) => void;
}) {
  const { scaleStyle, onPressIn, onPressOut } = useScalePress(0.98);
  const rsvp = rsvpColors[guest.rsvpStatus] ?? rsvpColors.pending;
  const rsvpLabelKey =
    RSVP_LABEL_KEYS[guest.rsvpStatus] ?? RSVP_LABEL_KEYS.pending;
  const fullName = `${guest.firstName} ${guest.lastName}`;
  const initials = `${(guest.firstName?.[0] ?? "").toUpperCase()}${(guest.lastName?.[0] ?? "").toUpperCase()}`;
  const [gradientStart] = getAvatarGradient(fullName);

  // Guests added by "admin" (hotel staff) cannot be edited/deleted by organizer
  const canModify = isOrganizer && guest.addedBy !== "admin";

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityLabel={`${fullName}, ${t(lang, rsvpLabelKey)}`}
    >
      <Animated.View style={[styles.guestCard, scaleStyle]}>
        <View style={[styles.guestAvatar, { backgroundColor: gradientStart }]}>
          <Text style={styles.guestInitials}>{initials}</Text>
        </View>
        <View style={styles.guestInfo}>
          <Text style={styles.guestName} numberOfLines={1}>
            {fullName}
          </Text>
          {guest.email ? (
            <Text style={styles.guestEmail} numberOfLines={1}>
              {guest.email}
            </Text>
          ) : guest.isOrganizer ? (
            <Text style={styles.organizerBadge}>
              {t(lang, "group.organizer")}
            </Text>
          ) : null}
        </View>

        {/* Organizer actions */}
        {canModify && (
          <View style={styles.guestActions}>
            <Pressable
              onPress={() => onEdit(guest)}
              style={styles.guestActionBtn}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "guests.edit")}
            >
              <Icon name="pencil-outline" size={18} color={group.primary} />
            </Pressable>
            <Pressable
              onPress={() => onDelete(guest)}
              style={styles.guestActionBtn}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "guests.delete")}
            >
              <Icon name="trash-outline" size={18} color={semantic.danger} />
            </Pressable>
          </View>
        )}

        <View style={[styles.rsvpBadge, { backgroundColor: rsvp.bg }]}>
          <Text style={[styles.rsvpText, { color: rsvp.text }]}>
            {t(lang, rsvpLabelKey)}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// -- Main Screen ------------------------------------------------------------

function GuestsScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const portalRole = useAppStore((s) => s.portalRole);
  const isOrganizer = portalRole === "organizer";
  const [searchQuery, setSearchQuery] = useState("");

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GroupGuestData | null>(null);

  const queryClient = useQueryClient();
  const headerSlide = useSlideUp(0, 12);

  const {
    data: guests,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["group-guests", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<GroupGuestData[]>(trackingId, "/guests");
      return res.data ?? [];
    },
    enabled: !!trackingId,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ── Mutations ──

  const addMutation = useMutation({
    mutationFn: (payload: AddGuestPayload) => addGuest(trackingId, payload),
    onSuccess: (res) => {
      if (res.status === "success") {
        queryClient.invalidateQueries({ queryKey: ["group-guests", trackingId] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setModalVisible(false);
        setEditingGuest(null);
      } else {
        const msg = res.errorMessage ?? t(lang, "common.error");
        if (msg.includes("LIMIT")) {
          Alert.alert(t(lang, "common.error"), t(lang, "guests.limitReached"));
        } else {
          Alert.alert(t(lang, "common.error"), msg);
        }
      }
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ guestId, payload }: { guestId: string; payload: EditGuestPayload }) =>
      editGuest(trackingId, guestId, payload),
    onSuccess: (res) => {
      if (res.status === "success") {
        queryClient.invalidateQueries({ queryKey: ["group-guests", trackingId] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setModalVisible(false);
        setEditingGuest(null);
      } else {
        const msg = res.errorMessage ?? t(lang, "common.error");
        if (msg.includes("admin")) {
          Alert.alert(t(lang, "common.error"), t(lang, "guests.cannotEditAdmin"));
        } else {
          Alert.alert(t(lang, "common.error"), msg);
        }
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (guestId: string) => deleteGuest(trackingId, guestId),
    onSuccess: (res) => {
      if (res.status === "success") {
        queryClient.invalidateQueries({ queryKey: ["group-guests", trackingId] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const msg = res.errorMessage ?? t(lang, "common.error");
        if (msg.includes("admin")) {
          Alert.alert(t(lang, "common.error"), t(lang, "guests.cannotEditAdmin"));
        } else {
          Alert.alert(t(lang, "common.error"), msg);
        }
      }
    },
  });

  const isSaving = addMutation.isPending || editMutation.isPending;

  // ── Handlers ──

  const handleOpenAdd = useCallback(() => {
    setEditingGuest(null);
    setModalVisible(true);
  }, []);

  const handleOpenEdit = useCallback((g: GroupGuestData) => {
    setEditingGuest(g);
    setModalVisible(true);
  }, []);

  const handleDelete = useCallback(
    (g: GroupGuestData) => {
      const fullName = `${g.firstName} ${g.lastName}`;
      if (Platform.OS === "web") {
        if (window.confirm(`${t(lang, "guests.deleteConfirm")}\n\n${fullName}`)) {
          deleteMutation.mutate(g.id);
        }
      } else {
        Alert.alert(
          t(lang, "guests.delete"),
          `${t(lang, "guests.deleteConfirm")}\n\n${fullName}`,
          [
            { text: t(lang, "common.cancel"), style: "cancel" },
            {
              text: t(lang, "common.delete"),
              style: "destructive",
              onPress: () => deleteMutation.mutate(g.id),
            },
          ],
        );
      }
    },
    [lang, deleteMutation],
  );

  const handleFormSubmit = useCallback(
    (form: GuestFormState) => {
      if (editingGuest) {
        const payload: EditGuestPayload = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          dietaryNeeds: form.dietaryNeeds.trim() || null,
          allergies: form.allergies.trim() || null,
        };
        editMutation.mutate({ guestId: editingGuest.id, payload });
      } else {
        const payload: AddGuestPayload = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.dietaryNeeds.trim() ? { dietaryNeeds: form.dietaryNeeds.trim() } : {}),
          ...(form.allergies.trim() ? { allergies: form.allergies.trim() } : {}),
        };
        addMutation.mutate(payload);
      }
    },
    [editingGuest, addMutation, editMutation],
  );

  const handleCloseModal = useCallback(() => {
    if (!isSaving) {
      setModalVisible(false);
      setEditingGuest(null);
    }
  }, [isSaving]);

  // -- Filtered guests by search --
  const filteredGuests = useMemo(() => {
    if (!guests?.length) return [];
    if (!searchQuery.trim()) return guests;
    const q = searchQuery.toLowerCase().trim();
    return guests.filter(
      (g) =>
        g.firstName.toLowerCase().includes(q) ||
        g.lastName.toLowerCase().includes(q) ||
        (g.email && g.email.toLowerCase().includes(q)),
    );
  }, [guests, searchQuery]);

  // -- RSVP summary counts --
  const rsvpCounts = useMemo(() => {
    if (!guests?.length) return { confirmed: 0, pending: 0, declined: 0 };
    return {
      confirmed: guests.filter((g) => g.rsvpStatus === "confirmed").length,
      pending: guests.filter((g) => g.rsvpStatus === "pending").length,
      declined: guests.filter((g) => g.rsvpStatus === "declined").length,
    };
  }, [guests]);

  const renderGuest = useCallback(
    ({ item: g }: { item: GroupGuestData }) => (
      <GuestCard
        guest={g}
        lang={lang}
        isOrganizer={isOrganizer}
        onEdit={handleOpenEdit}
        onDelete={handleDelete}
      />
    ),
    [lang, isOrganizer, handleOpenEdit, handleDelete],
  );

  const totalCount = guests?.length ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <Animated.View style={[styles.headerContainer, headerSlide]}>
        {/* Title + Count */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {t(lang, "group.tab.guests")}
          </Text>
          {totalCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{totalCount}</Text>
            </View>
          )}
        </View>

        {/* RSVP Summary Bar */}
        {totalCount > 0 && (
          <View style={styles.rsvpSummary}>
            <View style={styles.rsvpSummaryItem}>
              <Text
                style={[
                  styles.rsvpSummaryCount,
                  { color: rsvpColors.confirmed.text },
                ]}
              >
                {rsvpCounts.confirmed}
              </Text>
              <Text style={styles.rsvpSummaryLabel}>
                {t(lang, "group.confirmed")}
              </Text>
            </View>
            <View style={styles.rsvpSummaryDivider} />
            <View style={styles.rsvpSummaryItem}>
              <Text
                style={[
                  styles.rsvpSummaryCount,
                  { color: rsvpColors.pending.text },
                ]}
              >
                {rsvpCounts.pending}
              </Text>
              <Text style={styles.rsvpSummaryLabel}>
                {t(lang, "group.pending")}
              </Text>
            </View>
            <View style={styles.rsvpSummaryDivider} />
            <View style={styles.rsvpSummaryItem}>
              <Text
                style={[
                  styles.rsvpSummaryCount,
                  { color: rsvpColors.declined.text },
                ]}
              >
                {rsvpCounts.declined}
              </Text>
              <Text style={styles.rsvpSummaryLabel}>
                {t(lang, "group.declined")}
              </Text>
            </View>
          </View>
        )}

        {/* Search Bar */}
        {totalCount > 0 && (
          <View style={styles.searchContainer}>
            <Icon name="search-outline" size={18} color={group.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={t(lang, "group.searchGuest")}
              placeholderTextColor={group.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t(lang, "group.searchGuest")}
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => setSearchQuery("")}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "common.close")}
                style={styles.clearBtn}
              >
                <Icon
                  name="close-circle"
                  size={18}
                  color={group.textMuted}
                />
              </Pressable>
            )}
          </View>
        )}
      </Animated.View>

      <FlatList
        data={filteredGuests}
        renderItem={renderGuest}
        keyExtractor={(g) => g.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={group.primary}
          />
        }
        ListEmptyComponent={
          isError ? (
            <View style={styles.emptyContainer}>
              <Icon
                name="alert-circle-outline"
                size={36}
                color={group.textMuted}
              />
              <Text style={styles.emptyText}>{t(lang, "common.error")}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => refetch()}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "common.retry")}
              >
                <Text style={styles.retryBtnText}>
                  {t(lang, "common.retry")}
                </Text>
              </Pressable>
            </View>
          ) : isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {t(lang, "common.loading")}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Icon
                name="people-outline"
                size={48}
                color={group.textMuted}
              />
              <Text style={styles.emptyTitle}>
                {t(lang, "group.noGuests")}
              </Text>
            </View>
          )
        }
      />

      {/* FAB: Add Guest (organizer only) */}
      {isOrganizer && (
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 80 }]}
          onPress={handleOpenAdd}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "guests.add")}
        >
          <Icon name="add" size={28} color={group.white} />
        </Pressable>
      )}

      {/* Guest Form Modal */}
      <GuestFormModal
        visible={modalVisible}
        lang={lang}
        editingGuest={editingGuest}
        isSaving={isSaving}
        onSubmit={handleFormSubmit}
        onClose={handleCloseModal}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: group.bg,
  },

  // Header
  headerContainer: {
    paddingHorizontal: spacing["2xl"],
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
  },
  countBadge: {
    backgroundColor: group.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    minWidth: 28,
    alignItems: "center",
  },
  countBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },

  // RSVP Summary
  rsvpSummary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.sm,
  },
  rsvpSummaryItem: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xxs,
  },
  rsvpSummaryCount: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
  },
  rsvpSummaryLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },
  rsvpSummaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: group.cardBorder,
  },

  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.inputBg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    height: TOUCH_TARGET,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    paddingVertical: 0,
    height: TOUCH_TARGET,
  },
  clearBtn: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },

  // List
  list: {
    paddingHorizontal: spacing["2xl"],
    gap: spacing.sm,
  },

  // Guest Card
  guestCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  guestAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  guestInitials: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
  guestInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  guestName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.text,
    lineHeight: 21,
  },
  guestEmail: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    lineHeight: 16,
  },
  organizerBadge: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.primary,
  },

  // Guest action buttons (organizer only)
  guestActions: {
    flexDirection: "row",
    gap: spacing.xxs,
  },
  guestActionBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },

  rsvpBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  rsvpText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
  },

  // Empty State
  emptyContainer: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing["5xl"],
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
    textAlign: "center",
  },

  // Retry
  retryBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing["2xl"],
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
  },
  retryBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },

  // FAB (Floating Action Button)
  fab: {
    position: "absolute",
    right: spacing["2xl"],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: group.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.lg,
  },
});

// Default export wrapped in ErrorBoundary

export default function GuestsScreen() {
  return (
    <ErrorBoundary>
      <GuestsScreenInner />
    </ErrorBoundary>
  );
}
