// =============================================================================
// Group Portal -- Tab 2: "Odkryj" (Discover) -- Segment Control Screen
// 4 segments via SegmentControl: Gallery, Services, Attractions, FAQ
// (Agenda moved to preview in overview + dedicated /agenda screen)
//
// Data from shared react-query cache ["portal-init", trackingId].
// Feature flags gate each segment independently.
// Accepts `scrollTo` route param to auto-select a segment on mount.
// =============================================================================

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Image,
  Modal,
  Animated,
  Linking,
  Platform,
  UIManager,
  Alert,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  group,
  fontSize,
  radius,
  spacing,
  shadow,
  letterSpacing,
  quickActionColors,
  TOUCH_TARGET,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchPortalInit } from "@/lib/group-api";
import { configureListAnimation } from "@/lib/animations";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { isExternalUrlSafe, isImageUrlSafe } from "@/lib/url-safety";
import type { AgendaItemData } from "@/lib/types";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// =============================================================================
// Section IDs (used for scrollTo route param)
// =============================================================================

async function safeOpenURL(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  } catch { /* Expo Go dev mode */ }
}

// SectionId kept for backward-compat with scrollTo route param (e.g. from overview quick links)
type SectionId = "agenda" | "gallery" | "services" | "attractions" | "faq";

// =============================================================================
// Gallery types + layout
// =============================================================================

interface GalleryItem {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  alt: string | null;
  caption: string | null;
  category: string | null;
}

const GALLERY_STRIP_HEIGHT = 160;
const GALLERY_IMAGE_WIDTH = 200;
const GALLERY_GAP = spacing.sm;
const NAV_AUTO_HIDE_MS = 3000;

// =============================================================================
// Agenda Helpers
// =============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  ceremony: "#6366f1",
  dinner: "#f97316",
  party: "#ec4899",
  workshop: "#10b981",
  meeting: "#3b82f6",
  break: "#64748b",
  transport: "#d97706",
  activity: "#8b5cf6",
  registration: "#0ea5e9",
  event: "#0d9488",
  meal: "#ea580c",
  other: "#78716c",
};

function categoryColor(category: string | null): string {
  if (!category) return group.primary;
  return CATEGORY_COLORS[category.toLowerCase()] ?? group.primary;
}

function formatDateHeader(dateStr: string, lang: "pl" | "en"): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", {
    day: "numeric",
    month: "long",
  });
}

function formatTimeRange(
  start: string | null,
  end: string | null,
): string {
  if (!start) return "\u2014";
  if (!end) return start;
  return `${start} - ${end}`;
}

function groupByDate(
  items: AgendaItemData[],
): Array<{ date: string; items: AgendaItemData[] }> {
  const map = new Map<string, AgendaItemData[]>();
  const order: string[] = [];

  for (const item of items) {
    const key = item.date;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }

  return order.map((date) => ({ date, items: map.get(date)! }));
}

// =============================================================================
// Services Helper
// =============================================================================

function formatPrice(
  price: number | null,
  unit: string | null,
  currency: string | null,
): string {
  if (price == null) return "";
  const curr = currency ?? "PLN";
  const priceStr = price % 1 === 0 ? String(price) : price.toFixed(2);
  if (!unit) return `${priceStr} ${curr}`;
  return `${priceStr} ${curr} / ${unit}`;
}

// =============================================================================
// SectionHeader (shared across all sections)
// =============================================================================

