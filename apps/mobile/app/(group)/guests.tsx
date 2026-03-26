import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { group, fontSize, spacing } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

export default function GuestsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <Text style={styles.title}>{t(lang, "group.tab.guests")}</Text>
      <Text style={styles.placeholder}>{t(lang, "group.guestList")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: group.bg, paddingHorizontal: spacing.xl },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: group.text },
  placeholder: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: group.textMuted, marginTop: spacing.lg },
});
