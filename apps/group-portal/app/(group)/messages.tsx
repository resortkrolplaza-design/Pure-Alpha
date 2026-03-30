// =============================================================================
// Group Portal -- Messages (Tab 4): Chat | Ogloszenia | Ankiety
// Combines 3 features via SegmentedControl sub-tabs.
// =============================================================================

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { group, fontSize, radius, spacing, shadow, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useScalePress, useSlideUp } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch, fetchPortalInit } from "@/lib/group-api";
import { setSecureItem } from "@/lib/auth";
import type { GroupMessage } from "@/lib/types";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { AnnouncementsContent } from "./announcements";
import { PollsContent } from "./polls";

// =============================================================================
// Segment type
// =============================================================================

type Segment = "chat" | "announcements" | "polls";

const SEGMENTS: Array<{ key: Segment; labelKey: string }> = [
  { key: "chat", labelKey: "messages.tab.chat" },
  { key: "announcements", labelKey: "messages.tab.announcements" },
  { key: "polls", labelKey: "messages.tab.polls" },
];

// =============================================================================
// SegmentedControl
// =============================================================================

function SegmentedControl({
  segments,
  selected,
  onSelect,
  lang,
}: {
  segments: Array<{ key: Segment; labelKey: string }>;
  selected: Segment;
  onSelect: (seg: Segment) => void;
  lang: "pl" | "en";
}) {
  return (
    <View style={segStyles.container} accessibilityRole="tablist">
      {segments.map((seg) => {
        const isActive = seg.key === selected;
        return (
          <Pressable
            key={seg.key}
            style={[segStyles.segment, isActive && segStyles.segmentActive]}
            onPress={() => {
              if (!isActive) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(seg.key);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={t(lang, seg.labelKey)}
          >
            <Text
              style={[segStyles.label, isActive && segStyles.labelActive]}
              numberOfLines={1}
            >
              {t(lang, seg.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const segStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: group.inputBg,
    borderRadius: radius.lg,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: TOUCH_TARGET,
  },
  segmentActive: {
    backgroundColor: group.white,
    ...shadow.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
  },
  labelActive: {
    color: group.primary,
    fontFamily: "Inter_600SemiBold",
  },
});

// =============================================================================
// Chat helpers (extracted from original messages.tsx)
// =============================================================================

// P1-17: Strip bidi control characters to prevent XSS text spoofing
function stripBidiChars(str: string): string {
  return str.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");
}

// P2-3: Adaptive polling backoff
// Polling intervals -- will be replaced by WebSocket after AWS migration
const POLL_FAST = 3_000;    // Active chat: 3s
const POLL_MEDIUM = 10_000; // Idle 1min: 10s
const POLL_SLOW = 30_000;   // Idle 5min: 30s
const BACKOFF_MEDIUM_AFTER_MS = 60_000;
const BACKOFF_SLOW_AFTER_MS = 300_000;

// -- Avatar initials + gradient -----------------------------------------------

function getInitials(firstName: string | null, lastName: string | null): string {
  const f = firstName?.charAt(0)?.toUpperCase() ?? "";
  const l = lastName?.charAt(0)?.toUpperCase() ?? "";
  return f + l || "?";
}

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// -- Date helpers -------------------------------------------------------------

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  );
}

function formatDateSeparator(date: Date, lang: "pl" | "en"): string {
  const now = new Date();
  if (isSameDay(date, now)) return t(lang, "messages.today");
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (isSameDay(date, yesterday)) return t(lang, "messages.yesterday");
  return date.toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", {
    day: "numeric",
    month: "long",
  });
}

// -- Message list item types --------------------------------------------------

type ListItem =
  | { type: "date"; key: string; label: string }
  | { type: "message"; key: string; msg: GroupMessage; isPinned: boolean };

// =============================================================================
// ChatContent -- the original chat logic, now as a named component
// =============================================================================

function ChatContent() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const guest = useAppStore((s) => s.guest);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // TASK 3: Read prefill from upsell "Zapytaj" navigation param
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (prefill && typeof prefill === "string" && !prefillApplied.current) {
      prefillApplied.current = true;
      setText(prefill);
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [prefill]);

  // P2-3: Adaptive polling backoff
  const [pollInterval, setPollInterval] = useState(POLL_FAST);
  const lastNewMsgTimeRef = useRef(Date.now());
  const prevMsgCountRef2 = useRef<number | null>(null);

  const { scaleStyle, onPressIn, onPressOut } = useScalePress();

  const { data: msgData, isLoading, isError, refetch } = useQuery({
    queryKey: ["group-messages", trackingId],
    queryFn: async () => {
      if (!trackingId) return { replies: [], anchorMessage: null };
      const res = await groupFetch<{ replies: GroupMessage[]; anchorMessage: GroupMessage | null; unreadCount?: number }>(trackingId, "/messages");
      if (res.status === "error") throw new Error(res.errorMessage || "Failed to load messages");
      return res.data ?? { replies: [], anchorMessage: null };
    },
    enabled: !!trackingId,
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
  });

  // P2-3: Detect new messages and adjust polling interval
  useEffect(() => {
    if (!msgData) return;
    const currentCount = (msgData.replies?.length ?? 0) + (msgData.anchorMessage ? 1 : 0);
    if (prevMsgCountRef2.current !== null && currentCount > prevMsgCountRef2.current) {
      lastNewMsgTimeRef.current = Date.now();
      setPollInterval(POLL_FAST);
    }
    prevMsgCountRef2.current = currentCount;
  }, [msgData]);

  // P2-3: Periodic check to increase polling interval when idle
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const idleMs = Date.now() - lastNewMsgTimeRef.current;
      if (idleMs >= BACKOFF_SLOW_AFTER_MS) {
        setPollInterval((prev) => (prev !== POLL_SLOW ? POLL_SLOW : prev));
      } else if (idleMs >= BACKOFF_MEDIUM_AFTER_MS) {
        setPollInterval((prev) => (prev !== POLL_MEDIUM ? POLL_MEDIUM : prev));
      }
    }, 10_000);
    return () => clearInterval(checkInterval);
  }, []);

  // Build flat list with date separators
  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    // API returns oldest-first (orderBy createdAt asc) -- keep as-is for top-to-bottom display
    const replies = msgData?.replies ?? [];

    if (msgData?.anchorMessage) {
      // P2: Add date separator before pinned anchor message
      const anchorDate = new Date(msgData.anchorMessage.createdAt);
      const anchorDateKey = `${anchorDate.getUTCFullYear()}-${anchorDate.getUTCMonth()}-${anchorDate.getUTCDate()}`;
      items.push({
        type: "date",
        key: `date-anchor-${anchorDateKey}`,
        label: formatDateSeparator(anchorDate, lang),
      });
      items.push({
        type: "message",
        key: `msg-${msgData.anchorMessage.id}`,
        msg: msgData.anchorMessage,
        isPinned: true,
      });
    }

    let lastDate: string | null = null;
    for (const msg of replies) {
      const d = new Date(msg.createdAt);
      const dateKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      if (dateKey !== lastDate) {
        items.push({
          type: "date",
          key: `date-${dateKey}`,
          label: formatDateSeparator(d, lang),
        });
        lastDate = dateKey;
      }
      items.push({ type: "message", key: `msg-${msg.id}`, msg, isPinned: false });
    }
    return items;
  }, [msgData, lang]);

  // Track previous message count to only auto-scroll when new messages arrive
  const prevCountRef = useRef(0);

  useEffect(() => {
    const count = listItems.filter((i) => i.type === "message").length;
    if (count > prevCountRef.current) {
      flatListRef.current?.scrollToEnd({ animated: count - prevCountRef.current <= 2 });
    }
    prevCountRef.current = count;
  }, [listItems]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!trackingId) throw new Error("No trackingId");
      const senderName = guest
        ? [guest.firstName, guest.lastName].filter(Boolean).join(" ")
        : t(lang, "messages.participant");
      const res = await groupFetch<GroupMessage>(trackingId, "/messages", {
        method: "POST",
        body: JSON.stringify({ body, senderName }),
      });
      if (res.status !== "success") throw new Error(res.errorMessage || "Send failed");
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["group-messages"] });
      setText("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      lastNewMsgTimeRef.current = Date.now();
      setPollInterval(POLL_FAST);
    },
    onError: () => {
      Alert.alert(t(lang, "common.error"), t(lang, "messages.sendFailed"));
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  // Fade-in animation values per message (pruned to max 100 entries)
  const fadeAnims = useRef<Map<string, Animated.Value>>(new Map());
  const getFadeAnim = useCallback((key: string) => {
    if (!fadeAnims.current.has(key)) {
      // Prune oldest entries when map exceeds 100
      if (fadeAnims.current.size > 100) {
        const firstKey = fadeAnims.current.keys().next().value;
        if (firstKey) fadeAnims.current.delete(firstKey);
      }
      const anim = new Animated.Value(0);
      fadeAnims.current.set(key, anim);
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
    return fadeAnims.current.get(key)!;
  }, []);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === "date") {
      return (
        <View style={chatStyles.dateSeparator}>
          <View style={chatStyles.datePill}>
            <Text style={chatStyles.datePillText}>{item.label}</Text>
          </View>
        </View>
      );
    }

    const { msg, isPinned } = item;
    // Portal chat = 1 participant + hotel. All participant msgs are "mine".
    const isMine = !!msg.isParticipant;
    const isHotelSide = !isMine; // organizer, handlowiec, system -- all show on left with sender name
    const safeBody = stripBidiChars(msg.body);
    // For hotel-side messages: show staff name (organizer, handlowiec, system)
    // For participant (mine) messages: no sender label needed
    const senderName = isHotelSide
      ? [
          msg.sender.firstName ? stripBidiChars(msg.sender.firstName) : null,
          msg.sender.lastName ? stripBidiChars(msg.sender.lastName) : null,
        ].filter(Boolean).join(" ")
      : null;
    const fadeOpacity = getFadeAnim(item.key);

    return (
      <Animated.View style={[{ opacity: fadeOpacity }]}>
        {isPinned && (
          <View style={chatStyles.pinnedBanner}>
            <Icon name="pin-outline" size={14} color={group.primary} />
            <Text style={chatStyles.pinnedBannerText}>{t(lang, "messages.pinnedMessage")}</Text>
          </View>
        )}
        <View style={[chatStyles.msgRow, isMine ? chatStyles.msgRowMine : chatStyles.msgRowTheirs]}>
          {isHotelSide && (
            <View style={[chatStyles.avatar, { backgroundColor: getAvatarColor(senderName || "Hotel") }]}>
              <Text style={chatStyles.avatarText}>{getInitials(msg.sender.firstName, msg.sender.lastName)}</Text>
            </View>
          )}

          <View style={[chatStyles.bubbleColumn, isMine && chatStyles.bubbleColumnMine]}>
            {isHotelSide && senderName && (
              <Text style={chatStyles.senderName}>{senderName}</Text>
            )}

            <View
              style={[
                chatStyles.msgBubble,
                isMine ? chatStyles.bubbleMine : chatStyles.bubbleTheirs,
                isPinned && chatStyles.bubblePinned,
              ]}
            >
              <Text style={[chatStyles.msgText, isMine && chatStyles.msgTextMine]}>{safeBody}</Text>
            </View>

            <Text style={[chatStyles.msgTime, isMine && chatStyles.msgTimeMine]}>
              {new Date(msg.createdAt).toLocaleTimeString(lang === "pl" ? "pl-PL" : "en-GB", {
                hour: "2-digit", minute: "2-digit",
              })}
            </Text>
          </View>
        </View>
      </Animated.View>
    );
  }, [lang, getFadeAnim]);

  const hasText = text.trim().length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={chatStyles.keyboardView}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 140 : 0}
    >
      {/* Content */}
      {isLoading ? (
        <View style={chatStyles.center}>
          <ActivityIndicator color={group.primary} />
        </View>
      ) : isError ? (
        <View style={chatStyles.center}>
          <Icon name="cloud-offline-outline" size={48} color={group.textMuted} />
          <Text style={chatStyles.errorText}>{t(lang, "messages.errorLoading")}</Text>
          <Pressable
            style={chatStyles.retryBtn}
            onPress={() => refetch()}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "common.retry")}
          >
            <Text style={chatStyles.retryBtnText}>{t(lang, "common.retry")}</Text>
          </Pressable>
        </View>
      ) : !listItems.length ? (
        <View style={chatStyles.center}>
          <Icon name="chatbubbles-outline" size={48} color={group.textMuted} />
          <Text style={chatStyles.emptyTitle}>{t(lang, "group.noMessages")}</Text>
          <Text style={chatStyles.emptyDesc}>{t(lang, "group.noMessagesDesc")}</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={listItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          contentContainerStyle={chatStyles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Input bar */}
      <View style={[chatStyles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <View style={chatStyles.inputWrapper}>
          <TextInput
            ref={inputRef}
            style={chatStyles.input}
            placeholder={t(lang, "messages.placeholder")}
            placeholderTextColor={group.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            accessibilityLabel={t(lang, "messages.placeholder")}
          />
        </View>
        <Animated.View style={scaleStyle}>
          <Pressable
            style={[chatStyles.sendBtn, !hasText && chatStyles.sendBtnDisabled]}
            onPress={handleSend}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={!hasText || sendMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "messages.send")}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color={group.white} />
            ) : (
              <Icon name="arrow-up" size={20} color={group.white} />
            )}
          </Pressable>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

// =============================================================================
// Main Screen -- SegmentedControl + sub-tab switching
// =============================================================================

function GroupMessagesScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const headerSlide = useSlideUp(0, 12);
  const queryClient = useQueryClient();

  // Read portal init for feature flags (pollsEnabled)
  const { data: portalInit } = useQuery({
    queryKey: ["portal-init", trackingId],
    queryFn: async () => {
      if (!trackingId) return null;
      const res = await fetchPortalInit(trackingId);
      return res.status === "success" ? res.data : null;
    },
    enabled: !!trackingId,
    staleTime: 60_000,
  });
  const pollsEnabled = portalInit?.portal?.pollsEnabled !== false;

  // Accept `tab` route param to auto-select a segment on navigation
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeSegment, setActiveSegment] = useState<Segment>(() => {
    if (tab === "announcements") return "announcements";
    if (tab === "polls") return "polls";
    return "chat";
  });

  // Re-sync segment when route param changes (e.g. quick action navigates here)
  const prevTabRef = useRef(tab);
  useEffect(() => {
    if (tab !== prevTabRef.current) {
      prevTabRef.current = tab;
      if (tab === "announcements") setActiveSegment("announcements");
      else if (tab === "polls") setActiveSegment("polls");
      else if (tab === "chat") setActiveSegment("chat");
    }
  }, [tab]);

  // P1 fix: Clear unread badge when chat segment is active.
  // Uses the same LAST_SEEN_KEY as _layout.tsx so badge state stays in sync.
  useEffect(() => {
    if (activeSegment !== "chat" || !trackingId) return;
    const LAST_SEEN_KEY = `pa_last_seen_msg_count_${trackingId}`;
    // Read current message count from the query cache
    const cached = queryClient.getQueryData<{
      replies: unknown[];
      anchorMessage: unknown | null;
    }>(["group-messages", trackingId]);
    const currentCount = (cached?.replies?.length ?? 0) + (cached?.anchorMessage ? 1 : 0);
    setSecureItem(LAST_SEEN_KEY, String(currentCount)).catch(() => {});
    // Also invalidate the badge query so _layout picks up the cleared state
    queryClient.invalidateQueries({ queryKey: ["group-messages-count", trackingId] });
  }, [activeSegment, trackingId, queryClient]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View style={[styles.header, { paddingTop: insets.top + 12 }, headerSlide]}>
        <Text style={styles.title}>{t(lang, "group.tab.messages")}</Text>
      </Animated.View>

      {/* Segmented Control (polls segment hidden when pollsEnabled=false) */}
      <SegmentedControl
        segments={pollsEnabled ? SEGMENTS : SEGMENTS.filter((s) => s.key !== "polls")}
        selected={activeSegment}
        onSelect={setActiveSegment}
        lang={lang}
      />

      {/* Sub-tab content -- all tabs stay mounted to preserve polling state
          and animations. Hidden tabs use display:"none" instead of unmounting
          (P1 fix: adaptive polling reset on segment switch). */}
      <View style={styles.content}>
        <View style={{ display: activeSegment === "chat" ? "flex" : "none", flex: 1 }}>
          <ChatContent />
        </View>
        <View style={{ display: activeSegment === "announcements" ? "flex" : "none", flex: 1 }}>
          <AnnouncementsContent embedded />
        </View>
        <View style={{ display: activeSegment === "polls" ? "flex" : "none", flex: 1 }}>
          <PollsContent embedded />
        </View>
      </View>
    </View>
  );
}

