// =============================================================================
// Group Portal — Messages (Chat with organizer/participants)
// =============================================================================

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { group, fontSize, radius, spacing } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { GroupMessage } from "@/lib/types";

const POLL_INTERVAL = 10_000;

export default function GroupMessagesScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const { data: msgData, isLoading } = useQuery({
    queryKey: ["group-messages", trackingId],
    queryFn: async () => {
      if (!trackingId) return { replies: [] };
      const res = await groupFetch<{ replies: GroupMessage[] }>(trackingId, "/messages");
      return res.data ?? { replies: [] };
    },
    enabled: !!trackingId,
    refetchInterval: POLL_INTERVAL,
  });

  const messages = useMemo(() => [...(msgData?.replies ?? [])].reverse(), [msgData]);

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
      Alert.alert(t(lang, "auth.error"), err instanceof Error ? err.message : t(lang, "messages.sendFailed"));
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const renderMessage = useCallback(({ item: msg }: { item: GroupMessage }) => {
    const isOrg = msg.isOrganizer;
    return (
      <View style={[styles.msgRow, isOrg && styles.msgRowOrg]}>
        <View style={[styles.msgBubble, isOrg ? styles.bubbleOrg : styles.bubbleParticipant]}>
          {msg.sender.firstName && (
            <Text style={[styles.msgSender, isOrg && styles.msgSenderOrg]}>
              {[msg.sender.firstName, msg.sender.lastName].filter(Boolean).join(" ")}
            </Text>
          )}
          <Text style={[styles.msgText, isOrg && styles.msgTextOrg]}>{msg.body}</Text>
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
          <Pressable
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "messages.send")}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },
  keyboardView: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: 0.5, borderBottomColor: group.cardBorder },
  title: { fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: group.text },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted },
  listContent: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  msgRow: { alignItems: "flex-start", maxWidth: "80%" },
  msgRowOrg: { alignSelf: "flex-end", alignItems: "flex-end" },
  msgBubble: { borderRadius: radius.lg, padding: spacing.md },
  bubbleOrg: { backgroundColor: group.primary, borderBottomRightRadius: 4 },
  bubbleParticipant: { backgroundColor: group.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: group.cardBorder },
  msgSender: { fontSize: fontSize.xs, fontFamily: "Inter_600SemiBold", color: group.primary, marginBottom: 2 },
  msgSenderOrg: { color: "rgba(255,255,255,0.7)" },
  msgText: { fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: group.text, lineHeight: 20 },
  msgTextOrg: { color: "#FFFFFF" },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", color: group.textMuted, marginTop: 4, alignSelf: "flex-end" },
  msgTimeOrg: { color: "rgba(255,255,255,0.6)" },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm,
    borderTopWidth: 0.5, borderTopColor: group.cardBorder, backgroundColor: "rgba(255,255,255,0.95)",
  },
  input: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 1, borderColor: group.cardBorder,
    borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: 10,
    fontSize: fontSize.base, fontFamily: "Inter_400Regular", color: group.text, maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: group.primary, alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "rgba(0,0,0,0.08)" },
  sendBtnText: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
});
