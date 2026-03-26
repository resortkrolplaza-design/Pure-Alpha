// =============================================================================
// Guest Portal — Messages Tab (Chat with hotel staff)
// =============================================================================

import { useState, useRef, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { NAVY, NAVY_LIGHT, GOLD, guest, fontSize, radius, spacing } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { portalFetch } from "@/lib/api";
import type { Message } from "@/lib/types";

const POLL_INTERVAL = 15_000;

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const portalToken = useAppStore((s) => s.portalToken);
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["messages", portalToken],
    queryFn: async () => {
      if (!portalToken) return [];
      const res = await portalFetch<{ messages: Message[] }>(portalToken, "/messages?limit=50");
      return res.data?.messages ?? [];
    },
    enabled: !!portalToken,
    refetchInterval: POLL_INTERVAL,
  });

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!portalToken) throw new Error("No token");
      const res = await portalFetch<{ message: Message }>(portalToken, "/messages", {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      if (res.status !== "success") throw new Error(res.errorMessage || "Send failed");
      return res.data?.message;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      setText("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  // Reversed list — newest at bottom (memoized to avoid re-sort on every render)
  const sortedMessages = useMemo(() => [...(messages ?? [])].reverse(), [messages]);

  const renderMessage = useCallback(({ item: msg }: { item: Message }) => {
    const isMe = msg.isGuest;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowRight]}>
        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMine : styles.msgBubbleTheirs]}>
          {!isMe && msg.sender.firstName && (
            <Text style={styles.msgSender}>
              {[msg.sender.firstName, msg.sender.lastName].filter(Boolean).join(" ")}
            </Text>
          )}
          <Text style={[styles.msgText, isMe && styles.msgTextMine]}>{msg.body}</Text>
          <Text style={[styles.msgTime, isMe && styles.msgTimeMine]}>
            {new Date(msg.createdAt).toLocaleTimeString(lang === "pl" ? "pl-PL" : "en-GB", {
              hour: "2-digit", minute: "2-digit",
            })}
          </Text>
        </View>
      </View>
    );
  }, [lang]);

  return (
    <LinearGradient colors={[NAVY, NAVY_LIGHT, NAVY]} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>{t(lang, "messages.title")}</Text>
        </View>

        {/* Messages */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={GOLD} />
          </View>
        ) : !sortedMessages.length ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>{t(lang, "messages.empty")}</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={sortedMessages}
            renderItem={renderMessage}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input Bar */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            placeholder={t(lang, "messages.placeholder")}
            placeholderTextColor={guest.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "messages.send")}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator color={NAVY} size="small" />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: 0.5, borderBottomColor: guest.glassBorder },
  title: { fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: guest.text },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textMuted, textAlign: "center" },
  listContent: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  msgRow: { alignItems: "flex-start", maxWidth: "80%" },
  msgRowRight: { alignSelf: "flex-end", alignItems: "flex-end" },
  msgBubble: { borderRadius: radius.lg, padding: spacing.md, maxWidth: "100%" },
  msgBubbleMine: { backgroundColor: GOLD, borderBottomRightRadius: 4 },
  msgBubbleTheirs: { backgroundColor: guest.glass, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: guest.glassBorder },
  msgSender: { fontSize: fontSize.xs, fontFamily: "Inter_600SemiBold", color: GOLD, marginBottom: 2 },
  msgText: { fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: guest.text, lineHeight: 20 },
  msgTextMine: { color: NAVY },
  msgTime: { fontSize: fontSize.xs - 1, fontFamily: "Inter_400Regular", color: guest.textMuted, marginTop: 4, alignSelf: "flex-end" },
  msgTimeMine: { color: "rgba(13,34,54,0.5)" },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm,
    borderTopWidth: 0.5, borderTopColor: guest.glassBorder,
    backgroundColor: "rgba(13,34,54,0.8)",
  },
  input: {
    flex: 1, backgroundColor: guest.inputBg, borderWidth: 1, borderColor: guest.inputBorder,
    borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: 10,
    fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: guest.text,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: GOLD, alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: guest.glass },
  sendBtnText: { fontSize: 20, fontFamily: "Inter_700Bold", color: NAVY },
});
