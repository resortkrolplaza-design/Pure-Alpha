import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { employee, fontSize, spacing } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  return (
    <LinearGradient colors={[employee.bgFrom, employee.bgTo]} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.title}>{t(lang, "emp.tab.chat")}</Text>
        <Text style={styles.placeholder}>Employee chat will load here</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xl },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: employee.text },
  placeholder: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textMuted, marginTop: spacing.lg },
});
