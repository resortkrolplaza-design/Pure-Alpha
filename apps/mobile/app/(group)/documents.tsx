// =============================================================================
// Group Portal — Documents Tab (File list + download)
// =============================================================================

import { View, Text, FlatList, Pressable, StyleSheet, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import { group, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { GroupDocumentData } from "@/lib/types";
import { useCallback } from "react";

const FILE_ICONS: Record<string, string> = {
  "application/pdf": "📄",
  "image/jpeg": "🖼️",
  "image/png": "🖼️",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📝",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = ""; // from auth

  const { data: documents, isLoading } = useQuery({
    queryKey: ["group-documents", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<GroupDocumentData[]>(trackingId, "/documents");
      return res.data ?? [];
    },
    enabled: !!trackingId,
  });

  const handleDownload = useCallback((doc: GroupDocumentData) => {
    if (doc.fileUrl) Linking.openURL(doc.fileUrl);
  }, []);

  const renderDocument = useCallback(({ item: doc }: { item: GroupDocumentData }) => {
    const icon = FILE_ICONS[doc.fileType] ?? "📎";
    return (
      <Pressable
        style={({ pressed }) => [styles.docCard, pressed && styles.docCardPressed]}
        onPress={() => handleDownload(doc)}
        accessibilityRole="button"
        accessibilityLabel={`${t(lang, "group.tab.documents")}: ${doc.title}`}
      >
        <Text style={styles.docIcon}>{icon}</Text>
        <View style={styles.docInfo}>
          <Text style={styles.docTitle} numberOfLines={1}>{doc.title}</Text>
          <Text style={styles.docMeta}>
            {formatFileSize(doc.fileSize)} · {new Date(doc.createdAt).toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB")}
          </Text>
        </View>
        <Text style={styles.downloadIcon}>⬇️</Text>
      </Pressable>
    );
  }, [lang, handleDownload]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
        <Text style={styles.title}>{t(lang, "group.tab.documents")}</Text>
      </Animated.View>

      <FlatList
        data={documents ?? []}
        renderItem={renderDocument}
        keyExtractor={(d) => d.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>{isLoading ? t(lang, "common.loading") : t(lang, "common.noData")}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: group.text },
  list: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  docCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: group.card, borderRadius: radius.lg, borderWidth: 1, borderColor: group.cardBorder,
    padding: spacing.lg, gap: spacing.md, ...shadow.sm, minHeight: 44,
  },
  docCardPressed: { opacity: 0.7 },
  docIcon: { fontSize: 28 },
  docInfo: { flex: 1, gap: 2 },
  docTitle: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: group.text },
  docMeta: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: group.textMuted },
  downloadIcon: { fontSize: 18 },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, textAlign: "center", paddingVertical: spacing["3xl"] },
});