function SectionHeader({
  icon,
  title,
  isFirst,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  title: string;
  isFirst?: boolean;
}) {
  return (
    <View
      style={[
        styles.sectionHeader,
        !isFirst && styles.sectionHeaderBorder,
      ]}
      accessible
      accessibilityRole="header"
    >
      <Icon name={icon} size={20} color={group.primary} />
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

// =============================================================================
// Agenda Section
// =============================================================================

function AgendaCard({
  item,
  lang,
}: {
  item: AgendaItemData;
  lang: "pl" | "en";
}) {
  const borderColor = categoryColor(item.category);

  return (
    <View
      style={[styles.agendaCard, { borderLeftColor: borderColor }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${item.title}, ${formatTimeRange(item.startTime, item.endTime)}`}
    >
      <View style={styles.agendaCardTopRow}>
        <View style={styles.agendaTimePill}>
          <Icon name="time-outline" size={12} color={group.primary} />
          <Text style={styles.agendaTimeText}>
            {formatTimeRange(item.startTime, item.endTime)}
          </Text>
        </View>
        {item.category && (
          <View
            style={[
              styles.agendaCategoryBadge,
              { backgroundColor: `${borderColor}18` },
            ]}
          >
            <Text style={[styles.agendaCategoryText, { color: borderColor }]}>
              {item.category ? t(lang, `agenda.category.${item.category}`) : item.category}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.agendaCardTitle}>{item.title}</Text>

      {item.location && (
        <View style={styles.agendaLocationRow}>
          <Icon name="location-outline" size={13} color={group.textMuted} />
          <Text style={styles.agendaLocationText}>{item.location}</Text>
        </View>
      )}

      {item.description && (
        <Text style={styles.agendaDescriptionText}>{item.description}</Text>
      )}

      <Pressable
        style={[styles.agendaCalendarBtn, { opacity: 0.5 }]}
        accessibilityRole="button"
        accessibilityLabel={t(lang, "group.agenda.addToCalendar")}
        onPress={() => Alert.alert(t(lang, "common.comingSoon"))}
      >
        <Icon name="calendar-outline" size={14} color={group.primary} />
        <Text style={styles.agendaCalendarBtnText}>
          {t(lang, "group.agenda.addToCalendar")}
        </Text>
      </Pressable>
    </View>
  );
}

function AgendaSection({
  agendaItems,
  lang,
}: {
  agendaItems: AgendaItemData[];
  lang: "pl" | "en";
}) {
  const grouped = useMemo(() => groupByDate(agendaItems), [agendaItems]);

  if (agendaItems.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Icon name="calendar-outline" size={40} color={group.textMuted} />
        <Text style={styles.emptyText}>{t(lang, "group.noAgenda")}</Text>
      </View>
    );
  }

  return (
    <View>
      {grouped.map((section) => (
        <View key={section.date} style={styles.agendaDateSection}>
          <View style={styles.agendaDateHeaderRow}>
            <View style={styles.agendaDateDot} />
            <Text style={styles.agendaDateHeaderText}>
              {formatDateHeader(section.date, lang)}
            </Text>
          </View>
          {section.items.map((item) => (
            <AgendaCard key={item.id} item={item} lang={lang} />
          ))}
        </View>
      ))}
    </View>
  );
}

// =============================================================================
// Gallery Section (horizontal scroll strip + fullscreen viewer)
// =============================================================================

function GalleryViewerModal({
  images,
  viewerIndex,
  onClose,
  lang,
}: {
  images: GalleryItem[];
  viewerIndex: number | null;
  onClose: () => void;
  lang: "pl" | "en";
}) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [navVisible, setNavVisible] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(viewerIndex ?? 0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (viewerIndex !== null) {
      setCurrentIndex(viewerIndex);
      setNavVisible(true);
      resetAutoHide();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerIndex]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function resetAutoHide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setNavVisible(false);
    }, NAV_AUTO_HIDE_MS);
  }

  function toggleNav() {
    if (navVisible) {
      setNavVisible(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      setNavVisible(true);
      resetAutoHide();
    }
  }

  function goToPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      resetAutoHide();
    }
  }

  function goToNext() {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
      resetAutoHide();
    }
  }

  if (viewerIndex === null || images.length === 0) return null;

  const image = images[currentIndex];
  if (!image) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;
  const counterText = `${currentIndex + 1} ${t(lang, "photos.viewer.of")} ${images.length}`;

  return (
    <Modal
      visible={viewerIndex !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={viewerStyles.backdrop}>
        <Pressable
          style={viewerStyles.tapArea}
          onPress={toggleNav}
          accessibilityLabel={
            navVisible
              ? t(lang, "common.close")
              : t(lang, "gallery.hotelTitle")
          }
        >
          <Image
            source={{ uri: image.url }}
            style={[viewerStyles.image, { width: screenWidth }]}
            resizeMode="contain"
          />
        </Pressable>

        {navVisible && (
          <View
            style={[
              viewerStyles.topBar,
              { paddingTop: insets.top + spacing.sm },
            ]}
          >
            <View style={viewerStyles.counterContainer}>
              <Text style={viewerStyles.counterText}>{counterText}</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={viewerStyles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.close")}
              hitSlop={8}
            >
              <Icon name="close" size={24} color={group.white} />
            </Pressable>
          </View>
        )}

        {navVisible && (image.caption || image.alt) && (
          <View
            style={[
              viewerStyles.bottomBar,
              { paddingBottom: insets.bottom + spacing.md },
            ]}
          >
            {image.caption && (
              <Text style={viewerStyles.captionText} numberOfLines={3}>
                {image.caption}
              </Text>
            )}
            {image.alt && !image.caption && (
              <Text style={viewerStyles.altText} numberOfLines={2}>
                {image.alt}
              </Text>
            )}
          </View>
        )}

        {navVisible && hasPrev && (
          <Pressable
            onPress={goToPrev}
            style={[viewerStyles.navBtn, viewerStyles.navBtnLeft]}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "photos.previous")}
            hitSlop={8}
          >
            <Icon name="chevron-back" size={28} color={group.white} />
          </Pressable>
        )}

        {navVisible && hasNext && (
          <Pressable
            onPress={goToNext}
            style={[viewerStyles.navBtn, viewerStyles.navBtnRight]}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "photos.next")}
            hitSlop={8}
          >
            <Icon name="chevron-forward" size={28} color={group.white} />
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

function GallerySection({
  gallery,
  lang,
}: {
  gallery: GalleryItem[];
  lang: "pl" | "en";
}) {
  const safeImages = useMemo(
    () => gallery.filter((img) => isImageUrlSafe(img.url)),
    [gallery],
  );

  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (safeImages.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Icon name="images-outline" size={40} color={group.textMuted} />
        <Text style={styles.emptyText}>{t(lang, "common.noData")}</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Horizontal scroll strip -- NOT FlatList to avoid nesting VirtualizedList */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.galleryStrip}
      >
        {safeImages.map((item, idx) => {
          const isFailed = failedIds.has(item.id);

          return (
            <Pressable
              key={item.id}
              style={styles.galleryImageCard}
              accessibilityLabel={
                item.alt || item.caption || t(lang, "gallery.hotelTitle")
              }
              accessibilityRole="image"
              onPress={() => {
                if (!isFailed) {
                  setViewerIndex(idx);
                }
              }}
            >
              {isFailed ? (
                <View style={styles.galleryImageFallback}>
                  <Icon
                    name="image-outline"
                    size={28}
                    color={group.textMuted}
                  />
                </View>
              ) : (
                <Image
                  source={{
                    uri: isImageUrlSafe(item.thumbnailUrl)
                      ? item.thumbnailUrl!
                      : item.url,
                  }}
                  style={styles.galleryImageThumb}
                  resizeMode="cover"
                  onError={() =>
                    setFailedIds((prev) => new Set(prev).add(item.id))
                  }
                />
              )}

              {item.caption && !isFailed && (
                <View style={styles.galleryCaptionOverlay}>
                  <Text style={styles.galleryCaptionText} numberOfLines={1}>
                    {item.caption}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <GalleryViewerModal
        images={safeImages}
        viewerIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
        lang={lang}
      />
    </View>
  );
}

// =============================================================================
// Services Section
// =============================================================================

function ServiceCard({
  name,
  description,
  price,
  unit,
  currency,
  upsellEnabled,
  lang,
}: {
  name: string;
  description: string | null;
  price: number | null;
  unit: string | null;
  currency: string | null;
  upsellEnabled: boolean;
  lang: "pl" | "en";
}) {
  const priceLabel = formatPrice(price, unit, currency);

  const handleAsk = useCallback(() => {
    const prefill = t(lang, "upsell.askAbout").replace("{name}", name);
    router.navigate({
      pathname: "/(group)/messages" as any,
      params: { prefill },
    });
  }, [lang, name]);

  return (
    <View
      style={styles.serviceCard}
      accessibilityRole="text"
      accessibilityLabel={name}
    >
      <View style={styles.serviceIconCircle}>
        <Icon
          name="pricetag-outline"
          size={22}
          color={quickActionColors.services.icon}
        />
      </View>

      <View style={styles.serviceCardBody}>
        <Text style={styles.serviceCardName} numberOfLines={2}>
          {name}
        </Text>

        {description ? (
          <Text style={styles.serviceCardDescription} numberOfLines={3}>
            {description}
          </Text>
        ) : null}

        <View style={styles.serviceCardFooter}>
          {priceLabel ? (
            <View style={styles.servicePriceBadge}>
              <Text style={styles.servicePriceBadgeText}>{priceLabel}</Text>
            </View>
          ) : null}

          {upsellEnabled && (
            <Pressable
              style={styles.serviceAskBtn}
              onPress={handleAsk}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "upsell.ask")}
            >
              <Icon name="chatbubble-outline" size={14} color={group.white} />
              <Text style={styles.serviceAskBtnText}>{t(lang, "upsell.ask")}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function ServicesSection({
  services,
  upsellEnabled,
  lang,
}: {
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    unit: string | null;
    currency: string | null;
  }>;
  upsellEnabled: boolean;
  lang: "pl" | "en";
}) {
  if (services.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Icon name="bag-outline" size={40} color={group.textMuted} />
        <Text style={styles.emptyText}>{t(lang, "overview.noItems")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.servicesList}>
      {services.map((service) => (
        <ServiceCard
          key={service.id}
          name={service.name}
          description={service.description}
          price={service.price}
          unit={service.unit}
          currency={service.currency}
          upsellEnabled={upsellEnabled}
          lang={lang}
        />
      ))}
    </View>
  );
}

// =============================================================================
// Attractions Section
// =============================================================================

function AttractionCard({
  name,
  description,
  imageUrl,
  distance,
  mapUrl,
  websiteUrl,
  lang,
}: {
  name: string;
  description: string | null;
  imageUrl: string | null;
  distance: string | null;
  mapUrl: string | null;
  websiteUrl: string | null;
  lang: "pl" | "en";
}) {
  const hasImage = isImageUrlSafe(imageUrl);
  const hasMap = isExternalUrlSafe(mapUrl);
  const hasWebsite = isExternalUrlSafe(websiteUrl);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <View
      style={styles.attractionCard}
      accessibilityRole="text"
      accessibilityLabel={name}
    >
      {hasImage && !imageFailed ? (
        <Image
          source={{ uri: imageUrl as string }}
          style={styles.attractionThumbnail}
          accessibilityIgnoresInvertColors
          onError={() => setImageFailed(true)}
        />
      ) : null}

      <View style={styles.attractionCardContent}>
        <View style={styles.attractionCardTopRow}>
          <View style={styles.attractionIconCircle}>
            <Icon
              name="location-outline"
              size={20}
              color={quickActionColors.attractions.icon}
            />
          </View>
          <View style={styles.attractionCardTitleArea}>
            <Text style={styles.attractionCardName} numberOfLines={2}>
              {name}
            </Text>
            {distance ? (
              <View style={styles.attractionDistanceBadge}>
                <Text style={styles.attractionDistanceBadgeText}>
                  {distance}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {description ? (
          <Text style={styles.attractionCardDescription} numberOfLines={4}>
            {description}
          </Text>
        ) : null}

        {(hasMap || hasWebsite) ? (
          <View style={styles.attractionActionRow}>
            {hasMap ? (
              <Pressable
                style={styles.attractionActionBtn}
                onPress={() => safeOpenURL(mapUrl as string)}
                accessibilityRole="link"
                accessibilityLabel={t(lang, "overview.openMaps")}
              >
                <Icon
                  name="navigate-outline"
                  size={16}
                  color={group.primary}
                />
                <Text style={styles.attractionActionBtnText}>
                  {t(lang, "overview.openMaps")}
                </Text>
              </Pressable>
            ) : null}
            {hasWebsite ? (
              <Pressable
                style={styles.attractionActionBtn}
                onPress={() => safeOpenURL(websiteUrl as string)}
                accessibilityRole="link"
                accessibilityLabel={t(lang, "attractions.website")}
              >
                <Icon
                  name="globe-outline"
                  size={16}
                  color={group.primary}
                />
                <Text style={styles.attractionActionBtnText}>
                  {t(lang, "attractions.website")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function AttractionsSection({
  attractions,
  hotelAddress,
  lang,
}: {
  attractions: Array<{
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    distance: string | null;
    mapUrl: string | null;
    websiteUrl: string | null;
  }>;
  hotelAddress: string | null;
  lang: "pl" | "en";
}) {
  return (
    <View>
      {/* Hotel address -- "Open in Maps" */}
      {hotelAddress ? (
        <Pressable
          style={styles.attractionHotelMapsBtn}
          onPress={() =>
            safeOpenURL(
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotelAddress)}`,
            )
          }
          accessibilityRole="link"
          accessibilityLabel={t(lang, "attractions.openHotelMaps")}
        >
          <Icon name="map-outline" size={20} color={group.primary} />
          <View style={styles.attractionHotelMapsTextArea}>
            <Text style={styles.attractionHotelMapsLabel}>
              {t(lang, "attractions.openHotelMaps")}
            </Text>
            <Text style={styles.attractionHotelMapsAddress} numberOfLines={1}>
              {hotelAddress}
            </Text>
          </View>
          <Icon name="open-outline" size={16} color={group.textMuted} />
        </Pressable>
      ) : null}

      {attractions.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="compass-outline" size={40} color={group.textMuted} />
          <Text style={styles.emptyText}>{t(lang, "overview.noItems")}</Text>
        </View>
      ) : (
        <View style={styles.attractionsList}>
          {attractions.map((attraction) => (
            <AttractionCard
              key={attraction.id}
              name={attraction.name}
              description={attraction.description}
              imageUrl={attraction.imageUrl}
              distance={attraction.distance}
              mapUrl={attraction.mapUrl}
              websiteUrl={attraction.websiteUrl}
              lang={lang}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// =============================================================================
// FAQ Section
// =============================================================================

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = useCallback(() => {
    configureListAnimation();
    setExpanded((prev) => {
      Animated.timing(rotateAnim, {
        toValue: prev ? 0 : 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      return !prev;
    });
  }, [rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={styles.faqItem}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={question}
        accessibilityState={{ expanded }}
        style={styles.faqHeader}
      >
        <Text style={styles.faqQuestion}>{question}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon name="chevron-down" size={18} color={group.textMuted} />
        </Animated.View>
      </Pressable>
      {expanded && <Text style={styles.faqAnswer}>{answer}</Text>}
    </View>
  );
}

function FaqSection({
  faq,
  lang,
}: {
  faq: Array<{ id: string; question: string; answer: string }>;
  lang: "pl" | "en";
}) {
  if (faq.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Icon name="help-circle-outline" size={40} color={group.textMuted} />
        <Text style={styles.emptyText}>{t(lang, "group.faq.noItems")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.faqList}>
      {faq.map((item) => (
        <FaqItem key={item.id} question={item.question} answer={item.answer} />
      ))}
    </View>
  );
}

// =============================================================================
// Segment Control (4 tabs: Gallery, Services, Attractions, FAQ)
// Pattern matches rsvp.tsx SegmentControl
// =============================================================================

type SegmentId = "gallery" | "services" | "attractions" | "faq";

const SEGMENT_KEYS: readonly SegmentId[] = [
  "gallery",
  "services",
  "attractions",
  "faq",
] as const;

const SEGMENT_I18N: Record<SegmentId, string> = {
  gallery: "event.segment.gallery",
  services: "event.segment.services",
  attractions: "event.segment.attractions",
  faq: "event.segment.faq",
};

function SegmentControl({
  segments,
  activeIndex,
  onSelect,
}: {
  segments: readonly string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View style={styles.segmentRow} accessibilityRole="tablist">
      {segments.map((label, i) => {
        const isActive = i === activeIndex;
        return (
          <Pressable
            key={label}
            style={[styles.segmentItem, isActive && styles.segmentItemActive]}
            onPress={() => {
              if (!isActive) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(i);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <Text
              style={[
                styles.segmentText,
                isActive && styles.segmentTextActive,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// =============================================================================
// Main Screen Content
// =============================================================================

function EventScreenContent() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const { scrollTo } = useLocalSearchParams<{ scrollTo?: SectionId }>();

  // Read from shared portal-init cache
  const { data: initData } = useQuery({
    queryKey: ["portal-init", trackingId],
    queryFn: async () => {
      if (!trackingId) return null;
      const res = await fetchPortalInit(trackingId);
      return res.status === "success" ? res.data : null;
    },
    enabled: !!trackingId,
    staleTime: 60_000,
  });

  const portal = initData?.portal ?? null;

  // Feature flags (only for the 4 segment sections)
  const galleryEnabled = portal?.galleryEnabled ?? false;
  const servicesEnabled = portal?.servicesEnabled ?? false;
  const attractionsEnabled = portal?.attractionsEnabled ?? false;
  const faqEnabled = portal?.faqEnabled ?? false;

  // Data
  const gallery = (initData?.gallery ?? []) as GalleryItem[];
  const services = initData?.services ?? [];
  const attractions = initData?.attractions ?? [];
  const faq = initData?.faq ?? [];
  const hotelAddress = initData?.hotel?.address ?? null;

  // Build visible segments from feature flags
  const visibleSegments = useMemo(() => {
    const segs: SegmentId[] = [];
    if (galleryEnabled) segs.push("gallery");
    if (servicesEnabled) segs.push("services");
    if (attractionsEnabled) segs.push("attractions");
    if (faqEnabled) segs.push("faq");
    return segs;
  }, [galleryEnabled, servicesEnabled, attractionsEnabled, faqEnabled]);

  const segmentLabels = useMemo(
    () => visibleSegments.map((id) => t(lang, SEGMENT_I18N[id])),
    [visibleSegments, lang],
  );

  // Resolve initial segment from scrollTo route param
  const initialIndex = useMemo(() => {
    if (scrollTo && SEGMENT_KEYS.includes(scrollTo as SegmentId)) {
      const idx = visibleSegments.indexOf(scrollTo as SegmentId);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [scrollTo, visibleSegments]);

  const [activeSegmentIndex, setActiveSegmentIndex] = useState(initialIndex);

  // Ensure activeSegmentIndex stays in bounds when visibleSegments changes
  useEffect(() => {
    if (activeSegmentIndex >= visibleSegments.length && visibleSegments.length > 0) {
      setActiveSegmentIndex(0);
    }
  }, [activeSegmentIndex, visibleSegments.length]);

  const activeSegmentId = visibleSegments[activeSegmentIndex] ?? null;

  // If no segments are enabled, show empty state
  if (visibleSegments.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.emptyStateFullScreen}>
          <Icon name="compass-outline" size={48} color={group.textMuted} />
          <Text style={styles.emptyText}>{t(lang, "common.noData")}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Segment Control (fixed at top) */}
      <View style={styles.segmentWrapper}>
        <SegmentControl
          segments={segmentLabels}
          activeIndex={activeSegmentIndex}
          onSelect={setActiveSegmentIndex}
        />
      </View>

      {/* Scrollable content for the active segment */}
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        key={activeSegmentId}
      >
        {activeSegmentId === "gallery" && (
          <ErrorBoundary lang={lang}>
            <View style={styles.sectionContentNoHPad}>
              <GallerySection gallery={gallery} lang={lang} />
            </View>
          </ErrorBoundary>
        )}

        {activeSegmentId === "services" && (
          <ErrorBoundary lang={lang}>
            <View style={styles.sectionContent}>
              <ServicesSection services={services} upsellEnabled={portal?.upsellEnabled !== false} lang={lang} />
            </View>
          </ErrorBoundary>
        )}

        {activeSegmentId === "attractions" && (
          <ErrorBoundary lang={lang}>
            <View style={styles.sectionContent}>
              <AttractionsSection
                attractions={attractions}
                hotelAddress={hotelAddress}
                lang={lang}
              />
            </View>
          </ErrorBoundary>
        )}

        {activeSegmentId === "faq" && (
          <ErrorBoundary lang={lang}>
            <View style={styles.sectionContent}>
              <FaqSection faq={faq} lang={lang} />
            </View>
          </ErrorBoundary>
        )}
      </ScrollView>
    </View>
  );
}

// =============================================================================
// Default Export (ErrorBoundary wrapper)
// =============================================================================

export default function EventScreen() {
  const lang = useAppStore((s) => s.lang);
  return (
    <ErrorBoundary lang={lang}>
      <EventScreenContent />
    </ErrorBoundary>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: group.bg,
  },
  scroll: {
    paddingTop: spacing.md,
  },

  // ── Segment Control ──
  segmentWrapper: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: group.inputBg,
    borderRadius: radius.xl,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    minHeight: TOUCH_TARGET,
  },
  segmentItemActive: {
    backgroundColor: group.white,
    ...shadow.sm,
  },
  segmentText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
  },
  segmentTextActive: {
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },

  // ── Section Header ──
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  sectionHeaderBorder: {
    borderTopWidth: 1,
    borderTopColor: group.cardBorder,
    marginTop: spacing.lg,
  },
  sectionHeaderText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
    flex: 1,
  },

  // ── Section Content wrappers ──
  sectionContent: {
    paddingHorizontal: spacing.xl,
  },
  sectionContentNoHPad: {
    // Gallery horizontal strip needs edge-to-edge scrolling
  },

  // ── Shared Empty State ──
  emptyState: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing["3xl"],
  },
  emptyStateFullScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
    textAlign: "center",
  },

  // ── Agenda ──
  agendaDateSection: {
    marginBottom: spacing.xl,
  },
  agendaDateHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  agendaDateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: group.primary,
  },
  agendaDateHeaderText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  agendaCard: {
    backgroundColor: group.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    borderLeftWidth: 4,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  agendaCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  agendaTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: group.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  agendaTimeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },
  agendaCategoryBadge: {
    borderRadius: radius.sm,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
  agendaCategoryText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
  },
  agendaCardTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    lineHeight: 21,
  },
  agendaLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  agendaLocationText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },
  agendaDescriptionText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    lineHeight: 20,
  },
  agendaCalendarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: group.primaryLight,
    marginTop: spacing.xs,
    minHeight: TOUCH_TARGET,
  },
  agendaCalendarBtnText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.primary,
  },

  // ── Gallery ──
  galleryStrip: {
    paddingHorizontal: spacing.xl,
    gap: GALLERY_GAP,
  },
  galleryImageCard: {
    width: GALLERY_IMAGE_WIDTH,
    height: GALLERY_STRIP_HEIGHT,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: group.photoFallback,
    ...shadow.sm,
  },
  galleryImageThumb: {
    width: GALLERY_IMAGE_WIDTH,
    height: GALLERY_STRIP_HEIGHT,
    borderRadius: radius.lg,
  },
  galleryImageFallback: {
    width: GALLERY_IMAGE_WIDTH,
    height: GALLERY_STRIP_HEIGHT,
    borderRadius: radius.lg,
    backgroundColor: group.photoFallback,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryCaptionOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  galleryCaptionText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.white,
    lineHeight: 14,
  },

  // ── Services ──
  servicesList: {
    gap: spacing.md,
  },
  serviceCard: {
    flexDirection: "row",
    backgroundColor: group.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  serviceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: quickActionColors.services.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceCardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  serviceCardName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    lineHeight: 21,
  },
  serviceCardDescription: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    lineHeight: 18,
  },
  servicePriceBadge: {
    alignSelf: "flex-start",
    backgroundColor: quickActionColors.services.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    marginTop: spacing.xs,
  },
  servicePriceBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: quickActionColors.services.icon,
  },
  serviceCardFooter: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  serviceAskBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
    backgroundColor: group.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: TOUCH_TARGET,
  },
  serviceAskBtnText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },

  // ── Attractions ──
  attractionsList: {
    gap: spacing.md,
  },
  attractionCard: {
    backgroundColor: group.white,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.sm,
  },
  attractionThumbnail: {
    width: "100%",
    height: 160,
    backgroundColor: group.photoFallback,
  },
  attractionCardContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  attractionCardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  attractionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: quickActionColors.attractions.bg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xxs,
  },
  attractionCardTitleArea: {
    flex: 1,
    gap: spacing.xs,
  },
  attractionCardName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    lineHeight: 21,
  },
  attractionDistanceBadge: {
    alignSelf: "flex-start",
    backgroundColor: quickActionColors.attractions.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  attractionDistanceBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: quickActionColors.attractions.icon,
  },
  attractionCardDescription: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    lineHeight: 18,
  },
  attractionActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  attractionActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: group.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: TOUCH_TARGET,
  },
  attractionActionBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },
  attractionHotelMapsBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.primaryLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    minHeight: 44,
    marginBottom: spacing.md,
  },
  attractionHotelMapsTextArea: {
    flex: 1,
    gap: spacing.xxs,
  },
  attractionHotelMapsLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },
  attractionHotelMapsAddress: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
  },

  // ── FAQ ──
  faqList: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    overflow: "hidden",
    ...shadow.sm,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: group.cardBorder,
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  faqQuestion: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    flex: 1,
    paddingRight: spacing.md,
    lineHeight: 21,
  },
  faqAnswer: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
});

// =============================================================================
// Viewer Styles (fullscreen modal for gallery)
// =============================================================================

const viewerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  tapArea: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    flex: 1,
  },

  // Top bar
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  counterContainer: {
    flex: 1,
    alignItems: "center",
  },
  counterText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.white,
  },
  closeBtn: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.sm,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  captionText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.white,
    lineHeight: 22,
  },
  altText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    lineHeight: 18,
  },

  // Nav buttons
  navBtn: {
    position: "absolute",
    top: "50%",
    marginTop: -(TOUCH_TARGET / 2),
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnLeft: {
    left: spacing.md,
  },
  navBtnRight: {
    right: spacing.md,
  },
});
