// =============================================================================
// Group Portal — Messages (Chat with organizer/participants)
// =============================================================================

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { group, fontSize, radius, spacing } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useScalePress } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { GroupMessage } from "@/lib/types";

// P1-17: Strip bidi control characters to prevent XSS text spoofing
function stripBidiChars(str: string): string {
  return str.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");
}

const POLL_INTERVAL = 10_000;

export default function GroupMessagesScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const { scaleStyle, onPressIn, onPressOut } = useScalePress();

  const { data: msgData, isLoading, isError, refetch } = useQuery({
    queryKey: ["group-messages", trackingId],
    queryFn: async () => {
      if (!trackingId) return { replies: [], anchorMessage: null };
      const res = await groupFetch<{ replies: GroupMessage[]; anchorMessage: GroupMessage | null; unreadCount?: number }>(trackingId, "/messages");
      return res.data ?? { replies: [], anchorMessage: null };
    },
    enabled: !!trackingId,
    refetchInterval: POLL_INTERVAL,
  });

  const messages = useMemo(() => {
    const replies = [...(msgData?.replies ?? [])].reverse();
    if (msgData?.anchorMessage) {
      return [msgData.anchorMessage, ...replies];
    }
    return replies;
  }, [msgData]);

  // Track previous message count to only auto-scroll when new messages arrive
  const prevCountRef = useRef(0);

  useEffect(() => {
    const count = messages.length;
    if (count > prevCountRef.current) {
      flatListRef.current?.scrollToEnd({ animated: count - prevCountRef.current <= 2 });
    }
    prevCountRef.current = count;
  }, [messages.length]);

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
      Alert.alert(t(lang, "common.error"), err instanceof Error ? err.message : t(lang, "messages.sendFailed"));
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const renderMessage = useCallback(({ item: msg }: { item: GroupMessage }) => {
    const isOrg = msg.isOrganizer;
    // P1-17: Strip bidi chars from user-generated content
    const safeFirstName = msg.sender.firstName ? stripBidiChars(msg.sender.firstName) : null;
    const safeLastName = msg.sender.lastName ? stripBidiChars(msg.sender.lastName) : null;
    const safeBody = stripBidiChars(msg.body);
    return (
      <View style={[styles.msgRow, isOrg && styles.msgRowOrg]}>
        <View style={[styles.msgBubble, isOrg ? styles.bubbleOrg : styles.bubbleParticipant]}>
          {safeFirstName && (
            <Text style={[styles.msgSender, isOrg && styles.msgSenderOrg]}>
              {[safeFirstName, safeLastName].filter(Boolean).join(" ")}
            </Text>
          )}
          <Text style={[styles.msgText, isOrg && styles.msgTextOrg]}>{safeBody}</Text>
          <Text style={[styles.msgTime, isOrg && styles.msgTimeOrg]}>
            {new Date(msg.createdAt).toLocaleTimeString(lang === "pl" ? "pl-PL" : "en-GB", {
              hour: "2-digit", minute: "2-digit",
            })}
          </Text>
        </View>
      </View>
    );
  }, [lang]);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>{t(lang, "group.tab.messages")}</Text>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={group.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>{t(lang, "common.error")}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => refetch()}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.retry")}
            >
              <Text style={styles.retryBtnText}>{t(lang, "common.retry")}</Text>
            </Pressable>
          </View>
        ) : !messages.length ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>{t(lang, "messages.empty")}</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            placeholder={t(lang, "messages.placeholder")}
            placeholderTextColor={group.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
          />
          <Animated.View style={scaleStyle}>
            <Pressable
              style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              disabled={!text.trim() || sendMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "messages.send")}
            >
              <Icon name="arrow-up" size={20} color={group.white} />
            </Pressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },
  keyboardView: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: 0.5, borderBottomColor: group.cardBorder },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: group.text },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, lineHeight: 18 },
  listContent: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  msgRow: { alignItems: "flex-start", maxWidth: "80%" },
  msgRowOrg: { alignSelf: "flex-end", alignItems: "flex-end" },
  msgBubble: { borderRadius: radius.lg, padding: spacing.md },
  bubbleOrg: { backgroundColor: group.primary, borderBottomRightRadius: 4 },
  bubbleParticipant: { backgroundColor: group.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: group.cardBorder },
  msgSender: { fontSize: fontSize.xs, fontFamily: "Inter_600SemiBold", color: group.primary, marginBottom: 2 },
  msgSenderOrg: { color: group.overlayWhite70 },
  msgText: { fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: group.text, lineHeight: 21 },
  msgTextOrg: { color: group.white },
  msgTime: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: group.textMuted, marginTop: 4, alignSelf: "flex-end" },
  msgTimeOrg: { color: group.overlayWhite60 },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm,
    borderTopWidth: 0.5, borderTopColor: group.cardBorder, backgroundColor: group.overlayWhite70,
  },
  input: {
    flex: 1, backgroundColor: group.inputBg, borderWidth: 1, borderColor: group.cardBorder,
    borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: 10,
    fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: group.text, maxHeight: 120, minHeight: 44, lineHeight: 21,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: group.primary, alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: group.disabledBg },
  retryBtn: {
    backgroundColor: group.primary, borderRadius: radius.full,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xl,
    minHeight: 44, justifyContent: "center", alignItems: "center", marginTop: spacing.md,
  },
  retryBtnText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: group.white },
});
