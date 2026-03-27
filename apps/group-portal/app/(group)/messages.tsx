// =============================================================================
// Group Portal — Messages (iOS Messages-style chat with organizer/participants)
// =============================================================================

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { group, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useScalePress, useSlideUp } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { GroupMessage } from "@/lib/types";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

// P1-17: Strip bidi control characters to prevent XSS text spoofing
function stripBidiChars(str: string): string {
  return str.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");
}

const POLL_INTERVAL = 10_000;

// ── Avatar initials + gradient ────────────────────────────────────────────────

function getInitials(firstName: string | null, lastName: string | null): string {
  const f = firstName?.charAt(0)?.toUpperCase() ?? "";
  const l = lastName?.charAt(0)?.toUpperCase() ?? "";
  return f + l || "?";
}

// Deterministic color from name string — consistent gradient per sender
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

// ── Date helpers ──────────────────────────────────────────────────────────────

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

// ── Message list item types ───────────────────────────────────────────────────

type ListItem =
  | { type: "date"; key: string; label: string }
  | { type: "message"; key: string; msg: GroupMessage; isPinned: boolean };

function GroupMessagesScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const { scaleStyle, onPressIn, onPressOut } = useScalePress();
  const headerSlide = useSlideUp(0, 12);

  const { data: msgData, isLoading, isError, refetch } = useQuery({
    queryKey: ["group-messages", trackingId],
    queryFn: async () => {
      if (!trackingId) return { replies: [], anchorMessage: null };
      const res = await groupFetch<{ replies: GroupMessage[]; anchorMessage: GroupMessage | null; unreadCount?: number }>(trackingId, "/messages");
      return res.data ?? { replies: [], anchorMessage: null };
    },
    enabled: !!trackingId,
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
  });

  // Build flat list with date separators
  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    const replies = [...(msgData?.replies ?? [])].reverse();

    // Anchor message first (pinned)
    if (msgData?.anchorMessage) {
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
      const res = await groupFetch<GroupMessage>(trackingId, "/messages", {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      if (res.status !== "success") throw new Error(res.errorMessage || "Send failed");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-messages"] });
      setText("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onError: (err) => {
      Alert.alert(t(lang, "common.error"), t(lang, "messages.sendFailed"));
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  // Fade-in animation values per message
  const fadeAnims = useRef<Map<string, Animated.Value>>(new Map());
  const getFadeAnim = useCallback((key: string) => {
    if (!fadeAnims.current.has(key)) {
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
        <View style={styles.dateSeparator}>
          <View style={styles.datePill}>
            <Text style={styles.datePillText}>{item.label}</Text>
          </View>
        </View>
      );
    }

    const { msg, isPinned } = item;
    const isOrg = msg.isOrganizer;
    const isMine = !isOrg;
    const safeFirstName = msg.sender.firstName ? stripBidiChars(msg.sender.firstName) : null;
    const safeLastName = msg.sender.lastName ? stripBidiChars(msg.sender.lastName) : null;
    const safeBody = stripBidiChars(msg.body);
    const senderName = [safeFirstName, safeLastName].filter(Boolean).join(" ");
    const fadeOpacity = getFadeAnim(item.key);

    return (
      <Animated.View style={[{ opacity: fadeOpacity }]}>
        {/* Pinned anchor message */}
        {isPinned && (
          <View style={styles.pinnedBanner}>
            <Icon name="pin-outline" size={14} color={group.primary} />
            <Text style={styles.pinnedBannerText}>{t(lang, "messages.pinnedMessage")}</Text>
          </View>
        )}
        <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
          {/* Avatar for organizer messages (left side) */}
          {isOrg && (
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(senderName || "Org") }]}>
              <Text style={styles.avatarText}>{getInitials(safeFirstName, safeLastName)}</Text>
            </View>
          )}

          <View style={[styles.bubbleColumn, isMine && styles.bubbleColumnMine]}>
            {/* Sender name above bubble — only for organizer */}
            {isOrg && senderName && (
              <Text style={styles.senderName}>{senderName}</Text>
            )}

            <View
              style={[
                styles.msgBubble,
                isMine ? styles.bubbleMine : styles.bubbleTheirs,
                isPinned && styles.bubblePinned,
              ]}
            >
              <Text style={[styles.msgText, isMine && styles.msgTextMine]}>{safeBody}</Text>
            </View>

            <Text style={[styles.msgTime, isMine && styles.msgTimeMine]}>
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
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Header */}
        <Animated.View style={[styles.header, { paddingTop: insets.top + 12 }, headerSlide]}>
          <Text style={styles.title}>{t(lang, "group.tab.messages")}</Text>
        </Animated.View>

        {/* Content */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={group.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Icon name="cloud-offline-outline" size={48} color={group.textMuted} />
            <Text style={styles.errorText}>{t(lang, "messages.errorLoading")}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => refetch()}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.retry")}
            >
              <Text style={styles.retryBtnText}>{t(lang, "common.retry")}</Text>
            </Pressable>
          </View>
        ) : !listItems.length ? (
          <View style={styles.center}>
            <Icon name="chatbubbles-outline" size={48} color={group.textMuted} />
            <Text style={styles.emptyTitle}>{t(lang, "group.noMessages")}</Text>
            <Text style={styles.emptyDesc}>{t(lang, "group.noMessagesDesc")}</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={listItems}
            renderItem={renderItem}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Input bar — iOS-style */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
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
              style={[styles.sendBtn, !hasText && styles.sendBtnDisabled]}
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
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },
  keyboardView: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: group.cardBorder,
    backgroundColor: group.bg,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
  },

  // Center states (loading, error, empty)
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

  // Bubbles — iOS Messages style
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

// ── Default export wrapped in ErrorBoundary ──────────────────────────────────

export default function GroupMessagesScreen() {
  return (
    <ErrorBoundary>
      <GroupMessagesScreenInner />
    </ErrorBoundary>
  );
}
