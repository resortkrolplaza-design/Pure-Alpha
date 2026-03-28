// =============================================================================
// Group Portal -- Polls Screen (vote, create, close, delete)
// Opened from quick action on overview dashboard. Hidden tab (href: null).
// Organizer: create, close, delete polls. Participant: vote only.
// =============================================================================

import { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import {
  group,
  fontSize,
  radius,
  spacing,
  shadow,
  letterSpacing,
  semantic,
  TOUCH_TARGET,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  fetchPolls,
  createPoll,
  votePoll,
  closePoll,
  deletePoll,
} from "@/lib/group-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { PollData } from "@/lib/types";

// =============================================================================
// DeviceId (stable per install, used for vote dedup)
// =============================================================================

function getDeviceId(): string {
  const id =
    Constants.installationId ??
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
      ?.installationId ??
    null;
  return typeof id === "string" && id.length >= 8
    ? id
    : `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const DEVICE_ID = getDeviceId();

// =============================================================================
// Constants
// =============================================================================

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

// =============================================================================
// Sub-components
// =============================================================================

function StatusBadge({ isActive, lang }: { isActive: boolean; lang: "pl" | "en" }) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: isActive ? "rgba(16,185,129,0.12)" : "rgba(100,116,139,0.12)" },
      ]}
    >
      <View
        style={[
          styles.badgeDot,
          { backgroundColor: isActive ? semantic.success : group.textMuted },
        ]}
      />
      <Text
        style={[
          styles.badgeText,
          { color: isActive ? semantic.success : group.textMuted },
        ]}
      >
        {isActive ? t(lang, "polls.active") : t(lang, "polls.closed")}
      </Text>
    </View>
  );
}

function ProgressBar({ percentage }: { percentage: number }) {
  return (
    <View style={styles.progressBarBg}>
      <View
        style={[
          styles.progressBarFill,
          { width: `${Math.min(percentage, 100)}%` as unknown as number },
        ]}
      />
    </View>
  );
}

// =============================================================================
// Poll Card
// =============================================================================

function PollCard({
  poll,
  lang,
  isOrganizer,
  onVote,
  onClose,
  onDelete,
  votingPollId,
}: {
  poll: PollData;
  lang: "pl" | "en";
  isOrganizer: boolean;
  onVote: (pollId: string, optionIdx: number) => void;
  onClose: (pollId: string) => void;
  onDelete: (pollId: string) => void;
  votingPollId: string | null;
}) {
  const isVoting = votingPollId === poll.id;
  const options = poll.options ?? [];
  const voteCounts = poll.voteCounts ?? [];
  const totalVotes = poll.totalVotes ?? 0;

  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${poll.question}, ${totalVotes} ${t(lang, "polls.totalVotes")}`}
    >
      {/* Header: question + status */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardQuestion}>{String(poll.question)}</Text>
        <StatusBadge isActive={poll.isActive} lang={lang} />
      </View>

      {/* Options */}
      <View style={styles.optionsList}>
        {options.map((option, idx) => {
          const count = voteCounts[idx] ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const canVote = poll.isActive && !isOrganizer;

          return (
            <Pressable
              key={`${poll.id}-opt-${idx}`}
              style={styles.optionRow}
              onPress={canVote ? () => onVote(poll.id, idx) : undefined}
              disabled={!canVote || isVoting}
              accessibilityRole={canVote ? "button" : "text"}
              accessibilityLabel={`${String(option)}, ${pct}%, ${count} ${t(lang, "polls.totalVotes")}`}
            >
              <View style={styles.optionInfo}>
                <Text style={styles.optionText} numberOfLines={2}>
                  {String(option)}
                </Text>
                <Text style={styles.optionPct}>{pct}%</Text>
              </View>
              <ProgressBar percentage={pct} />
              <Text style={styles.optionCount}>
                {count} {t(lang, "polls.totalVotes")}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Voting indicator */}
      {isVoting && (
        <View style={styles.votingIndicator}>
          <ActivityIndicator size="small" color={group.primary} />
        </View>
      )}

      {/* Footer: total votes + organizer actions */}
      <View style={styles.cardFooter}>
        <Text style={styles.totalVotesText}>
          {totalVotes} {t(lang, "polls.totalVotes")}
        </Text>

        {isOrganizer && (
          <View style={styles.organizerActions}>
            {poll.isActive && (
              <Pressable
                style={styles.actionBtn}
                onPress={() => onClose(poll.id)}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "polls.close")}
              >
                <Icon name="lock-closed-outline" size={16} color={semantic.warning} />
                <Text style={[styles.actionBtnText, { color: semantic.warning }]}>
                  {t(lang, "polls.close")}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={styles.actionBtn}
              onPress={() => onDelete(poll.id)}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "polls.delete")}
            >
              <Icon name="trash-outline" size={16} color={semantic.danger} />
              <Text style={[styles.actionBtnText, { color: semantic.danger }]}>
                {t(lang, "polls.delete")}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

// =============================================================================
// Create Poll Form
// =============================================================================

function CreatePollForm({
  lang,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  lang: "pl" | "en";
  onSubmit: (question: string, options: string[]) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);

  const canAddOption = options.length < MAX_OPTIONS;
  const validOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit = question.trim().length > 0 && validOptions.length >= MIN_OPTIONS && !isSubmitting;

  const handleAddOption = useCallback(() => {
    if (canAddOption) {
      setOptions((prev) => [...prev, ""]);
    }
  }, [canAddOption]);

  const handleRemoveOption = useCallback((idx: number) => {
    setOptions((prev) => {
      if (prev.length <= MIN_OPTIONS) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handleOptionChange = useCallback((idx: number, text: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[idx] = text;
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit(question.trim(), validOptions);
  }, [canSubmit, question, validOptions, onSubmit]);

  return (
    <View style={styles.formContainer}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>{t(lang, "polls.create")}</Text>
        <Pressable
          onPress={onCancel}
          style={styles.formCloseBtn}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "common.cancel")}
        >
          <Icon name="close" size={20} color={group.textMuted} />
        </Pressable>
      </View>

      {/* Question */}
      <Text style={styles.fieldLabel}>{t(lang, "polls.question")}</Text>
      <TextInput
        style={styles.textInput}
        value={question}
        onChangeText={setQuestion}
        placeholder={t(lang, "polls.question")}
        placeholderTextColor={group.textMuted}
        maxLength={500}
        multiline
        accessibilityLabel={t(lang, "polls.question")}
      />

      {/* Options */}
      <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
        {t(lang, "polls.option")} ({options.length}/{MAX_OPTIONS})
      </Text>
      {options.map((opt, idx) => (
        <View key={`form-opt-${idx}`} style={styles.optionInputRow}>
          <TextInput
            style={[styles.textInput, styles.optionInput]}
            value={opt}
            onChangeText={(text) => handleOptionChange(idx, text)}
            placeholder={`${t(lang, "polls.option")} ${idx + 1}`}
            placeholderTextColor={group.textMuted}
            maxLength={200}
            accessibilityLabel={`${t(lang, "polls.option")} ${idx + 1}`}
          />
          {options.length > MIN_OPTIONS && (
            <Pressable
              onPress={() => handleRemoveOption(idx)}
              style={styles.removeOptionBtn}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.delete")}
            >
              <Icon name="close-circle" size={20} color={semantic.danger} />
            </Pressable>
          )}
        </View>
      ))}

      {/* Add option */}
      {canAddOption && (
        <Pressable
          onPress={handleAddOption}
          style={styles.addOptionBtn}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "polls.addOption")}
        >
          <Icon name="add-circle-outline" size={18} color={group.primary} />
          <Text style={styles.addOptionText}>{t(lang, "polls.addOption")}</Text>
        </Pressable>
      )}

      {/* Submit */}
      <Pressable
        onPress={handleSubmit}
        style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel={t(lang, "polls.create")}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color={group.white} />
        ) : (
          <Text style={styles.submitBtnText}>{t(lang, "polls.create")}</Text>
        )}
      </Pressable>
    </View>
  );
}

// =============================================================================
// Main Screen Content
// =============================================================================

function PollsScreenContent() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const portalRole = useAppStore((s) => s.portalRole);
  const isOrganizer = portalRole === "organizer";
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [votingPollId, setVotingPollId] = useState<string | null>(null);
  const deviceIdRef = useRef(DEVICE_ID);

  // ── Fetch polls ──
  const {
    data: pollsData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["portal-polls", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await fetchPolls(trackingId);
      if (res.status === "success" && res.data) return res.data;
      return [];
    },
    enabled: !!trackingId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const polls = pollsData ?? [];

  // Sort: active first (by createdAt desc), then closed (by createdAt desc)
  const sortedPolls = useMemo(() => {
    const active = polls.filter((p) => p.isActive).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const closed = polls.filter((p) => !p.isActive).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return [...active, ...closed];
  }, [polls]);

  // ── Create poll ──
  const handleCreate = useCallback(
    async (question: string, options: string[]) => {
      if (!trackingId) return;
      setIsCreating(true);
      try {
        const res = await createPoll(trackingId, { question, options });
        if (res.status === "success") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setShowForm(false);
          queryClient.invalidateQueries({ queryKey: ["portal-polls", trackingId] });
        }
      } finally {
        setIsCreating(false);
      }
    },
    [trackingId, queryClient],
  );

  // ── Vote ──
  const handleVote = useCallback(
    async (pollId: string, optionIdx: number) => {
      if (!trackingId || votingPollId) return;
      setVotingPollId(pollId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const res = await votePoll(trackingId, pollId, optionIdx, deviceIdRef.current);
        if (res.status === "success" && res.data) {
          // Optimistic update in cache
          queryClient.setQueryData<PollData[]>(
            ["portal-polls", trackingId],
            (old) => {
              if (!old) return old;
              return old.map((p) =>
                p.id === pollId
                  ? { ...p, totalVotes: res.data!.totalVotes, voteCounts: res.data!.voteCounts }
                  : p,
              );
            },
          );
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } finally {
        setVotingPollId(null);
      }
    },
    [trackingId, votingPollId, queryClient],
  );

  // ── Close poll ──
  const handleClose = useCallback(
    (pollId: string) => {
      Alert.alert(
        t(lang, "polls.close"),
        t(lang, "polls.confirmClose"),
        [
          { text: t(lang, "common.cancel"), style: "cancel" },
          {
            text: t(lang, "common.confirm"),
            style: "destructive",
            onPress: async () => {
              if (!trackingId) return;
              const res = await closePoll(trackingId, pollId);
              if (res.status === "success") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                queryClient.invalidateQueries({ queryKey: ["portal-polls", trackingId] });
              }
            },
          },
        ],
      );
    },
    [lang, trackingId, queryClient],
  );

  // ── Delete poll ──
  const handleDelete = useCallback(
    (pollId: string) => {
      Alert.alert(
        t(lang, "polls.delete"),
        t(lang, "polls.confirmDelete"),
        [
          { text: t(lang, "common.cancel"), style: "cancel" },
          {
            text: t(lang, "common.delete"),
            style: "destructive",
            onPress: async () => {
              if (!trackingId) return;
              const res = await deletePoll(trackingId, pollId);
              if (res.status === "success") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                queryClient.invalidateQueries({ queryKey: ["portal-polls", trackingId] });
              }
            },
          },
        ],
      );
    },
    [lang, trackingId, queryClient],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBack}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "common.back")}
        >
          <Icon name="chevron-back" size={20} color={group.primary} />
        </Pressable>
        <Text style={styles.title}>{t(lang, "polls.title")}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Create poll form (inline, organizer only) */}
        {showForm && isOrganizer && (
          <CreatePollForm
            lang={lang}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            isSubmitting={isCreating}
          />
        )}

        {/* Loading */}
        {isLoading && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={group.primary} />
            <Text style={styles.stateText}>{t(lang, "common.loading")}</Text>
          </View>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <View style={styles.centerState}>
            <Icon name="alert-circle-outline" size={48} color={group.textMuted} />
            <Text style={styles.stateText}>{t(lang, "common.error")}</Text>
            <Pressable
              onPress={() => refetch()}
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.retry")}
            >
              <Text style={styles.retryBtnText}>{t(lang, "common.retry")}</Text>
            </Pressable>
          </View>
        )}

        {/* Empty state */}
        {!isLoading && !isError && sortedPolls.length === 0 && (
          <View style={styles.centerState}>
            <Icon name="bar-chart-outline" size={48} color={group.textMuted} />
            <Text style={styles.stateText}>{t(lang, "polls.empty")}</Text>
          </View>
        )}

        {/* Poll list */}
        {!isLoading &&
          !isError &&
          sortedPolls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              lang={lang}
              isOrganizer={isOrganizer}
              onVote={handleVote}
              onClose={handleClose}
              onDelete={handleDelete}
              votingPollId={votingPollId}
            />
          ))}
      </ScrollView>

      {/* FAB: create new poll (organizer only) */}
      {isOrganizer && !showForm && (
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 24 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowForm(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "polls.create")}
        >
          <Icon name="add" size={28} color={group.white} />
        </Pressable>
      )}
    </View>
  );
}

