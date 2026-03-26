// =============================================================================
// Group Portal — Documents Tab (File list + download)
// =============================================================================

import { View, Text, FlatList, Pressable, StyleSheet, Linking, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { group, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import type { IconName } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { GroupDocumentData } from "@/lib/types";
import { useCallback, useState } from "react";

// SSRF protection: only allow downloads from trusted domains
const ALLOWED_HOSTS = ["purealphahotel.pl", "supabase.co", "supabase.in"];

function isUrlAllowed(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    return url.protocol === "https:" && ALLOWED_HOSTS.some(h => url.hostname === h || url.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

const FILE_ICONS: Record<string, IconName> = {
  "application/pdf": "document-text-outline",
  "image/jpeg": "image-outline",
  "image/png": "image-outline",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "bar-chart-outline",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "create-outline",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";

  const { data: documents, isLoading, isError, refetch } = useQuery({
    queryKey: ["group-documents", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<GroupDocumentData[]>(trackingId, "/documents");
      return res.data ?? [];
    },
    enabled: !!trackingId,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDownload = useCallback((doc: GroupDocumentData) => {
    if (doc.fileUrl && isUrlAllowed(doc.fileUrl)) {
      Linking.openURL(doc.fileUrl);
    }
  }, []);

  const renderDocument = useCallback(({ item: doc }: { item: GroupDocumentData }) => {
    const iconName = FILE_ICONS[doc.fileType] ?? "attach-outline";
    return (
      <Pressable
        style={({ pressed }) => [styles.docCard, pressed && styles.docCardPressed]}
        onPress={() => handleDownload(doc)}
        accessibilityRole="button"
        accessibilityLabel={`${t(lang, "group.tab.documents")}: ${doc.title}`}
      >
        <Icon name={iconName} size={28} color={group.primary} />
        <View style={styles.docInfo}>
          <Text style={styles.docTitle} numberOfLines={1}>{doc.title}</Text>
          <Text style={styles.docMeta}>
            {formatFileSize(doc.fileSize)} · {new Date(doc.createdAt).toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB")}
          </Text>
        </View>
        <Icon name="download-outline" size={18} color={group.textMuted} />
      </Pressable>
    );
  }, [lang, handleDownload]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t(lang, "group.tab.documents")}</Text>
      </View>

      <FlatList
        data={documents ?? []}
        renderItem={renderDocument}
        keyExtractor={(d) => d.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={group.primary} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isLoading ? t(lang, "common.loading") : isError ? t(lang, "common.error") : t(lang, "common.noData")}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: group.text, letterSpacing: -0.3 },
  list: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  docCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: group.card, borderRadius: radius.lg, borderWidth: 1, borderColor: group.cardBorder,
    padding: spacing.lg, gap: spacing.md, ...shadow.sm, minHeight: 44,
  },
  docCardPressed: { opacity: 0.7 },
  docInfo: { flex: 1, gap: 2 },
  docTitle: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: group.text, lineHeight: 21 },
  docMeta: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: group.textMuted },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, textAlign: "center", paddingVertical: spacing["3xl"], lineHeight: 18 },
});
