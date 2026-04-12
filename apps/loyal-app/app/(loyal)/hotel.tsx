// =============================================================================
// Loyal App -- Hotel Tab
// Hotel info, contact, gallery, services, attractions, FAQ, social links, map
// =============================================================================

import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Linking,
  Modal,
  Dimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { loyal, fontSize, radius, spacing, shadow, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import type { IconName } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchPortalData } from "@/lib/loyal-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type {
  PortalData,
  HotelData,
  GalleryImageData,
  ServiceData,
  AttractionData,
  FaqData,
  SocialLinkData,
} from "@/lib/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// -- Social platform icon mapping ---------------------------------------------

const SOCIAL_ICONS: Record<string, IconName> = {
  facebook: "logo-facebook",
  instagram: "logo-instagram",
  twitter: "logo-twitter",
  tiktok: "logo-tiktok",
  youtube: "logo-youtube",
  linkedin: "logo-linkedin",
  pinterest: "logo-pinterest",
};

function getSocialIcon(platform: string): IconName {
  return SOCIAL_ICONS[platform.toLowerCase()] ?? "globe-outline";
}

// -- Gallery Image Viewer (modal) ---------------------------------------------

function ModalImageItem({ item }: { item: GalleryImageData }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <View style={styles.modalImageContainer}>
        <View style={[styles.modalImage, { backgroundColor: loyal.bgDark, alignItems: "center", justifyContent: "center" }]}>
          <Icon name="image-outline" size={40} color={loyal.lightTextMuted} />
        </View>
        {item.caption && (
          <Text style={styles.modalCaption}>{item.caption}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.modalImageContainer}>
      <Image
        source={{ uri: item.url }}
        style={styles.modalImage}
        resizeMode="contain"
        onError={() => setHasError(true)}
        accessibilityLabel={item.alt ?? item.caption ?? "Hotel photo"}
      />
      {item.caption && (
        <Text style={styles.modalCaption}>{item.caption}</Text>
      )}
    </View>
  );
}

