// =============================================================================
// Employee App -- Documents (view + upload own documents)
// =============================================================================

import { useState, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, RefreshControl,
  StyleSheet, ActivityIndicator, Modal, Alert, Platform,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  emp, fontSize, letterSpacing, radius, spacing, shadow, TOUCH_TARGET,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchDocuments, uploadDocument, deleteDocument } from "@/lib/employee-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

const DOC_TYPES = [
  "BADANIA_LEKARSKIE", "BHP", "HACCP", "SANEPID", "FIRST_AID", "FIRE_SAFETY",
  "UMOWA", "ANEKS", "DOWOD_OSOBISTY", "PESEL", "OSWIADCZENIE_PIT", "KONTO_BANKOWE",
  "CERTIFICATE", "OTHER",
] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  VALID: { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
  EXPIRING_SOON: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" },
  EXPIRED: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
  PENDING: { bg: "rgba(100,116,139,0.1)", text: "#64748b" },
};

interface DocItem {
  id: string;
  documentType: string;
  documentName: string | null;
  expiryDate: string | null;
  fileName: string | null;
  status: string;
  createdAt: string;
}

function DocumentsScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);

  // Upload form state
  const [docType, setDocType] = useState<string>("OTHER");
  const [docName, setDocName] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);

  const { data: documents, isLoading, isError, refetch } = useQuery({
    queryKey: ["employee-documents"],
    queryFn: async () => {
      const res = await fetchDocuments();
      if (res.status !== "success") throw new Error(res.errorMessage || "Blad serwera");
      return (res.data ?? []) as DocItem[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("data", JSON.stringify({
        documentType: docType,
        documentName: docName || undefined,
        expiryDate: expiryDate || undefined,
      }));
      if (selectedFile) {
        fd.append("file", {
          uri: selectedFile.uri,
          name: selectedFile.name,
          type: selectedFile.type,
        } as unknown as Blob);
      }
      return uploadDocument(fd);
    },
    onSuccess: (res) => {
      if (res.status === "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t(lang, "docs.uploadSuccess"));
        queryClient.invalidateQueries({ queryKey: ["employee-documents"] });
        resetForm();
      } else {
        Alert.alert(t(lang, "common.error"), res.errorMessage ?? t(lang, "common.error"));
      }
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t(lang, "common.error"), t(lang, "common.networkError"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: (res) => {
      if (res.status === "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["employee-documents"] });
      } else {
        Alert.alert(t(lang, "common.error"), res.errorMessage ?? t(lang, "common.error"));
      }
    },
  });

  const resetForm = useCallback(() => {
    setShowUploadForm(false);
    setDocType("OTHER");
    setDocName("");
    setExpiryDate("");
    setSelectedFile(null);
    setShowTypePicker(false);
    setShowDatePicker(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const pickFromFiles = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setSelectedFile({ uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream" });
    }
  }, []);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t(lang, "common.error"), t(lang, "scan.permissionDenied"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const name = `scan-${Date.now()}.jpg`;
      setSelectedFile({ uri: asset.uri, name, type: asset.mimeType ?? "image/jpeg" });
    }
  }, [lang]);

  const handlePickFile = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      t(lang, "docs.selectFile"),
      undefined,
      [
        { text: t(lang, "docs.takePhoto"), onPress: takePhoto },
        { text: t(lang, "docs.pickFile"), onPress: pickFromFiles },
        { text: t(lang, "common.cancel"), style: "cancel" },
      ],
    );
  }, [lang, takePhoto, pickFromFiles]);

  const handleDateChange = useCallback((_e: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (date) {
      setExpiryDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t(lang, "docs.deleteConfirm"),
      undefined,
      [
        { text: t(lang, "common.cancel"), style: "cancel" },
        { text: t(lang, "common.confirm"), style: "destructive", onPress: () => deleteMutation.mutate(id) },
      ],
    );
  }, [lang, deleteMutation]);

  const formatDate = (s: string) => {
    try { return new Date(s).toLocaleDateString(lang === "pl" ? "pl-PL" : "en-US", { day: "numeric", month: "short", year: "numeric" }); }
    catch { return s; }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing["6xl"] }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={emp.primary} />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t(lang, "docs.title")}</Text>
          <Pressable
            style={styles.addBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowUploadForm(true); }}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "docs.upload")}
          >
            <Icon name="add" size={20} color={emp.white} />
          </Pressable>
        </View>

        {isLoading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={emp.primary} />
          </View>
        )}

        {isError && (
          <View style={styles.card} accessibilityLiveRegion="polite">
            <Text style={styles.emptyText}>{t(lang, "common.error")}</Text>
            <Pressable onPress={() => refetch()} style={styles.retryBtn} accessibilityRole="button">
              <Text style={styles.retryText}>{t(lang, "common.retry")}</Text>
            </Pressable>
          </View>
        )}

        {!isLoading && !isError && (!documents || documents.length === 0) && (
          <View style={styles.emptyCard}>
            <Icon name="document-text-outline" size={40} color={emp.textMuted} />
            <Text style={styles.emptyTitle}>{t(lang, "docs.empty")}</Text>
            <Text style={styles.emptyText}>{t(lang, "docs.emptyDesc")}</Text>
          </View>
        )}

        {documents?.map((doc) => {
          const sc = STATUS_COLORS[doc.status] ?? STATUS_COLORS.VALID;
          return (
            <View key={doc.id} style={styles.docCard}>
              <View style={styles.docHeader}>
                <Text style={styles.docType}>{t(lang, `docs.type.${doc.documentType}`)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.statusText, { color: sc.text }]}>{t(lang, `docs.status.${doc.status}`)}</Text>
                </View>
              </View>
              {doc.documentName && <Text style={styles.docName}>{doc.documentName}</Text>}
              <View style={styles.docMeta}>
                {doc.expiryDate && (
                  <Text style={styles.docMetaText}>
                    {t(lang, "docs.expiryDate")}: {formatDate(doc.expiryDate)}
                  </Text>
                )}
                {doc.fileName && (
                  <Text style={styles.docMetaText} numberOfLines={1}>{doc.fileName}</Text>
                )}
              </View>
              <Pressable
                onPress={() => handleDelete(doc.id)}
                style={styles.deleteBtn}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "docs.deleteConfirm")}
              >
                <Icon name="trash-outline" size={16} color={emp.danger} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {/* Upload Modal */}
      <Modal visible={showUploadForm} animationType="slide" transparent onRequestClose={resetForm}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + spacing.xl }]} accessibilityViewIsModal={true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t(lang, "docs.upload")}</Text>
              <Pressable onPress={resetForm} style={styles.modalClose} accessibilityRole="button" accessibilityLabel={t(lang, "common.close")}>
                <Icon name="close" size={24} color={emp.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Document Type */}
              <Text style={styles.fieldLabel}>{t(lang, "docs.type")}</Text>
              <Pressable style={styles.typeSelector} onPress={() => setShowTypePicker(!showTypePicker)} accessibilityRole="button">
                <Text style={styles.typeSelectorText}>{t(lang, `docs.type.${docType}`)}</Text>
                <Icon name={showTypePicker ? "chevron-up" : "chevron-down"} size={20} color={emp.textMuted} />
              </Pressable>
              {showTypePicker && (
                <View style={styles.typeList}>
                  {DOC_TYPES.map((dt) => (
                    <Pressable
                      key={dt}
                      style={[styles.typeOption, dt === docType && styles.typeOptionActive]}
                      onPress={() => { setDocType(dt); setShowTypePicker(false); }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: dt === docType }}
                    >
                      <Text style={[styles.typeOptionText, dt === docType && styles.typeOptionTextActive]}>
                        {t(lang, `docs.type.${dt}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Expiry Date */}
              <Text style={styles.fieldLabel}>{t(lang, "docs.expiryDate")}</Text>
              <Pressable
                style={styles.datePickerBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowDatePicker(true); }}
                accessibilityRole="button"
              >
                <Icon name="calendar-outline" size={20} color={emp.primary} />
                <Text style={[styles.datePickerText, !expiryDate && styles.datePickerPlaceholder]}>
                  {expiryDate || t(lang, "leave.datePlaceholder")}
                </Text>
              </Pressable>
              {showDatePicker && (
                <View>
                  <DateTimePicker
                    value={expiryDate ? new Date(expiryDate + "T12:00:00") : new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={handleDateChange}
                    locale={lang === "pl" ? "pl-PL" : "en-US"}
                  />
                  {Platform.OS === "ios" && (
                    <Pressable style={styles.datePickerDone} onPress={() => setShowDatePicker(false)} accessibilityRole="button">
                      <Text style={styles.datePickerDoneText}>{t(lang, "common.confirm")}</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* File */}
              <Text style={styles.fieldLabel}>{t(lang, "docs.selectFile")}</Text>
              <Pressable style={styles.fileBtn} onPress={handlePickFile} accessibilityRole="button">
                <Icon name={selectedFile ? "checkmark-circle" : "cloud-upload-outline"} size={22} color={selectedFile ? emp.success : emp.primary} />
                <Text style={styles.fileBtnText}>
                  {selectedFile ? selectedFile.name : t(lang, "docs.selectFile")}
                </Text>
              </Pressable>

              {/* Submit */}
              <Pressable
                style={[styles.submitBtn, (!docType || uploadMutation.isPending) && styles.submitBtnDisabled]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); uploadMutation.mutate(); }}
                disabled={!docType || uploadMutation.isPending}
                accessibilityRole="button"
              >
                {uploadMutation.isPending ? (
                  <ActivityIndicator size="small" color={emp.white} />
                ) : (
                  <Text style={styles.submitText}>{t(lang, "docs.upload")}</Text>
                )}
              </Pressable>

              <Pressable style={styles.cancelBtn} onPress={resetForm} accessibilityRole="button">
                <Text style={styles.cancelText}>{t(lang, "common.cancel")}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: emp.bg },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: emp.text, letterSpacing: letterSpacing.tight },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: emp.primary, alignItems: "center", justifyContent: "center",
  },
  loadingCard: {
    backgroundColor: emp.card, borderRadius: radius.xl, borderWidth: 1, borderColor: emp.cardBorder,
    padding: spacing["3xl"], alignItems: "center", ...shadow.sm,
  },
  card: {
    backgroundColor: emp.card, borderRadius: radius.xl, borderWidth: 1, borderColor: emp.cardBorder,
    padding: spacing.xl, gap: spacing.md, alignItems: "center", ...shadow.sm,
  },
  emptyCard: {
    backgroundColor: emp.card, borderRadius: radius.xl, borderWidth: 1, borderColor: emp.cardBorder,
    padding: spacing["3xl"], alignItems: "center", gap: spacing.md, ...shadow.sm,
  },
  emptyTitle: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: emp.text },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: emp.textMuted, textAlign: "center", lineHeight: 18 },
  retryBtn: { backgroundColor: emp.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: TOUCH_TARGET, justifyContent: "center" },
  retryText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: emp.white },

  // -- Doc Card
  docCard: {
    backgroundColor: emp.card, borderRadius: radius.lg, borderWidth: 1, borderColor: emp.cardBorder,
    padding: spacing.lg, gap: spacing.xs, ...shadow.sm,
  },
  docHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  docType: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: emp.text, flex: 1 },
  statusBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusText: { fontSize: fontSize.xs, fontFamily: "Inter_600SemiBold" },
  docName: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: emp.textSecondary },
  docMeta: { gap: 2 },
  docMetaText: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: emp.textMuted },
  deleteBtn: { position: "absolute", bottom: spacing.md, right: spacing.md, padding: spacing.xs, minHeight: TOUCH_TARGET, minWidth: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },

  // -- Modal
  modalOverlay: { flex: 1, backgroundColor: emp.overlay, justifyContent: "flex-end" },
  modalContent: { backgroundColor: emp.card, borderTopLeftRadius: radius["2xl"], borderTopRightRadius: radius["2xl"], padding: spacing.xl, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  modalTitle: { fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: emp.text },
  modalClose: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  fieldLabel: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: emp.textSecondary, marginTop: spacing.lg, marginBottom: spacing.xs },

  typeSelector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: emp.inputBg, borderRadius: radius.md, borderWidth: 1, borderColor: emp.inputBorder, padding: spacing.lg, minHeight: TOUCH_TARGET },
  typeSelectorText: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: emp.text },
  typeList: { backgroundColor: emp.inputBg, borderRadius: radius.md, borderWidth: 1, borderColor: emp.inputBorder, overflow: "hidden" },
  typeOption: { padding: spacing.md, minHeight: TOUCH_TARGET, justifyContent: "center" },
  typeOptionActive: { backgroundColor: emp.primaryLight },
  typeOptionText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: emp.text },
  typeOptionTextActive: { fontFamily: "Inter_600SemiBold", color: emp.primary },

  datePickerBtn: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: emp.inputBg, borderRadius: radius.md, borderWidth: 1, borderColor: emp.inputBorder, padding: spacing.lg, minHeight: TOUCH_TARGET },
  datePickerText: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: emp.text },
  datePickerPlaceholder: { color: emp.textMuted },
  datePickerDone: { alignSelf: "flex-end", paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  datePickerDoneText: { fontSize: fontSize.base, fontFamily: "Inter_600SemiBold", color: emp.primary },

  fileBtn: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: emp.inputBg, borderRadius: radius.md, borderWidth: 1, borderColor: emp.inputBorder, borderStyle: "dashed", padding: spacing.lg, minHeight: TOUCH_TARGET },
  fileBtnText: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: emp.text, flex: 1 },

  submitBtn: { backgroundColor: emp.primary, borderRadius: radius["2xl"], paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.xl, minHeight: TOUCH_TARGET + 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontSize: fontSize.lg, fontFamily: "Inter_700Bold", color: emp.white },
  cancelBtn: { paddingVertical: spacing.md, alignItems: "center", minHeight: TOUCH_TARGET },
  cancelText: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: emp.textMuted },
});

export default function DocumentsScreen() {
  return (
    <ErrorBoundary>
      <DocumentsScreenInner />
    </ErrorBoundary>
  );
}
