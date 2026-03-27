// =============================================================================
// Group Portal — Documents Tab (File Manager-style cards + download)
// =============================================================================

import { View, Text, FlatList, Pressable, StyleSheet, Linking, RefreshControl, Alert, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { group, fontSize, radius, spacing, shadow, letterSpacing } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import type { IconName } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { GroupDocumentData } from "@/lib/types";
import { useCallback, useState } from "react";
import { useScalePress, useSlideUp } from "@/lib/animations";

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

// ── File type icon + color mapping ────────────────────────────────────────────

const FILE_TYPE_CONFIG: Record<string, { icon: IconName; bg: string; fg: string }> = {
  "application/pdf": { icon: "document-text-outline", bg: "#fee2e2", fg: "#dc2626" },
  "image/jpeg": { icon: "image-outline", bg: "#dbeafe", fg: "#2563eb" },
  "image/png": { icon: "image-outline", bg: "#dbeafe", fg: "#2563eb" },
  "image/webp": { icon: "image-outline", bg: "#dbeafe", fg: "#2563eb" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { icon: "grid-outline", bg: "#dcfce7", fg: "#16a34a" },
  "application/vnd.ms-excel": { icon: "grid-outline", bg: "#dcfce7", fg: "#16a34a" },
  "text/csv": { icon: "grid-outline", bg: "#dcfce7", fg: "#16a34a" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { icon: "create-outline", bg: "#dbeafe", fg: "#2563eb" },
  "application/msword": { icon: "create-outline", bg: "#dbeafe", fg: "#2563eb" },
  "application/zip": { icon: "archive-outline", bg: "#fef3c7", fg: "#d97706" },
  "text/plain": { icon: "reader-outline", bg: "#f1f5f9", fg: "#475569" },
};

const DEFAULT_FILE_CONFIG = { icon: "attach-outline" as IconName, bg: "#f1f5f9", fg: "#64748b" };

function getFileConfig(fileType: string) {
  return FILE_TYPE_CONFIG[fileType] ?? DEFAULT_FILE_CONFIG;
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Staggered card animation ──────────────────────────────────────────────────

function AnimatedDocCard({
  doc,
  index,
  lang,
  onDownload,
}: {
  doc: GroupDocumentData;
  index: number;
  lang: "pl" | "en";
  onDownload: (doc: GroupDocumentData) => void;
}) {
  const slideStyle = useSlideUp(index * 60, 16);
  const { scaleStyle, onPressIn, onPressOut } = useScalePress(0.98);
  const config = getFileConfig(doc.fileType);

  const sizeStr = formatFileSize(doc.fileSize);
  const dateStr = new Date(doc.createdAt).toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const metaParts = [sizeStr, dateStr].filter(Boolean).join(" \u00B7 ");

  return (
    <Animated.View style={[slideStyle, scaleStyle]}>
      <Pressable
        style={styles.docCard}
        onPress={() => onDownload(doc)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${t(lang, "group.tab.documents")}: ${doc.title}`}
      >
        {/* File type icon circle */}
        <View style={[styles.fileIconCircle, { backgroundColor: config.bg }]}>
          <Icon name={config.icon} size={22} color={config.fg} />
        </View>

        {/* File info */}
        <View style={styles.docInfo}>
          <Text style={styles.docTitle} numberOfLines={1}>{doc.title}</Text>
          {metaParts ? (
            <Text style={styles.docMeta}>{metaParts}</Text>
          ) : null}
        </View>

        {/* Download button */}
        <Pressable
          style={styles.downloadBtn}
          onPress={() => onDownload(doc)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Download ${doc.title}`}
        >
          <Icon name="download-outline" size={20} color={group.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const headerSlide = useSlideUp(0, 12);

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
    } else {
      Alert.alert(t(lang, "auth.error"), t(lang, "common.error"));
    }
  }, [lang]);

  const docCount = documents?.length ?? 0;

  const renderDocument = useCallback(({ item: doc, index }: { item: GroupDocumentData; index: number }) => {
    return (
      <AnimatedDocCard
        doc={doc}
        index={index}
        lang={lang}
        onDownload={handleDownload}
      />
    );
  }, [lang, handleDownload]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      {/* Header */}
      <Animated.View style={[styles.header, headerSlide]}>
        <Text style={styles.title}>{t(lang, "group.tab.documents")}</Text>
        {docCount > 0 && (
          <Text style={styles.count}>
            {docCount} {t(lang, "group.documentsCount")}
          </Text>
        )}
      </Animated.View>

      <FlatList
        data={documents ?? []}
        renderItem={renderDocument}
        keyExtractor={(d) => d.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={group.primary} />}
        ListEmptyComponent={
          isError ? (
            <View style={styles.emptyContainer}>
              <Icon name="cloud-offline-outline" size={48} color={group.textMuted} />
              <Text style={styles.emptyTitle}>{t(lang, "common.error")}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => refetch()}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "common.retry")}
              >
                <Text style={styles.retryBtnText}>{t(lang, "common.retry")}</Text>
              </Pressable>
            </View>
          ) : isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyDesc}>{t(lang, "common.loading")}</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Icon name="document-text-outline" size={48} color={group.textMuted} />
              <Text style={styles.emptyTitle}>{t(lang, "group.noDocuments")}</Text>
              <Text style={styles.emptyDesc}>{t(lang, "group.noDocumentsDesc")}</Text>
            </View>
          )
        }
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },

  // Header
  header: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
  },
  count: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },

  // List
  list: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },

  // Document card
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    minHeight: 72,
    ...shadow.sm,
  },

  // File type icon
  fileIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  // Doc info
  docInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  docTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    lineHeight: 21,
  },
  docMeta: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    lineHeight: 16,
  },

  // Download button
  downloadBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: group.inputBg,
  },

  // Empty states
  emptyContainer: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing["4xl"],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    marginTop: spacing.sm,
  },
  emptyDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 18,
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
    marginTop: spacing.sm,
  },
  retryBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
});
