// =============================================================================
// Group Portal — Documents Tab (File Manager-style cards + download)
// Features: category badges, organizer add-document modal, FAB
// =============================================================================

import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Linking,
  RefreshControl,
  Alert,
  Animated,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { group, semantic, fontSize, radius, spacing, shadow, letterSpacing, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import type { IconName } from "@/lib/icons";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch, addDocument } from "@/lib/group-api";
import type { GroupDocumentData } from "@/lib/types";
import { useCallback, useState } from "react";
import { useScalePress, useSlideUp } from "@/lib/animations";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

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

// ── Category config ──────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  "offer",
  "calculation",
  "contract",
  "invoice",
  "menu",
  "program",
  "other",
] as const;

type DocCategory = (typeof CATEGORY_OPTIONS)[number];

const CATEGORY_COLORS: Record<string, { bg: string; fg: string }> = {
  offer: { bg: "#dbeafe", fg: "#2563eb" },
  calculation: { bg: "#fef3c7", fg: "#d97706" },
  contract: { bg: "#ede9fe", fg: "#7c3aed" },
  invoice: { bg: "#dcfce7", fg: "#16a34a" },
  menu: { bg: "#fce7f3", fg: "#db2777" },
  program: { bg: "#e0e7ff", fg: "#4338ca" },
  other: { bg: "#f1f5f9", fg: "#475569" },
};

function getCategoryStyle(category: string) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
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

// ── Add Document Modal (organizer only) ──────────────────────────────────────

