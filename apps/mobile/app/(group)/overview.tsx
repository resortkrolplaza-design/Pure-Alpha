// =============================================================================
// Group Portal — Overview (Event info, countdown, agenda, announcements)
// =============================================================================

import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { group, fontSize, radius, spacing } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

export default function OverviewScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.title}>{t(lang, "group.tab.overview")}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.card}>
          <Text style={styles.cardTitle}>{t(lang, "group.countdown")}</Text>
          <Text style={styles.placeholder}>Event data will load here</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.card}>
          <Text style={styles.cardTitle}>{t(lang, "group.agenda")}</Text>
          <Text style={styles.placeholder}>Agenda items will load here</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.card}>
          <Text style={styles.cardTitle}>{t(lang, "group.announcements")}</Text>
          <Text style={styles.placeholder}>Announcements will load here</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: group.text },
  card: {
    backgroundColor: group.card, borderRadius: radius.xl, borderWidth: 1, borderColor: group.cardBorder,
    padding: spacing.xl, gap: spacing.md,
  },
  cardTitle: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: group.text },
  placeholder: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted },
});