// =============================================================================
// Export with ErrorBoundary
// =============================================================================

export default function PollsScreen() {
  const lang = useAppStore((s) => s.lang);
  return (
    <ErrorBoundary lang={lang}>
      <PollsScreenContent />
    </ErrorBoundary>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: group.bg,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  // -- Header --
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerBack: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
  },

  // -- Poll Card --
  card: {
    backgroundColor: group.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadow.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  cardQuestion: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    lineHeight: 22,
  },

  // -- Status Badge --
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
  },

  // -- Options --
  optionsList: {
    gap: spacing.sm,
  },
  optionRow: {
    gap: spacing.xxs,
  },
  optionInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  optionText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.text,
  },
  optionPct: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
    minWidth: 36,
    textAlign: "right",
  },
  optionCount: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },

  // -- Progress Bar --
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: group.inputBg,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: group.primary,
  },

  // -- Voting indicator --
  votingIndicator: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },

  // -- Card Footer --
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: group.cardBorder,
    paddingTop: spacing.md,
  },
  totalVotesText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
  },
  organizerActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.sm,
  },
  actionBtnText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
  },

  // -- Create Poll Form --
  formContainer: {
    backgroundColor: group.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    ...shadow.md,
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  formTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  formCloseBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.textSecondary,
    marginBottom: spacing.xs,
  },
  textInput: {
    backgroundColor: group.inputBg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    minHeight: TOUCH_TARGET,
  },
  optionInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  optionInput: {
    flex: 1,
  },
  removeOptionBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  addOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    minHeight: TOUCH_TARGET,
  },
  addOptionText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.primary,
  },
  submitBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: TOUCH_TARGET,
    marginTop: spacing.sm,
  },
  submitBtnDisabled: {
    backgroundColor: group.disabledBg,
  },
  submitBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },

  // -- Empty / Loading / Error states --
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: spacing["6xl"],
    gap: spacing.md,
  },
  stateText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  retryBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },

  // -- FAB --
  fab: {
    position: "absolute",
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: group.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.lg,
  },
});