function AddDocumentModal({
  visible,
  lang,
  trackingId,
  onClose,
  onAdded,
}: {
  visible: boolean;
  lang: Lang;
  trackingId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocCategory>("other");
  const [fileUrl, setFileUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setTitle("");
    setCategory("other");
    setFileUrl("");
  }, []);

  const handleClose = useCallback(() => {
    if (saving) return;
    resetForm();
    onClose();
  }, [saving, resetForm, onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    const trimmedUrl = fileUrl.trim();

    if (!trimmedTitle) {
      Alert.alert(t(lang, "auth.error"), t(lang, "doc.titleRequired"));
      return;
    }
    if (!trimmedUrl) {
      Alert.alert(t(lang, "auth.error"), t(lang, "doc.urlRequired"));
      return;
    }
    if (!trimmedUrl.startsWith("https://")) {
      Alert.alert(t(lang, "auth.error"), t(lang, "doc.urlInvalid"));
      return;
    }

    setSaving(true);
    try {
      const res = await addDocument(trackingId, {
        title: trimmedTitle,
        category,
        url: trimmedUrl,
        fileName: trimmedTitle,
        fileType: "application/octet-stream",
        fileSize: 0,
      });
      if (res.status === "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        resetForm();
        onAdded();
        onClose();
      } else {
        Alert.alert(t(lang, "auth.error"), res.errorMessage ?? t(lang, "doc.addError"));
      }
    } catch {
      Alert.alert(t(lang, "auth.error"), t(lang, "doc.addError"));
    } finally {
      setSaving(false);
    }
  }, [title, fileUrl, category, trackingId, lang, resetForm, onAdded, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Modal header */}
        <View style={styles.modalHeader}>
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "common.cancel")}
            style={styles.modalHeaderBtn}
          >
            <Text style={styles.modalCancelText}>{t(lang, "common.cancel")}</Text>
          </Pressable>
          <Text style={styles.modalTitle}>{t(lang, "doc.addDocument")}</Text>
          <View style={styles.modalHeaderBtn} />
        </View>

        <ScrollView
          style={styles.modalBody}
          contentContainerStyle={styles.modalBodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <Text style={styles.fieldLabel}>{t(lang, "doc.titleLabel")}</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder={t(lang, "doc.titlePlaceholder")}
            placeholderTextColor={group.textMuted}
            maxLength={200}
            autoFocus
            returnKeyType="next"
            accessibilityLabel={t(lang, "doc.titleLabel")}
          />

          {/* Category */}
          <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
            {t(lang, "doc.categoryLabel")}
          </Text>
          <View style={styles.categoryGrid}>
            {CATEGORY_OPTIONS.map((cat) => {
              const isSelected = cat === category;
              const catStyle = getCategoryStyle(cat);
              return (
                <Pressable
                  key={cat}
                  style={[
                    styles.categoryChip,
                    { backgroundColor: isSelected ? catStyle.bg : group.inputBg },
                    isSelected && { borderColor: catStyle.fg, borderWidth: 1.5 },
                  ]}
                  onPress={() => setCategory(cat)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={t(lang, `doc.category.${cat}`)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: isSelected ? catStyle.fg : group.textMuted },
                    ]}
                  >
                    {t(lang, `doc.category.${cat}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* File URL */}
          <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
            {t(lang, "doc.fileUrlLabel")}
          </Text>
          <TextInput
            style={styles.textInput}
            value={fileUrl}
            onChangeText={setFileUrl}
            placeholder={t(lang, "doc.fileUrlPlaceholder")}
            placeholderTextColor={group.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            accessibilityLabel={t(lang, "doc.fileUrlLabel")}
          />
        </ScrollView>

        {/* Submit button */}
        <View style={styles.modalFooter}>
          <Pressable
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "common.save")}
          >
            {saving ? (
              <ActivityIndicator color={group.white} size="small" />
            ) : (
              <Text style={styles.submitBtnText}>{t(lang, "common.save")}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
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
  lang: Lang;
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

  const catStyle = getCategoryStyle(doc.category);
  const catLabel = t(lang, `doc.category.${doc.category}`) || t(lang, "doc.category.other");

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

        {/* File info + category badge */}
        <View style={styles.docInfo}>
          <Text style={styles.docTitle} numberOfLines={1}>{doc.title}</Text>
          <View style={styles.docMetaRow}>
            {doc.category ? (
              <View style={[styles.categoryBadge, { backgroundColor: catStyle.bg }]}>
                <Text style={[styles.categoryBadgeText, { color: catStyle.fg }]}>
                  {catLabel}
                </Text>
              </View>
            ) : null}
            {metaParts ? (
              <Text style={styles.docMeta}>{metaParts}</Text>
            ) : null}
          </View>
        </View>

        {/* Download button */}
        <Pressable
          style={styles.downloadBtn}
          onPress={() => onDownload(doc)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${t(lang, "common.save")} ${doc.title}`}
        >
          <Icon name="download-outline" size={20} color={group.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function DocumentsContent({ embedded }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const portalRole = useAppStore((s) => s.portalRole);
  const isOrganizer = portalRole === "organizer";
  const headerSlide = useSlideUp(0, 12);
  const queryClient = useQueryClient();

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

  const [addModalVisible, setAddModalVisible] = useState(false);

  const handleDownload = useCallback((doc: GroupDocumentData) => {
    if (doc.fileUrl && isUrlAllowed(doc.fileUrl)) {
      Linking.openURL(doc.fileUrl);
    } else {
      Alert.alert(t(lang, "auth.error"), t(lang, "common.error"));
    }
  }, [lang]);

  const handleDocumentAdded = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["group-documents", trackingId] });
  }, [queryClient, trackingId]);

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
    <View style={[styles.container, !embedded && { paddingTop: insets.top + 20 }]}>
      {/* Header (hidden when embedded in hub) */}
      {!embedded && (
        <Animated.View style={[styles.header, headerSlide]}>
          <Text style={styles.title}>{t(lang, "group.tab.documents")}</Text>
          {docCount > 0 && (
            <Text style={styles.count}>
              {docCount} {t(lang, "group.documentsCount")}
            </Text>
          )}
        </Animated.View>
      )}

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

      {/* FAB: Add Document (organizer only) */}
      {isOrganizer && (
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 80 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setAddModalVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "doc.addDocument")}
        >
          <Icon name="add" size={28} color={group.white} />
        </Pressable>
      )}

      {/* Add Document Modal */}
      <AddDocumentModal
        visible={addModalVisible}
        lang={lang}
        trackingId={trackingId}
        onClose={() => setAddModalVisible(false)}
        onAdded={handleDocumentAdded}
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
  docMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  docMeta: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    lineHeight: 16,
  },

  // Category badge (on card)
  categoryBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 14,
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

  // FAB
  fab: {
    position: "absolute",
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: group.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.lg,
  },

  // ── Modal ──
  modalContainer: {
    flex: 1,
    backgroundColor: group.bg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: group.cardBorder,
  },
  modalHeaderBtn: {
    minWidth: 60,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  modalCancelText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.primary,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    padding: spacing.xl,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    marginBottom: spacing.xs,
  },
  textInput: {
    backgroundColor: group.inputBg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    minHeight: TOUCH_TARGET,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  categoryChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  categoryChipText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
  },
  modalFooter: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: group.cardBorder,
  },
  submitBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
});

// ── Default export wrapped in ErrorBoundary ──────────────────────────────────

export default function DocumentsScreen() {
  return (
    <ErrorBoundary>
      <DocumentsContent />
    </ErrorBoundary>
  );
}
