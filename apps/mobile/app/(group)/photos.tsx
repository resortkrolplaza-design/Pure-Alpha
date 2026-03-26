// =============================================================================
// Group Portal — Photos Tab (Photo wall)
// =============================================================================

import { View, Text, FlatList, StyleSheet, Dimensions } from "react-native";
import { Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { group, fontSize, radius, spacing } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { groupFetch } from "@/lib/group-api";
import type { GroupPhotoData } from "@/lib/types";
import { useCallback } from "react";

const SCREEN_WIDTH = Dimensions.get("window").width;
const COLUMN_GAP = 8;
const NUM_COLUMNS = 3;
const IMAGE_SIZE = (SCREEN_WIDTH - 40 - COLUMN_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

export default function PhotosScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";

  const { data: photos, isLoading } = useQuery({
    queryKey: ["group-photos", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await groupFetch<GroupPhotoData[]>(trackingId, "/photos");
      return res.data ?? [];
    },
    enabled: !!trackingId,
  });

  const renderPhoto = useCallback(({ item }: { item: GroupPhotoData }) => (
    <View style={styles.photoWrapper}>
      <Image
        source={{ uri: item.imageUrl }}
        style={styles.photo}
        resizeMode="cover"
        
      />
      {item.caption && (
        <Text style={styles.photoCaption} numberOfLines={1}>{item.caption}</Text>
      )}
    </View>
  ), []);

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
  count: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, marginTop: 2 },
  list: { paddingHorizontal: spacing.xl },
  row: { gap: COLUMN_GAP, marginBottom: COLUMN_GAP },
  photoWrapper: { width: IMAGE_SIZE },
  photo: { width: IMAGE_SIZE, height: IMAGE_SIZE, borderRadius: radius.sm },
  photoCaption: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: group.textMuted, marginTop: 2 },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, textAlign: "center", paddingVertical: spacing["3xl"] },
});