function GalleryViewer({
  images,
  initialIndex,
  visible,
  onClose,
}: {
  images: GalleryImageData[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={[styles.modalCloseBtn, { top: insets.top + spacing.md }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Icon name="close" size={28} color={loyal.white} />
        </Pressable>
        <FlatList
          data={images}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          renderItem={({ item }) => <ModalImageItem item={item} />}
        />
      </View>
    </Modal>
  );
}

// -- Gallery Thumbnail --------------------------------------------------------

function GalleryThumbnail({
  item,
  onPress,
}: {
  item: GalleryImageData;
  onPress: () => void;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) return null;

  return (
    <Pressable
      onPress={onPress}
      style={styles.galleryThumb}
      accessibilityRole="button"
      accessibilityLabel={item.alt ?? item.caption ?? "Hotel photo"}
    >
      <Image
        source={{ uri: item.url }}
        style={styles.galleryThumbImage}
        resizeMode="cover"
        onError={() => setHasError(true)}
      />
    </Pressable>
  );
}

// -- Service Card -------------------------------------------------------------

function ServiceCard({ item, currency }: { item: ServiceData; currency: string }) {
  return (
    <View style={styles.serviceCard}>
      <View style={styles.serviceIconWrap}>
        <Icon name="sparkles" size={20} color={loyal.primary} />
      </View>
      <View style={styles.serviceInfo}>
        <Text style={styles.serviceName} numberOfLines={2}>
          {item.name}
        </Text>
        {item.description && (
          <Text style={styles.serviceDesc} numberOfLines={3}>
            {item.description}
          </Text>
        )}
        {item.price != null && (
          <Text style={styles.servicePrice}>
            {item.price} {item.currency ?? currency}
          </Text>
        )}
      </View>
    </View>
  );
}

// -- Attraction Card ----------------------------------------------------------

function AttractionCard({ item, lang }: { item: AttractionData; lang: "pl" | "en" }) {
  const tt = (key: string) => t(lang, key);
  const hasLinks = !!(item.mapUrl || item.websiteUrl);
  const [imageError, setImageError] = useState(false);

  const handleOpenUrl = useCallback((url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(url);
  }, []);

  return (
    <View style={styles.attractionCard}>
      {item.imageUrl && !imageError ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.attractionImage}
          resizeMode="cover"
          onError={() => setImageError(true)}
          accessibilityLabel={item.name}
        />
      ) : (
        <View style={[styles.attractionImage, styles.attractionPlaceholder]}>
          <Icon name="location" size={24} color={loyal.primary} />
        </View>
      )}
      <View style={styles.attractionInfo}>
        <Text style={styles.attractionName} numberOfLines={2}>
          {item.name}
        </Text>
        {item.description && (
          <Text style={styles.attractionDesc} numberOfLines={3}>
            {item.description}
          </Text>
        )}
        {item.distance && (
          <View style={styles.distanceBadge}>
            <Icon name="navigate" size={12} color={loyal.primary} />
            <Text style={styles.distanceText}>{item.distance}</Text>
          </View>
        )}
        {hasLinks && (
          <View style={styles.attractionLinks}>
            {item.mapUrl && (
              <Pressable
                style={styles.attractionLinkBtn}
                onPress={() => handleOpenUrl(item.mapUrl!)}
                accessibilityRole="button"
                accessibilityLabel={`${tt("hotel.map")} - ${item.name}`}
              >
                <Icon name="map-outline" size={14} color={loyal.primary} />
                <Text style={styles.attractionLinkText}>{tt("hotel.map")}</Text>
              </Pressable>
            )}
            {item.websiteUrl && (
              <Pressable
                style={styles.attractionLinkBtn}
                onPress={() => handleOpenUrl(item.websiteUrl!)}
                accessibilityRole="button"
                accessibilityLabel={`${tt("hotel.website")} - ${item.name}`}
              >
                <Icon name="globe-outline" size={14} color={loyal.primary} />
                <Text style={styles.attractionLinkText}>{tt("hotel.website")}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// -- FAQ Accordion Item -------------------------------------------------------

function FaqItem({ item }: { item: FaqData }) {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded((v) => !v);
  }, []);

  return (
    <View style={styles.faqItem}>
      <Pressable
        style={styles.faqHeader}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={item.question}
      >
        <Text style={styles.faqQuestion} numberOfLines={expanded ? undefined : 2}>
          {item.question}
        </Text>
        <Icon
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={loyal.lightTextSecondary}
        />
      </Pressable>
      {expanded && (
        <Text style={styles.faqAnswer}>{item.answer}</Text>
      )}
    </View>
  );
}

// -- Main Screen ---------------------------------------------------------------

function HotelScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const tt = (key: string) => t(lang, key);
  const token = useAppStore((s) => s.token);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [logoError, setLogoError] = useState(false);

  const { data, refetch, isRefetching, isError, isLoading } = useQuery<PortalData>({
    queryKey: ["portal", token],
    queryFn: async () => {
      const res = await fetchPortalData(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load portal data");
      return res.data;
    },
    enabled: !!token,
  });

  const hotel = data?.hotel;
  const gallery = data?.gallery ?? [];
  const services = data?.services ?? [];
  const attractions = data?.attractions ?? [];
  const faq = data?.faq ?? [];
  const socialLinks = data?.socialLinks ?? [];

  const openGallery = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

  const handleCall = useCallback(() => {
    if (!hotel?.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`tel:${hotel.phone}`);
  }, [hotel?.phone]);

  const handleEmail = useCallback(() => {
    if (!hotel?.email) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`mailto:${hotel.email}`);
  }, [hotel?.email]);

  const handleSocialLink = useCallback((url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(url);
  }, []);

  const handleMap = useCallback(() => {
    if (!hotel?.address) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const address = encodeURIComponent(hotel.address);
    const url = Platform.select({
      ios: `maps:0,0?q=${address}`,
      android: `geo:0,0?q=${address}`,
    });
    if (url) Linking.openURL(url);
  }, [hotel?.address]);

  const renderHeader = () => (
    <View style={{ gap: spacing.xl }}>
      {/* Hotel Info Card */}
      {hotel && (
        <View style={styles.infoCard}>
          {hotel.logoUrl && !logoError && (
            <Image
              source={{ uri: hotel.logoUrl }}
              style={styles.hotelLogo}
              resizeMode="contain"
              onError={() => setLogoError(true)}
              accessibilityLabel={`${hotel.name} logo`}
            />
          )}
          <Text style={styles.hotelName}>{hotel.name}</Text>
          {hotel.address && (
            <Pressable
              style={styles.addressRow}
              onPress={handleMap}
              accessibilityRole="button"
              accessibilityLabel={hotel.address}
            >
              <Icon name="location-outline" size={18} color={loyal.primary} />
              <Text style={styles.addressText}>{hotel.address}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Contact Section */}
      {hotel && (hotel.phone || hotel.email) && (
        <View style={styles.contactCard}>
          <Text style={styles.sectionTitle}>{tt("stay.contact")}</Text>
          {hotel.phone && (
            <Pressable
              style={styles.contactRow}
              onPress={handleCall}
              accessibilityRole="button"
              accessibilityLabel={`${tt("stay.phone")}: ${hotel.phone}`}
            >
              <View style={styles.contactIconWrap}>
                <Icon name="call" size={20} color={loyal.primary} />
              </View>
              <Text style={styles.contactText}>{hotel.phone}</Text>
              <Icon name="chevron-forward" size={16} color={loyal.lightTextMuted} />
            </Pressable>
          )}
          {hotel.email && (
            <Pressable
              style={styles.contactRow}
              onPress={handleEmail}
              accessibilityRole="button"
              accessibilityLabel={`${tt("stay.email")}: ${hotel.email}`}
            >
              <View style={styles.contactIconWrap}>
                <Icon name="mail" size={20} color={loyal.primary} />
              </View>
              <Text style={styles.contactText}>{hotel.email}</Text>
              <Icon name="chevron-forward" size={16} color={loyal.lightTextMuted} />
            </Pressable>
          )}
        </View>
      )}

      {/* Map Button */}
      {hotel?.address && (
        <Pressable
          style={styles.mapBtn}
          onPress={handleMap}
          accessibilityRole="button"
          accessibilityLabel={tt("hotel.showOnMap")}
        >
          <Icon name="map" size={22} color={loyal.bg} />
          <Text style={styles.mapBtnText}>
            {tt("hotel.showOnMap")}
          </Text>
        </Pressable>
      )}

      {/* Gallery */}
      {gallery.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>
            {tt("hotel.gallery")}
          </Text>
          <FlatList
            data={gallery}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <GalleryThumbnail
                item={item}
                onPress={() => openGallery(index)}
              />
            )}
            contentContainerStyle={styles.galleryList}
          />
        </View>
      )}

      {/* Services */}
      {services.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>{tt("stay.hotelServices")}</Text>
          {services.map((svc) => (
            <ServiceCard key={svc.id} item={svc} currency={data?.program?.currency ?? "PLN"} />
          ))}
        </View>
      )}

      {/* Attractions */}
      {attractions.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>
            {tt("hotel.nearby")}
          </Text>
          {attractions.map((att) => (
            <AttractionCard key={att.id} item={att} lang={lang} />
          ))}
        </View>
      )}

      {/* FAQ */}
      {faq.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>FAQ</Text>
          {faq.map((item) => (
            <FaqItem key={item.id} item={item} />
          ))}
        </View>
      )}

      {/* Social Links */}
      {socialLinks.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>{tt("hotel.followUs")}</Text>
          <View style={styles.socialRow}>
            {socialLinks.map((link) => (
              <Pressable
                key={link.id}
                style={styles.socialBtn}
                onPress={() => handleSocialLink(link.url)}
                accessibilityRole="link"
                accessibilityLabel={link.accountUsername ?? link.platform}
              >
                <Icon
                  name={getSocialIcon(link.platform)}
                  size={24}
                  color={loyal.primary}
                />
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  if (isLoading && !data) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={loyal.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <Icon name="alert-circle-outline" size={48} color={loyal.lightTextMuted} />
        <Text style={{ color: loyal.lightText, fontSize: fontSize.base, marginTop: spacing.md, textAlign: "center" }}>
          {tt("common.error")}
        </Text>
        <Pressable
          onPress={() => refetch()}
          style={{ marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: loyal.primary, borderRadius: radius.lg }}
          accessibilityRole="button"
          accessibilityLabel={tt("common.retry")}
        >
          <Text style={{ color: loyal.white, fontSize: fontSize.base, fontFamily: "Inter_600SemiBold" }}>
            {tt("common.retry")}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={loyal.primary}
          />
        }
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing["4xl"],
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* Gallery Viewer Modal */}
      {gallery.length > 0 && (
        <GalleryViewer
          images={gallery}
          initialIndex={viewerIndex}
          visible={viewerVisible}
          onClose={() => setViewerVisible(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: loyal.contentBg,
  },

  // -- Cover ------------------------------------------------------------------
  coverImage: {
    width: "100%",
    height: 200,
    borderRadius: radius.lg,
    overflow: "hidden",
  },

  // -- Hotel Info Card --------------------------------------------------------
  infoCard: {
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: "center",
    ...shadow.sm,
  },
  hotelLogo: {
    width: 80,
    height: 80,
    borderRadius: radius.lg,
  },
  hotelName: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
    textAlign: "center",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: TOUCH_TARGET,
  },
  addressText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    textAlign: "center",
    flex: 1,
  },
  hotelDescription: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    lineHeight: 22,
    textAlign: "center",
  },
  timesRow: {
    flexDirection: "row",
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  timeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  timeLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: loyal.lightTextSecondary,
  },
  timeValue: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
  },

  // -- Contact Card -----------------------------------------------------------
  contactCard: {
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.sm,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: TOUCH_TARGET,
    paddingVertical: spacing.xs,
  },
  contactIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: loyal.lightPrimaryFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  contactText: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.lightText,
  },

  // -- Map Button -------------------------------------------------------------
  mapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: loyal.primary,
    borderRadius: radius["2xl"],
    paddingVertical: spacing.lg,
    minHeight: TOUCH_TARGET + 8,
    ...Platform.select({
      ios: {
        shadowColor: loyal.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  mapBtnText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.bg,
  },

  // -- Section Title ----------------------------------------------------------
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
    marginBottom: spacing.md,
  },

  // -- Gallery ----------------------------------------------------------------
  galleryList: {
    gap: spacing.md,
  },
  galleryThumb: {
    width: 160,
    height: 120,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  galleryThumbImage: {
    width: "100%",
    height: "100%",
  },

  // -- Gallery Viewer Modal ---------------------------------------------------
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
  },
  modalCloseBtn: {
    position: "absolute",
    right: spacing.lg,
    zIndex: 10,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalImageContainer: {
    width: SCREEN_WIDTH,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalImage: {
    width: SCREEN_WIDTH - spacing.lg * 2,
    height: SCREEN_WIDTH - spacing.lg * 2,
    borderRadius: radius.md,
  },
  modalCaption: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    marginTop: spacing.md,
  },

  // -- Services ---------------------------------------------------------------
  serviceCard: {
    flexDirection: "row",
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  serviceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: loyal.lightPrimaryFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  serviceName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: loyal.lightText,
  },
  serviceDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    lineHeight: 18,
  },
  servicePrice: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
    marginTop: spacing.xxs,
  },

  // -- Attractions ------------------------------------------------------------
  attractionCard: {
    flexDirection: "row",
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    overflow: "hidden",
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  attractionImage: {
    width: 100,
    height: 100,
  },
  attractionPlaceholder: {
    backgroundColor: loyal.lightPrimaryFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  attractionInfo: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  attractionName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: loyal.lightText,
  },
  attractionDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    lineHeight: 18,
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  distanceText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: loyal.primary,
  },

  // -- Attraction Links -------------------------------------------------------
  attractionLinks: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  attractionLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: loyal.lightPrimaryFaint,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  attractionLinkText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: loyal.primary,
  },

  // -- FAQ --------------------------------------------------------------------
  faqItem: {
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    marginBottom: spacing.md,
    overflow: "hidden",
    ...shadow.sm,
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
    minHeight: TOUCH_TARGET,
  },
  faqQuestion: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: loyal.lightText,
    lineHeight: 20,
  },
  faqAnswer: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },

  // -- Social Links -----------------------------------------------------------
  socialRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  socialBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: loyal.lightPrimaryFaint,
    alignItems: "center",
    justifyContent: "center",
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
  },
});

export default function HotelScreen() {
  return (
    <ErrorBoundary>
      <HotelScreenInner />
    </ErrorBoundary>
  );
}
