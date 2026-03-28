// =============================================================================
// Group Portal -- Polls Screen (vote, create, close, delete)
// Opened from quick action on overview dashboard. Hidden tab (href: null).
// Organizer: create, close, delete polls. Participant: vote only.
// =============================================================================

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
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
const UNDO_TIMEOUT_MS = 5000;
const CONFIRM_TAP_TIMEOUT_MS = 3000;

// =============================================================================
// Undo Toast
// =============================================================================

function UndoToast({
  message,
  undoLabel,
  onUndo,
}: {
  message: string;
  undoLabel: string;
  onUndo: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.undoToastWrapper, { opacity }]}>
      <View style={styles.undoToast}>
        <Text style={styles.undoToastText}>{message}</Text>
        <Pressable
          onPress={onUndo}
          style={styles.undoToastBtn}
          accessibilityRole="button"
          accessibilityLabel={undoLabel}
        >
          <Text style={styles.undoToastBtnText}>{undoLabel}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

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
// Poll Card (with P2-7 double-tap delete confirmation)
// =============================================================================

function PollCard({
  poll,
  lang,
  isOrganizer,
  onVote,
  onClose,
  onDelete,
  votingPollId,
  myVote,
  onChangeVote,
  changingVote,
}: {
  poll: PollData;
  lang: "pl" | "en";
  isOrganizer: boolean;
  onVote: (pollId: string, optionIdx: number) => void;
  onClose: (pollId: string) => void;
  onDelete: (pollId: string) => void;
  votingPollId: string | null;
  myVote: number | null;
  onChangeVote: (pollId: string) => void;
  changingVote: string | null;
}) {
  const isVoting = votingPollId === poll.id;
  const isChanging = changingVote === poll.id;
  const options = poll.options ?? [];
  const voteCounts = poll.voteCounts ?? [];
  const totalVotes = poll.totalVotes ?? 0;
  const hasVoted = myVote !== null;

  // P2-7: Double-tap delete confirmation
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleDeleteTap = useCallback(() => {
    if (confirmingDelete) {
      // Second tap -- execute delete
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingDelete(false);
      onDelete(poll.id);
    } else {
      // First tap -- enter confirmation state
      setConfirmingDelete(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingDelete(false);
      }, CONFIRM_TAP_TIMEOUT_MS);
    }
  }, [confirmingDelete, onDelete, poll.id]);

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
          const canVote = poll.isActive && !isOrganizer && (!hasVoted || isChanging);
          const isMyChoice = myVote === idx;

          return (
            <Pressable
              key={`${poll.id}-opt-${idx}`}
              style={[styles.optionRow, isMyChoice && styles.optionRowSelected]}
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

      {/* Change vote button (participant only, already voted, poll active) */}
      {hasVoted && !isOrganizer && poll.isActive && !isChanging && (
        <Pressable
          onPress={() => onChangeVote(poll.id)}
          style={styles.changeVoteBtn}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "polls.changeVote")}
        >
          <Icon name="refresh-outline" size={16} color={group.primary} />
          <Text style={styles.changeVoteText}>{t(lang, "polls.changeVote")}</Text>
        </Pressable>
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
              style={[styles.actionBtn, confirmingDelete && styles.actionBtnConfirm]}
              onPress={handleDeleteTap}
              accessibilityRole="button"
              accessibilityLabel={confirmingDelete ? t(lang, "polls.confirmDeleteTap") : t(lang, "polls.delete")}
            >
              <Icon
                name="trash-outline"
                size={16}
                color={confirmingDelete ? group.white : semantic.danger}
              />
              <Text
                style={[
                  styles.actionBtnText,
                  { color: confirmingDelete ? group.white : semantic.danger },
                ]}
              >
                {confirmingDelete ? t(lang, "polls.confirmDeleteTap") : t(lang, "polls.delete")}
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
  onSubmit: (question: string, options: string[], showAsPopup: boolean) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [showAsPopup, setShowAsPopup] = useState(false);

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
    onSubmit(question.trim(), validOptions, showAsPopup);
  }, [canSubmit, question, validOptions, showAsPopup, onSubmit]);

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

      {/* Show as popup toggle */}
      <View style={styles.popupToggleRow}>
        <Icon name="megaphone-outline" size={16} color={showAsPopup ? group.primary : group.textMuted} />
        <Text style={styles.popupToggleLabel}>{t(lang, "polls.showAsPopup")}</Text>
        <Switch
          value={showAsPopup}
          onValueChange={setShowAsPopup}
          trackColor={{ false: group.disabledBg, true: group.primary }}
          thumbColor={group.white}
          disabled={isSubmitting}
          accessibilityLabel={t(lang, "polls.showAsPopup")}
        />
      </View>

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

// Exported for embedding inside Messages tab (sub-tab "Ankiety")
// When embedded=true: skip header (back button + title) and safe-area top padding
// because the parent Messages screen provides those.
export function PollsContent({ embedded }: { embedded?: boolean }) {
  return <PollsScreenContent embedded={embedded} />;
}

