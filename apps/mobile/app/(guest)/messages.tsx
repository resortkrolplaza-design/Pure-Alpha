// =============================================================================
// Guest Portal -- Messages Tab (Chat with hotel staff)
// =============================================================================

import { useState, useRef, useCallback } from "react";
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { NAVY, NAVY_LIGHT, GOLD, guest, fontSize, radius, spacing } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { useScalePress } from "@/lib/animations";
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

  const { scaleStyle: sendScale, onPressIn: sendPressIn, onPressOut: sendPressOut } = useScalePress();

  // P0-1.2: Fix response shape -- backend returns { messages, hasMore } wrapped in ApiResponse.data
  const { data: messages, isLoading, isError, refetch } = useQuery({
    queryKey: ["messages", portalToken],
    queryFn: async () => {
      if (!portalToken) return [];
      const res = await portalFetch<{ messages: Message[]; hasMore: boolean }>(portalToken, "/messages?limit=50");
      // Handle BOTH shapes for robustness (flat array OR wrapped object)
      return (res.data as any)?.messages ?? res.data ?? [];
    },
    enabled: !!portalToken,
    refetchInterval: POLL_INTERVAL,
  });

  // P0-1.2: Fix POST -- backend returns flat Message in res.data, not res.data?.message
  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!portalToken) throw new Error("No token");
      const res = await portalFetch<Message>(portalToken, "/messages", {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      if (res.status !== "success") throw new Error(res.errorMessage || "Send failed");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      setText("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    // P1-14: Add error handling for send mutation
    onError: () => {
      Alert.alert(t(lang, "auth.error"), t(lang, "messages.sendFailed"));
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

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
        ) : isError ? (
          // P1-14: Error state with retry
          <View style={styles.center}>
            <Text style={styles.emptyText}>{t(lang, "messages.errorLoading")}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => refetch()}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.retry")}
            >
              <Text style={styles.retryBtnText}>{t(lang, "common.retry")}</Text>
            </Pressable>
          </View>
        ) : !(messages ?? []).length ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>{t(lang, "messages.empty")}</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages ?? []}
            renderItem={renderMessage}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            inverted
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
          <Animated.View style={sendScale}>
            <Pressable
              style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              onPressIn={sendPressIn}
              onPressOut={sendPressOut}
              disabled={!text.trim() || sendMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "messages.send")}
            >
              {sendMutation.isPending ? (
                <ActivityIndicator color={NAVY} size="small" />
              ) : (
                <Icon name="arrow-up" size={20} color={NAVY} />
              )}
            </Pressable>
          </Animated.View>
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textMuted, textAlign: "center" },
  retryBtn: {
    backgroundColor: GOLD, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, minHeight: 44,
    alignItems: "center", justifyContent: "center",
  },
  retryBtnText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: NAVY },
  listContent: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  msgRow: { alignItems: "flex-start", maxWidth: "80%" },
  msgRowRight: { alignSelf: "flex-end", alignItems: "flex-end" },
  msgBubble: { borderRadius: radius.lg, padding: spacing.md, maxWidth: "100%" },
  msgBubbleMine: { backgroundColor: GOLD, borderBottomRightRadius: 4 },
  msgBubbleTheirs: { backgroundColor: guest.glass, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: guest.glassBorder },
  msgSender: { fontSize: fontSize.xs, fontFamily: "Inter_600SemiBold", color: GOLD, marginBottom: 2 },
  msgText: { fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: guest.text, lineHeight: 21 },
  msgTextMine: { color: NAVY },
  // P2-10: Fix timestamp font size -- use fontSize.xs without subtracting 1
  msgTime: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: guest.textMuted, marginTop: 4, alignSelf: "flex-end" },
  msgTimeMine: { color: guest.msgTimeMine },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm,
    borderTopWidth: 0.5, borderTopColor: guest.glassBorder,
    backgroundColor: guest.inputBarBg,
  },
  input: {
    flex: 1, backgroundColor: guest.inputBg, borderWidth: 1, borderColor: guest.inputBorder,
    borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: 10,
    fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: guest.text,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: radius.full,
    backgroundColor: GOLD, alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: guest.glass },
});
