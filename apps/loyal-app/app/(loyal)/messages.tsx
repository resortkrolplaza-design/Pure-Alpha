// =============================================================================
// Loyal App -- Messages Tab
// Chat with hotel: polling, inverted FlatList, message bubbles, date separators
// =============================================================================

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  AppState,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { loyal, fontSize, radius, spacing, shadow, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchMessages, sendMessage } from "@/lib/loyal-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { MessageData } from "@/lib/types";

const POLL_INTERVAL_MS = 15_000;

// -- Date helpers -------------------------------------------------------------

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

function formatDateSeparator(dateStr: string, lang: "pl" | "en"): string {
  const d = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(dateStr, now.toISOString())) {
    return t(lang, "msg.today");
  }
  if (isSameDay(dateStr, yesterday.toISOString())) {
    return t(lang, "msg.yesterday");
  }

  return d.toLocaleDateString(lang === "pl" ? "pl-PL" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// -- Flattened list item types ------------------------------------------------

interface MessageItem {
  type: "message";
  data: MessageData;
}

interface DateSeparatorItem {
  type: "date";
  date: string;
  label: string;
}

type ListItem = MessageItem | DateSeparatorItem;

function buildListItems(
  messages: MessageData[],
  lang: "pl" | "en",
): ListItem[] {
  // Messages sorted newest-first (for inverted FlatList)
  const sorted = [...messages].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const items: ListItem[] = [];
  let lastDateGroup = "";

  for (const msg of sorted) {
    const dateKey = new Date(msg.createdAt).toISOString().slice(0, 10);

    // In inverted list, date separator goes AFTER messages of that day
    // (which means it appears ABOVE them visually)
    if (dateKey !== lastDateGroup) {
      if (lastDateGroup !== "") {
        items.push({
          type: "date",
          date: lastDateGroup,
          label: formatDateSeparator(
            sorted.find(
              (m) => m.createdAt.startsWith(lastDateGroup),
            )?.createdAt ?? "",
            lang,
          ),
        });
      }
      lastDateGroup = dateKey;
    }

    items.push({ type: "message", data: msg });
  }

  // Add the last date separator
  if (lastDateGroup !== "" && sorted.length > 0) {
    const lastMsg = sorted.find((m) => m.createdAt.startsWith(lastDateGroup));
    if (lastMsg) {
      items.push({
        type: "date",
        date: lastDateGroup,
        label: formatDateSeparator(lastMsg.createdAt, lang),
      });
    }
  }

  return items;
}

// -- Date Separator Component -------------------------------------------------

function DateSeparator({ label }: { label: string }) {
  return (
    <View style={styles.dateSeparator}>
      <View style={styles.dateLine} />
      <Text style={styles.dateLabel}>{label}</Text>
      <View style={styles.dateLine} />
    </View>
  );
}

// -- Message Bubble -----------------------------------------------------------

function MessageBubble({
  msg,
  lang,
}: {
  msg: MessageData;
  lang: "pl" | "en";
}) {
  const isGuest = msg.isGuest === true;
  const senderName = [msg.sender?.firstName, msg.sender?.lastName]
    .filter(Boolean)
    .join(" ") || null;

  return (
    <View
      style={[
        styles.bubbleRow,
        isGuest ? styles.bubbleRowGuest : styles.bubbleRowHotel,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isGuest ? styles.bubbleGuest : styles.bubbleHotel,
        ]}
      >
        {!isGuest && senderName && (
          <Text style={styles.senderName}>{senderName}</Text>
        )}
        <Text
          style={[
            styles.bubbleText,
            isGuest ? styles.bubbleTextGuest : styles.bubbleTextHotel,
          ]}
        >
          {msg.body}
        </Text>
        <Text
          style={[
            styles.bubbleTime,
            isGuest ? styles.bubbleTimeGuest : styles.bubbleTimeHotel,
          ]}
        >
          {isGuest ? t(lang, "msg.you") + " " : ""}
          {formatTime(msg.createdAt)}
        </Text>
      </View>
    </View>
  );
}

// -- Empty State --------------------------------------------------------------

function EmptyState({ lang }: { lang: "pl" | "en" }) {
  return (
    <View style={styles.emptyContainer}>
      <Icon name="chatbubble-ellipses-outline" size={48} color={loyal.lightTextMuted} />
      <Text style={styles.emptyTitle}>{t(lang, "msg.emptyTitle")}</Text>
      <Text style={styles.emptyDesc}>{t(lang, "msg.emptyDesc")}</Text>
    </View>
  );
}

// -- Composer Bar -------------------------------------------------------------

function ComposerBar({
  lang,
  onSend,
  isSending,
}: {
  lang: "pl" | "en";
  onSend: (text: string) => void;
  isSending: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setText("");
  }, [text, isSending, onSend]);

  const canSend = text.trim().length > 0 && !isSending;

  return (
    <View
      style={[
        styles.composerContainer,
        { paddingBottom: Math.max(insets.bottom, spacing.md) },
      ]}
    >
      <View style={styles.composerRow}>
        <TextInput
          ref={inputRef}
          style={styles.composerInput}
          value={text}
          onChangeText={setText}
          placeholder={t(lang, "msg.placeholder")}
          placeholderTextColor={loyal.textDim}
          multiline
          maxLength={2000}
          returnKeyType="default"
          accessibilityLabel={t(lang, "msg.textareaLabel")}
        />
        <Pressable
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "msg.sendLabel")}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={loyal.bg} />
          ) : (
            <Icon name="send" size={20} color={canSend ? loyal.bg : loyal.textDim} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

// -- Main Screen ---------------------------------------------------------------

function MessagesScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const tt = (key: string) => t(lang, key);
  const token = useAppStore((s) => s.token);
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);

  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [allMessages, setAllMessages] = useState<MessageData[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const [pollingEnabled, setPollingEnabled] = useState(true);

  // -- AppState listener: pause polling when backgrounded -------------------
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        setPollingEnabled(true);
      } else if (nextState.match(/inactive|background/)) {
        setPollingEnabled(false);
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // -- Main messages query (polling) ----------------------------------------
  const { data: latestData, isLoading } = useQuery<{
    messages: MessageData[];
    nextCursor: string | null;
  }>({
    queryKey: ["messages", token, "latest"],
    queryFn: async () => {
      const res = await fetchMessages(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load messages");
      return res.data;
    },
    enabled: !!token && pollingEnabled,
    refetchInterval: pollingEnabled ? POLL_INTERVAL_MS : false,
  });

  // Merge latest data into allMessages
  useEffect(() => {
    if (!latestData?.messages) return;
    setAllMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const newMsgs = latestData.messages.filter(
        (m) => !existingIds.has(m.id),
      );
      if (newMsgs.length === 0) return prev;
      // Merge and sort by createdAt ascending (newest last)
      const merged = [...prev, ...newMsgs].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      return merged;
    });
    if (latestData.nextCursor && !olderCursor) {
      setOlderCursor(latestData.nextCursor);
      setHasOlder(true);
    }
  }, [latestData, olderCursor]);

  // -- Load older messages --------------------------------------------------
  const handleLoadOlder = useCallback(async () => {
    if (!token || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetchMessages(token, olderCursor, 20);
      if (res.status === "success" && res.data?.messages) {
        setAllMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = res.data!.messages.filter((m) => !existingIds.has(m.id));
          const merged = [...newMsgs, ...prev].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime(),
          );
          return merged;
        });
        setOlderCursor(res.data.nextCursor);
        setHasOlder(!!res.data.nextCursor);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [token, olderCursor, loadingOlder]);

  // -- Send mutation --------------------------------------------------------
  const sendMutation = useMutation<MessageData, Error, string>({
    mutationFn: async (text: string) => {
      const res = await sendMessage(token!, { body: text });
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to send message");
      return res.data;
    },
    onSuccess: (newMsg) => {
      if (newMsg) {
        setAllMessages((prev) => {
          // Avoid duplicates
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime(),
          );
        });
      }
      // Also invalidate the polling query to pick up the new message
      queryClient.invalidateQueries({ queryKey: ["messages", token, "latest"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleSend = useCallback(
    (content: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendMutation.mutate(content);
    },
    [sendMutation],
  );

  // -- Build list items with date separators --------------------------------
  const listItems = useMemo(
    () => buildListItems(allMessages, lang),
    [allMessages, lang],
  );

  const hotelName = useAppStore((s) => s.hotelName);

  // -- Render ---------------------------------------------------------------

  const renderListHeader = () => {
    // In inverted list, "header" appears at the bottom (newer messages side)
    // We don't need anything here
    return null;
  };

  const renderListFooter = () => {
    // In inverted list, "footer" appears at the top (older messages side)
    if (hasOlder) {
      return (
        <Pressable
          style={styles.loadOlderBtn}
          onPress={handleLoadOlder}
          disabled={loadingOlder}
          accessibilityRole="button"
          accessibilityLabel={tt("msg.loadOlder")}
        >
          {loadingOlder ? (
            <ActivityIndicator size="small" color={loyal.primary} />
          ) : (
            <Text style={styles.loadOlderText}>{tt("msg.loadOlder")}</Text>
          )}
        </Pressable>
      );
    }
    return null;
  };

  const getItemKey = (item: ListItem, index: number): string => {
    if (item.type === "date") return `date-${item.date}`;
    return item.data.id;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>{tt("msg.title")}</Text>
        {hotelName && (
          <Text style={styles.headerSubtitle}>
            {tt("msg.chatWith")} {hotelName}
          </Text>
        )}
      </View>

      {/* Messages List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={loyal.primary} />
          <Text style={styles.loadingText}>{tt("msg.loading")}</Text>
        </View>
      ) : allMessages.length === 0 ? (
        <EmptyState lang={lang} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={listItems}
          keyExtractor={getItemKey}
          inverted
          renderItem={({ item }) => {
            if (item.type === "date") {
              return <DateSeparator label={item.label} />;
            }
            return <MessageBubble msg={item.data} lang={lang} />;
          }}
          ListHeaderComponent={renderListHeader}
          ListFooterComponent={renderListFooter}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Composer */}
      <ComposerBar
        lang={lang}
        onSend={handleSend}
        isSending={sendMutation.isPending}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: loyal.contentBg,
  },

  // -- Header -----------------------------------------------------------------
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: loyal.lightCardBorder,
    backgroundColor: loyal.bg,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: loyal.text,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.textSecondary,
    marginTop: spacing.xxs,
  },

  // -- Loading ----------------------------------------------------------------
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
  },

  // -- Empty State ------------------------------------------------------------
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    textAlign: "center",
  },

  // -- Message List -----------------------------------------------------------
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  // -- Date Separator ---------------------------------------------------------
  dateSeparator: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: loyal.lightCardBorder,
  },
  dateLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: loyal.lightTextMuted,
  },

  // -- Message Bubbles --------------------------------------------------------
  bubbleRow: {
    marginBottom: spacing.sm,
  },
  bubbleRowGuest: {
    alignItems: "flex-end",
  },
  bubbleRowHotel: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  bubbleGuest: {
    backgroundColor: loyal.primary,
    borderBottomRightRadius: radius.sm,
  },
  bubbleHotel: {
    backgroundColor: loyal.lightCard,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    borderBottomLeftRadius: radius.sm,
  },
  senderName: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: loyal.primary,
    marginBottom: spacing.xxs,
  },
  bubbleText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  bubbleTextGuest: {
    color: loyal.bg,
  },
  bubbleTextHotel: {
    color: loyal.lightText,
  },
  bubbleTime: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    alignSelf: "flex-end",
  },
  bubbleTimeGuest: {
    color: "rgba(13,34,54,0.5)",
  },
  bubbleTimeHotel: {
    color: loyal.lightTextMuted,
  },

  // -- System Message ---------------------------------------------------------
  systemMessage: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  systemText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextMuted,
    textAlign: "center",
    fontStyle: "italic",
  },

  // -- Load Older Button ------------------------------------------------------
  loadOlderBtn: {
    alignSelf: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: loyal.lightPrimaryFaint,
    borderRadius: radius.full,
    marginVertical: spacing.lg,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
  },
  loadOlderText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: loyal.primary,
  },

  // -- Composer ---------------------------------------------------------------
  composerContainer: {
    borderTopWidth: 1,
    borderTopColor: loyal.lightCardBorder,
    backgroundColor: loyal.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  composerInput: {
    flex: 1,
    backgroundColor: loyal.inputBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.inputBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.text,
    maxHeight: 120,
    minHeight: TOUCH_TARGET,
  },
  sendBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: loyal.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: loyal.inputBg,
  },
});

export default function MessagesScreen() {
  return (
    <ErrorBoundary>
      <MessagesScreenInner />
    </ErrorBoundary>
  );
}