function PollsScreenContent({ embedded }: { embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const portalRole = useAppStore((s) => s.portalRole);
  const isOrganizer = portalRole === "organizer";
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [votingPollId, setVotingPollId] = useState<string | null>(null);
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});
  const [changingVote, setChangingVote] = useState<string | null>(null);
  const deviceIdRef = useRef(DEVICE_ID);

  // P2-2: Search state
  const [searchQuery, setSearchQuery] = useState("");

  // P2-6: Undo delete state
  const [pendingDelete, setPendingDelete] = useState<{ id: string; item: PollData } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

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

  // P2-2: Search filter (case-insensitive by question text)
  const showSearch = sortedPolls.length > 2;

  const filteredPolls = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedPolls;
    return sortedPolls.filter((p) =>
      String(p.question).toLowerCase().includes(q),
    );
  }, [sortedPolls, searchQuery]);

  // P2-6: Exclude pending delete from visible list
  const visiblePolls = useMemo(() => {
    if (!pendingDelete) return filteredPolls;
    return filteredPolls.filter((p) => p.id !== pendingDelete.id);
  }, [filteredPolls, pendingDelete]);

  // ── Create poll ──
  const handleCreate = useCallback(
    async (question: string, options: string[], showAsPopup: boolean) => {
      if (!trackingId) return;
      setIsCreating(true);
      try {
        const res = await createPoll(trackingId, { question, options, showAsPopup });
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
          // Record local vote
          setMyVotes((prev) => ({ ...prev, [pollId]: optionIdx }));
          // Clear changing-vote mode
          setChangingVote(null);
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

  // ── Change vote (re-enable option selection) ──
  const handleChangeVote = useCallback(
    (pollId: string) => {
      setChangingVote(pollId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [],
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

  // P2-6: Execute the actual delete API call
  const executeDelete = useCallback(
    async (pollId: string) => {
      if (!trackingId) return;
      const res = await deletePoll(trackingId, pollId);
      if (res.status === "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["portal-polls", trackingId] });
      }
    },
    [trackingId, queryClient],
  );

  // P2-6: Undo delete handler -- optimistic remove + 5s timer
  const handleDelete = useCallback(
    (pollId: string) => {
      // If there is already a pending delete, commit it immediately
      if (pendingDelete && undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        executeDelete(pendingDelete.id);
      }

      const item = polls.find((p) => p.id === pollId);
      if (!item) return;

      setPendingDelete({ id: pollId, item });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      undoTimerRef.current = setTimeout(() => {
        setPendingDelete(null);
        undoTimerRef.current = null;
        executeDelete(pollId);
      }, UNDO_TIMEOUT_MS);
    },
    [pendingDelete, polls, executeDelete],
  );

  // P2-6: Undo -- restore the item
  const handleUndo = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setPendingDelete(null);
  }, []);

  return (
    <View style={[styles.container, !embedded && { paddingTop: insets.top }]}>
      {/* Header -- skip when embedded inside Messages tab (parent provides header) */}
      {!embedded && (
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
      )}

      {/* P2-2: Search bar (only shown when >2 polls) */}
      {showSearch && (
        <View style={styles.searchContainer}>
          <Icon name="search-outline" size={18} color={group.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t(lang, "polls.search")}
            placeholderTextColor={group.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            accessibilityLabel={t(lang, "polls.search")}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery("")}
              style={styles.searchClearBtn}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.cancel")}
            >
              <Icon name="close-circle" size={18} color={group.textMuted} />
            </Pressable>
          )}
        </View>
      )}

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
          visiblePolls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              lang={lang}
              isOrganizer={isOrganizer}
              onVote={handleVote}
              onClose={handleClose}
              onDelete={handleDelete}
              votingPollId={votingPollId}
              myVote={myVotes[poll.id] ?? null}
              onChangeVote={handleChangeVote}
              changingVote={changingVote}
            />
          ))}
      </ScrollView>

      {/* P2-6: Undo Toast */}
      {pendingDelete && (
        <UndoToast
          message={t(lang, "polls.deleted")}
          undoLabel={t(lang, "polls.undo")}
          onUndo={handleUndo}
        />
      )}

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

  // -- Search --
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.inputBg,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    paddingVertical: spacing.sm,
  },
  searchClearBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: radius.md,
  },
  actionBtnConfirm: {
    backgroundColor: semantic.danger,
    paddingHorizontal: spacing.md,
  },
  actionBtnText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
  },

  // -- Change Vote --
  optionRowSelected: {
    backgroundColor: "rgba(99,102,241,0.06)",
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginHorizontal: -spacing.sm,
  },
  changeVoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: TOUCH_TARGET,
  },
  changeVoteText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.primary,
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
  popupToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  popupToggleLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.textSecondary,
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

  // -- Undo Toast --
  undoToastWrapper: {
    position: "absolute",
    bottom: 96,
    left: spacing.xl,
    right: spacing.xl,
    alignItems: "center",
  },
  undoToast: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.text,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    ...shadow.md,
  },
  undoToastText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.white,
  },
  undoToastBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
  },
  undoToastBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },
});