// =============================================================================
// Styles -- container + header
// =============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: group.bg,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
  },
  content: {
    flex: 1,
  },
});

// =============================================================================
// Chat-specific styles
// =============================================================================

const chatStyles = StyleSheet.create({
  keyboardView: { flex: 1 },

  // Center states
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing["3xl"],
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    marginTop: spacing.md,
  },
  emptyDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  errorText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 18,
  },

  // Message list
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  // Date separator
  dateSeparator: {
    alignItems: "center",
    marginVertical: spacing.lg,
  },
  datePill: {
    backgroundColor: group.overlayWhite70,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  datePillText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
  },

  // Pinned banner
  pinnedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
    paddingVertical: spacing.xs,
  },
  pinnedBannerText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.primary,
  },

  // Message row
  msgRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: spacing.sm,
    maxWidth: "82%",
    gap: spacing.sm,
  },
  msgRowMine: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  msgRowTheirs: {
    alignSelf: "flex-start",
  },

  // Avatar
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxs,
  },
  avatarText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },

  // Bubble column
  bubbleColumn: {
    flexShrink: 1,
    alignItems: "flex-start",
  },
  bubbleColumnMine: {
    alignItems: "flex-end",
  },

  // Sender name
  senderName: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
    marginBottom: spacing.xxs,
    marginLeft: spacing.xxs,
  },

  // Bubbles
  msgBubble: {
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: "100%",
  },
  bubbleMine: {
    backgroundColor: group.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: group.white,
    borderBottomLeftRadius: 4,
    ...shadow.sm,
  },
  bubblePinned: {
    backgroundColor: group.primaryLight,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.15)",
  },

  // Message text
  msgText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    lineHeight: 21,
  },
  msgTextMine: {
    color: group.white,
  },

  // Time
  msgTime: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    marginTop: spacing.xxs,
    marginLeft: spacing.xxs,
  },
  msgTimeMine: {
    marginRight: spacing.xxs,
    marginLeft: 0,
  },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: group.cardBorder,
    backgroundColor: group.white,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: group.inputBg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
  },
  input: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    maxHeight: 120,
    minHeight: 44,
    lineHeight: 21,
  },

  // Send button
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: group.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: group.disabledBg,
  },

  // Retry
  retryBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.md,
  },
  retryBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
});

// =============================================================================
// Default export wrapped in ErrorBoundary
// =============================================================================

export default function GroupMessagesScreen() {
  return (
    <ErrorBoundary>
      <GroupMessagesScreenInner />
    </ErrorBoundary>
  );
}
