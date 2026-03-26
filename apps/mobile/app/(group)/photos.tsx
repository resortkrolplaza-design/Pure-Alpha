// =============================================================================
// Group Portal — Photos Tab (Photo wall)
// =============================================================================

import { View, Text, FlatList, StyleSheet, RefreshControl, useWindowDimensions, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { group, fontSize, radius, spacing } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { GroupPhotoData } from "@/lib/types";
import { useCallback, useState, useMemo } from "react";

const COLUMN_GAP = 8;
const NUM_COLUMNS = 3;

export default function PhotosScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const { width: screenWidth } = useWindowDimensions();
  const imageSize = useMemo(() => (screenWidth - 40 - COLUMN_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS, [screenWidth]);

  const { data: photos, isLoading, isError, refetch } = useQuery({
    queryKey: ["group-photos", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<GroupPhotoData[]>(trackingId, "/photos");
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

  // Track failed images to show fallback
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const renderPhoto = useCallback(({ item }: { item: GroupPhotoData }) => {
    const isFailed = failedIds.has(item.id);
    return (
      <View style={[styles.photoWrapper, { width: imageSize }]} accessibilityLabel={item.caption || t(lang, "group.tab.photos")}>
        {isFailed ? (
          <View style={[styles.photoFallback, { width: imageSize, height: imageSize }]} />
        ) : (
          <Image
            source={{ uri: item.imageUrl }}
            style={{ width: imageSize, height: imageSize, borderRadius: radius.sm }}
            resizeMode="cover"
            onError={() => setFailedIds((prev) => new Set(prev).add(item.id))}
          />
        )}
        {item.caption && (
          <Text style={styles.photoCaption} numberOfLines={1}>{item.caption}</Text>
        )}
      </View>
    );
  }, [failedIds, imageSize, lang]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t(lang, "group.tab.photos")}</Text>
        {photos && <Text style={styles.count}>{photos.length} {t(lang, "group.photosCount")}</Text>}
      </View>

      <FlatList
        data={photos ?? []}
        renderItem={renderPhoto}
        keyExtractor={(p) => p.id}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.row}
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
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: group.text },
  count: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, marginTop: 2 },
  list: { paddingHorizontal: spacing.xl },
  row: { gap: COLUMN_GAP, marginBottom: COLUMN_GAP },
  photoWrapper: {},
  photoFallback: { borderRadius: radius.sm, backgroundColor: "rgba(0,0,0,0.06)" },
  photoCaption: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: group.textMuted, marginTop: 2 },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, textAlign: "center", paddingVertical: spacing["3xl"] },
});
