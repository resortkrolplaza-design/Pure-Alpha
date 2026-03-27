// =============================================================================
// Guest Portal -- Hotel Tab (Info, Gallery, Services, FAQ, Attractions)
// =============================================================================

import { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, useWindowDimensions, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NAVY, GOLD, guest, fontSize, radius, spacing } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { configureListAnimation, useRotation } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore, useGuestStore } from "@/lib/store";
import type { FaqData } from "@/lib/types";

type Section = "info" | "gallery" | "services" | "faq" | "attractions";

const GALLERY_GAP = spacing.sm;
const GALLERY_PADDING_H = spacing.xl;

const getSocialUrl = (platform: string, username: string | null): string | null => {
  if (!username) return null;
  switch (platform.toLowerCase()) {
    case "facebook": return `https://facebook.com/${username}`;
    case "instagram": return `https://instagram.com/${username}`;
    case "twitter": case "x": return `https://x.com/${username}`;
    case "tiktok": return `https://tiktok.com/@${username}`;
    case "youtube": return `https://youtube.com/${username}`;
    case "linkedin": return `https://linkedin.com/company/${username}`;
    default: return null;
  }
};

export default function HotelScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const hotel = useGuestStore((s) => s.hotel);
  const gallery = useGuestStore((s) => s.gallery);
  const services = useGuestStore((s) => s.services);
  const faq = useGuestStore((s) => s.faq);
  const attractions = useGuestStore((s) => s.attractions);
  const socialLinks = useGuestStore((s) => s.socialLinks);
  const [section, setSection] = useState<Section>("info");

  // P2-27: Calculate exact gallery image width based on screen dimensions
  const { width: screenWidth } = useWindowDimensions();
  const galleryImageWidth = (screenWidth - GALLERY_PADDING_H * 2 - GALLERY_GAP) / 2;

  const SECTIONS: { key: Section; label: string }[] = [
    { key: "info", label: t(lang, "hotel.info") },
    { key: "gallery", label: t(lang, "hotel.gallery") },
    { key: "services", label: t(lang, "hotel.services") },
    { key: "faq", label: t(lang, "hotel.faq") },
    { key: "attractions", label: t(lang, "hotel.attractions") },
  ];

  const handleSectionChange = (key: Section) => {
    configureListAnimation();
    setSection(key);
  };

  return (
    <LinearGradient colors={[guest.bg, guest.bgLight, guest.bg]} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hotel Name */}
        <View>
          <Text style={styles.title}>{hotel?.name ?? "Hotel"}</Text>
          {hotel?.address && <Text style={styles.address}>{hotel.address}</Text>}
        </View>

        {/* Section Tabs (scrollable) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
          <View style={styles.tabs} accessibilityRole="tablist">
            {SECTIONS.map((s) => (
              <Pressable
                key={s.key}
                style={[styles.tab, section === s.key && styles.tabActive]}
                onPress={() => handleSectionChange(s.key)}
                // P2-3: Add accessibility props to section tabs
                accessibilityRole="tab"
                accessibilityState={{ selected: section === s.key }}
              >
                <Text style={[styles.tabText, section === s.key && styles.tabTextActive]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Content */}
        {section === "info" && hotel && (
          <View style={styles.section}>
            {/* Contact buttons */}
            <View style={styles.contactGrid}>
              {hotel.phone && (
                <Pressable style={styles.contactCard} onPress={() => Linking.openURL(`tel:${hotel.phone}`)}>
                  <Icon name="call-outline" size={20} color={GOLD} />
                  <Text style={styles.contactLabel}>{t(lang, "hotel.call")}</Text>
                  <Text style={styles.contactValue}>{hotel.phone}</Text>
                </Pressable>
              )}
              {hotel.email && (
                <Pressable style={styles.contactCard} onPress={() => Linking.openURL(`mailto:${hotel.email}`)}>
                  <Icon name="mail-outline" size={20} color={GOLD} />
                  <Text style={styles.contactLabel}>Email</Text>
                  <Text style={styles.contactValue} numberOfLines={1}>{hotel.email}</Text>
                </Pressable>
              )}
            </View>

            {/* Social Links */}
            {socialLinks && socialLinks.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t(lang, "hotel.social")}</Text>
                <View style={styles.socialRow}>
                  {/* P2-8: Use platform+username as key instead of index */}
                  {socialLinks.map((link) => (
                    <Pressable
                      key={`${link.platform}-${link.accountUsername}`}
                      style={styles.socialBadge}
                      onPress={() => {
                        const url = getSocialUrl(link.platform, link.accountUsername);
                        if (url) Linking.openURL(url);
                      }}
                      accessibilityRole="link"
                      accessibilityLabel={link.platform}
                    >
                      <Text style={styles.socialText}>{link.platform}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {section === "gallery" && (
          <View style={styles.galleryGrid}>
            {gallery.map((img) => (
              <Image
                key={img.id}
                source={{ uri: img.url }}
                // P2-27: Use calculated width instead of percentage
                style={[styles.galleryImage, { width: galleryImageWidth }]}
                resizeMode="cover"
              />
            ))}
            {!gallery.length && (
              <Text style={styles.emptyText}>{t(lang, "common.noData")}</Text>
            )}
          </View>
        )}

        {section === "services" && (
          <View style={styles.section}>
            {services.map((s) => (
              <View key={s.id} style={styles.serviceCard}>
                <View style={styles.serviceInfo}>
                  <Text style={styles.serviceName}>{s.name}</Text>
                  {s.publicDescription && <Text style={styles.serviceDesc}>{s.publicDescription}</Text>}
                </View>
                {s.price != null && (
                  <Text style={styles.servicePrice}>{s.price} {s.currency ?? "PLN"}</Text>
                )}
              </View>
            ))}
            {!services.length && (
              <Text style={styles.emptyText}>{t(lang, "common.noData")}</Text>
            )}
          </View>
        )}

        {section === "faq" && (
          <View style={styles.section}>
            {faq.map((f) => (
              <FaqItem key={f.id} faq={f} />
            ))}
            {!faq.length && (
              <Text style={styles.emptyText}>{t(lang, "common.noData")}</Text>
            )}
          </View>
        )}

        {section === "attractions" && (
          <View style={styles.section}>
            {attractions.map((a) => (
              <View key={a.id} style={styles.attractionCard}>
                {a.imageUrl && (
                  <Image
                    source={{ uri: a.imageUrl }}
                    style={styles.attractionImg}
                    resizeMode="cover"
                    // P3-8: Add accessibilityLabel to attraction image
                    accessibilityLabel={a.name}
                  />
                )}
                <View style={styles.attractionInfo}>
                  <Text style={styles.attractionName}>{a.name}</Text>
                  {a.distance && <Text style={styles.attractionDist}>{a.distance}</Text>}
                  {a.description && <Text style={styles.attractionDesc} numberOfLines={2}>{a.description}</Text>}
                </View>
              </View>
            ))}
            {!attractions.length && (
              <Text style={styles.emptyText}>{t(lang, "common.noData")}</Text>
            )}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

function FaqItem({ faq }: { faq: FaqData }) {
  const [open, setOpen] = useState(false);
  const rotation = useRotation(open);

  return (
    <Pressable
      style={styles.faqCard}
      onPress={() => setOpen(!open)}
      // P2-4: Add expandable a11y state
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{faq.question}</Text>
        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
          <Icon name="chevron-forward" size={16} color={GOLD} />
        </Animated.View>
      </View>
      {open && <Text style={styles.faqAnswer}>{faq.answer}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  title: {
    fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: guest.text,
    letterSpacing: -0.3,
  },
  address: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textSecondary, marginTop: 4, lineHeight: 18 },
  tabsScroll: { marginHorizontal: -spacing.xl },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl },
  tab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: guest.glassBorder },
  tabActive: { backgroundColor: GOLD, borderColor: GOLD },
  tabText: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: guest.textSecondary },
  tabTextActive: { color: NAVY, fontFamily: "Inter_600SemiBold" },
  section: { gap: spacing.md },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textMuted, textAlign: "center", paddingVertical: spacing["3xl"] },
  contactGrid: { flexDirection: "row", gap: spacing.md },
  contactCard: {
    flex: 1, backgroundColor: guest.card, borderRadius: radius.lg, borderWidth: 1, borderColor: guest.cardBorder,
    padding: spacing.lg, alignItems: "center", gap: spacing.sm, minHeight: 44,
  },
  contactLabel: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: guest.text },
  contactValue: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: guest.textMuted },
  card: { backgroundColor: guest.card, borderRadius: radius.lg, borderWidth: 1, borderColor: guest.cardBorder, padding: spacing.lg, gap: spacing.md },
  cardTitle: { fontSize: fontSize.base, fontFamily: "Inter_600SemiBold", color: guest.text },
  socialRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  socialBadge: { backgroundColor: guest.glass, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  socialText: { fontSize: fontSize.xs, fontFamily: "Inter_500Medium", color: guest.textSecondary, textTransform: "capitalize" },
  galleryGrid: { flexDirection: "row", flexWrap: "wrap", gap: GALLERY_GAP },
  // P2-27: Width set dynamically via inline style; only keep aspect ratio here
  galleryImage: { aspectRatio: 4 / 3, borderRadius: radius.md },
  serviceCard: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: guest.card, borderRadius: radius.md, borderWidth: 1, borderColor: guest.cardBorder,
    padding: spacing.lg,
  },
  serviceInfo: { flex: 1, gap: 2 },
  serviceName: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: guest.text },
  serviceDesc: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: guest.textMuted, lineHeight: 18 },
  servicePrice: { fontSize: fontSize.base, fontFamily: "Inter_700Bold", color: GOLD, marginLeft: spacing.md },
  faqCard: {
    backgroundColor: guest.card, borderRadius: radius.md, borderWidth: 1, borderColor: guest.cardBorder,
    padding: spacing.lg, gap: spacing.sm,
  },
  faqHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  faqQuestion: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: guest.text, flex: 1 },
  faqAnswer: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textSecondary, lineHeight: 20 },
  attractionCard: {
    flexDirection: "row", backgroundColor: guest.card, borderRadius: radius.md, borderWidth: 1, borderColor: guest.cardBorder,
    overflow: "hidden",
  },
  attractionImg: { width: 80, height: 80 },
  attractionInfo: { flex: 1, padding: spacing.md, gap: 4 },
  attractionName: { fontSize: fontSize.base, fontFamily: "Inter_500Medium", color: guest.text },
  attractionDist: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: GOLD },
  attractionDesc: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: guest.textMuted, lineHeight: 18 },
});
