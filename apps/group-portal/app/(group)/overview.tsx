// =============================================================================
// Group Portal — Overview (data-driven from /init endpoint)
// Matches web portal: hero, timeline, quick actions, FAQ, contact footer
// =============================================================================

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
  Animated,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  group,
  quickActionColors,
  timeline,
  fontSize,
  radius,
  spacing,
  shadow,
  letterSpacing,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import type { IconName } from "@/lib/icons";
import { useSlideUp, useScalePress, configureListAnimation } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { logout } from "@/lib/auth";
import { fetchPortalInit } from "@/lib/group-api";
import type { AgendaItemData, GroupAnnouncementData, PortalInitData } from "@/lib/types";

// =============================================================================
// Helpers
// =============================================================================

function relativeTime(dateStr: string, lang: "pl" | "en"): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return t(lang, "group.timeAgo.now");
  if (diffMin < 60) return `${diffMin} ${t(lang, "group.timeAgo.minutesAgo")}`;
  if (diffHr < 24) return `${diffHr} ${t(lang, "group.timeAgo.hoursAgo")}`;
  return `${diffDay} ${t(lang, "group.timeAgo.daysAgo")}`;
}

function formatDate(dateStr: string | null | undefined, lang: "pl" | "en"): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function countdownLabel(diffDays: number, lang: "pl" | "en"): string {
  if (diffDays < 0) return t(lang, "overview.hero.ended");
  if (diffDays === 0) return t(lang, "overview.hero.inProgress");
  if (diffDays === 1) return t(lang, "overview.hero.daysUntilOne");
  return t(lang, "overview.hero.daysUntil").replace("{n}", String(diffDays));
}

/** Map social platform names to Ionicon names */
function socialIcon(platform: string): IconName {
  const p = platform.toLowerCase();
  if (p.includes("facebook") || p.includes("fb")) return "logo-facebook";
  if (p.includes("instagram") || p.includes("ig")) return "logo-instagram";
  if (p.includes("twitter") || p.includes("x")) return "logo-twitter";
  if (p.includes("linkedin")) return "logo-linkedin";
  if (p.includes("youtube")) return "logo-youtube";
  if (p.includes("tiktok")) return "logo-tiktok";
  return "globe-outline";
}

/** Map timeline checkpoint icon string to Ionicon name */
function checkpointIcon(icon: string | undefined): IconName {
  if (!icon) return "ellipse";
  const m: Record<string, IconName> = {
    check: "checkmark-circle",
    calendar: "calendar-outline",
    people: "people-outline",
    document: "document-text-outline",
    camera: "camera-outline",
    home: "home-outline",
    bed: "bed-outline",
    star: "star-outline",
  };
  return m[icon] ?? "ellipse";
}

// =============================================================================
// QUICK ACTIONS config
// =============================================================================

const QUICK_ACTIONS: Array<{
  labelKey: string;
  icon: IconName;
  tab: string;
  bg: string;
  color: string;
}> = [
  { labelKey: "group.quickGuests", icon: "people", tab: "guests", bg: quickActionColors.guests.bg, color: quickActionColors.guests.icon },
  { labelKey: "group.quickDocuments", icon: "document-text", tab: "documents", bg: quickActionColors.documents.bg, color: quickActionColors.documents.icon },
  { labelKey: "overview.quickAnnouncements", icon: "megaphone", tab: "_announcements", bg: quickActionColors.announcements.bg, color: quickActionColors.announcements.icon },
  { labelKey: "group.quickMessages", icon: "chatbubbles", tab: "messages", bg: quickActionColors.messages.bg, color: quickActionColors.messages.icon },
  { labelKey: "group.quickPhotos", icon: "images", tab: "photos", bg: quickActionColors.photos.bg, color: quickActionColors.photos.icon },
];

// =============================================================================
// Sub-components
// =============================================================================

// -- Quick Action Circle (colored icon in grid) --------------------------------

function QuickActionCircle({
  label,
  iconName,
  bg,
  color,
  onPress,
}: {
  label: string;
  iconName: IconName;
  bg: string;
  color: string;
  onPress: () => void;
}) {
  const { scaleStyle, onPressIn, onPressOut } = useScalePress(0.92);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.quickActionItem}
    >
      <Animated.View style={scaleStyle}>
        <View style={[styles.quickActionCircle, { backgroundColor: bg }]}>
          <Icon name={iconName} size={24} color={color} />
        </View>
        <Text style={styles.quickActionLabel} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// -- Announcement Card --------------------------------------------------------

function AnnouncementCard({
  announcement,
  index,
  lang,
}: {
  announcement: GroupAnnouncementData;
  index: number;
  lang: "pl" | "en";
}) {
  const slideStyle = useSlideUp(100 + index * 80, 16);

  return (
    <Animated.View style={slideStyle}>
      <View style={styles.announcementCard}>
        {announcement.imageUrl && (
          <Image
            source={{ uri: announcement.imageUrl }}
            style={styles.announcementImage}
            resizeMode="cover"
            accessibilityLabel={announcement.content}
          />
        )}
        <View style={styles.announcementBody}>
          {announcement.isPinned && (
            <View style={styles.pinBadge}>
              <Icon name="pin" size={14} color={group.primary} />
            </View>
          )}
          <Text style={styles.announcementText}>{announcement.content}</Text>
          <Text style={styles.announcementDate}>
            {relativeTime(announcement.createdAt, lang)}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// -- FAQ Accordion Item -------------------------------------------------------

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
        style={styles.faqHeader}
      >
        <Text style={styles.faqQuestion}>{question}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon name="chevron-down" size={18} color={group.textMuted} />
        </Animated.View>
      </Pressable>
      {expanded && (
        <Text style={styles.faqAnswer}>{answer}</Text>
      )}
    </View>
  );
}

// -- Timeline Stepper (horizontal) --------------------------------------------

function TimelineStepper({
  checkpoints,
  lang,
}: {
  checkpoints: PortalInitData["portal"]["timelineCheckpoints"];
  lang: "pl" | "en";
}) {
  if (!checkpoints.length) return null;

  // Find the last completed step index
  const lastCompleteIdx = checkpoints.reduce(
    (acc, cp, idx) => (cp.isComplete ? idx : acc),
    -1,
  );
  // Current step is the first incomplete one (or last if all complete)
  const currentIdx = lastCompleteIdx + 1 < checkpoints.length ? lastCompleteIdx + 1 : lastCompleteIdx;

  return (
    <View style={styles.stepperContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stepperScroll}
      >
        {checkpoints.map((cp, idx) => {
          const isComplete = cp.isComplete === true;
          const isCurrent = idx === currentIdx && !isComplete;
          const isFuture = !isComplete && !isCurrent;
          const label = lang === "en" && cp.labelEn ? cp.labelEn : cp.label;

          return (
            <View key={idx} style={styles.stepperStep}>
              {/* Connecting line (before dot, except for first) */}
              {idx > 0 && (
                <View
                  style={[
                    styles.stepperLine,
                    { backgroundColor: isComplete || isCurrent ? group.primary : timeline.inactive },
                  ]}
                />
              )}
              {/* Dot */}
              <View
                style={[
                  styles.stepperDot,
                  isComplete && styles.stepperDotComplete,
                  isCurrent && styles.stepperDotCurrent,
                  isFuture && styles.stepperDotFuture,
                ]}
              >
                {isComplete ? (
                  <Icon name="checkmark" size={12} color={group.white} />
                ) : isCurrent ? (
                  <View style={styles.stepperPulseInner} />
                ) : null}
              </View>
              {/* Label + date */}
              <Text
                style={[
                  styles.stepperLabel,
                  (isComplete || isCurrent) && styles.stepperLabelActive,
                ]}
                numberOfLines={2}
              >
                {label}
              </Text>
              {cp.date && (
                <Text style={styles.stepperDate}>
                  {formatDate(cp.date, lang).replace(/\s\d{4}$/, "")}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// =============================================================================
// Main Screen
// =============================================================================

export default function OverviewScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";

  const [showAllAgenda, setShowAllAgenda] = useState(false);
  const [ctaDismissed, setCtaDismissed] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const announcementsRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);

  const handleLogout = useCallback(() => {
    Alert.alert(t(lang, "group.logout"), t(lang, "group.logoutConfirm"), [
      { text: t(lang, "common.cancel"), style: "cancel" },
      {
        text: t(lang, "group.logout"),
        style: "destructive",
        onPress: async () => {
          await logout();
          useAppStore.getState().reset();
          router.replace("/");
        },
      },
    ]);
  }, [lang]);

  // -- Entrance animations --
  const headerSlide = useSlideUp(0, 12);
  const heroSlide = useSlideUp(80, 16);
  const quickActionsSlide = useSlideUp(160, 12);

  // -- Data fetching via /init --
  const {
    data: initData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["portal-init", trackingId],
    queryFn: async () => {
      if (!trackingId) return null;
      const res = await fetchPortalInit(trackingId);
      return res.status === "success" ? res.data : null;
    },
    enabled: !!trackingId,
    staleTime: 60_000,
  });

  const {
    portal,
    event,
    hotel,
    salesperson,
    socialLinks,
    faq,
    agendaItems: agenda,
    announcements,
    totalGuestCount,
  } = initData ?? {};

  // -- Tick counter for countdown refresh every 60s --
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((prev) => prev + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // -- Countdown from event.checkInDate --
  const diffDays = useMemo(() => {
    const dateStr = event?.checkInDate;
    if (!dateStr) return null;
    const target = new Date(dateStr);
    if (isNaN(target.getTime())) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / 86400000);
  }, [event?.checkInDate, tick]);

  // -- Pull-to-refresh --
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // -- Agenda slicing --
  const agendaItems = useMemo(() => {
    if (!agenda?.length) return [];
    return showAllAgenda ? agenda : agenda.slice(0, 5);
  }, [agenda, showAllAgenda]);

  const handleSeeAll = useCallback(() => {
    configureListAnimation();
    setShowAllAgenda(true);
  }, []);

  const handleQuickAction = useCallback((tab: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (tab === "_announcements") {
      // Scroll to announcements section
      announcementsRef.current?.measureLayout(
        scrollRef.current?.getInnerViewNode() as any,
        (_x: number, y: number) => {
          scrollRef.current?.scrollTo({ y, animated: true });
        },
        () => {},
      );
      return;
    }
    router.navigate(`/(group)/${tab}` as any);
  }, []);

  // -- Cover image source --
  const hasCover = !!hotel?.coverImageUrl && !coverError;

  // -- Show CTA? --
  const showCta =
    !ctaDismissed &&
    totalGuestCount === 0 &&
    diffDays !== null &&
    diffDays > 0;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={group.primary}
          />
        }
      >
        {/* ================================================================= */}
        {/* A. HEADER: Hotel logo + name, lang toggle, logout                 */}
        {/* ================================================================= */}
        <Animated.View style={[headerSlide, { paddingTop: insets.top + spacing.md }]}>
          <View accessibilityRole="header" style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {hotel?.logoUrl ? (
                <Image
                  source={{ uri: hotel.logoUrl }}
                  style={styles.hotelLogo}
                  resizeMode="contain"
                  accessibilityLabel={hotel.name}
                />
              ) : null}
              <Text style={styles.hotelNameHeader} numberOfLines={1}>
                {hotel?.name ?? t(lang, "group.portalTitle")}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setLang(lang === "pl" ? "en" : "pl")}
                style={styles.langToggle}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "group.language")}
              >
                <Text style={styles.langText}>
                  {lang === "pl" ? "EN" : "PL"}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleLogout}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "group.logout")}
                style={styles.logoutBtn}
              >
                <Icon name="log-out-outline" size={22} color={group.textMuted} />
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* ================================================================= */}
        {/* LOADING STATE                                                     */}
        {/* ================================================================= */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={group.primary} size="large" />
            <Text style={styles.loadingText}>{t(lang, "common.loading")}</Text>
          </View>
        )}

        {/* ================================================================= */}
        {/* ERROR STATE                                                       */}
        {/* ================================================================= */}
        {isError && !isLoading && (
          <View style={styles.errorCard}>
            <Icon name="alert-circle-outline" size={32} color={group.textMuted} />
            <Text style={styles.errorText}>{t(lang, "common.error")}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => refetch()}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.retry")}
            >
              <Text style={styles.retryBtnText}>
                {t(lang, "common.retry")}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ================================================================= */}
        {/* B. HERO SECTION: Cover image + event info                         */}
        {/* ================================================================= */}
        {!isLoading && !isError && initData && (
          <Animated.View style={heroSlide}>
            <View style={styles.heroContainer}>
              {/* Cover image or gradient placeholder */}
              {hasCover ? (
                <Image
                  source={{ uri: hotel!.coverImageUrl! }}
                  style={styles.heroCoverImage}
                  resizeMode="cover"
                  onError={() => setCoverError(true)}
                  accessibilityLabel={event?.name ?? "Cover"}
                />
              ) : (
                <LinearGradient
                  colors={[group.primary, group.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroCoverImage}
                />
              )}

              {/* Dark gradient overlay */}
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.7)"]}
                style={styles.heroOverlay}
              />

              {/* Countdown badge (top-left) */}
              {diffDays !== null && (
                <View style={styles.heroCountdownBadge}>
                  <Text style={styles.heroCountdownText}>
                    {countdownLabel(diffDays, lang)}
                  </Text>
                </View>
              )}

              {/* Event name + address (bottom overlay) */}
              <View style={styles.heroBottomOverlay}>
                <Text style={styles.heroEventName} numberOfLines={2}>
                  {event?.name ?? "\u2014"}
                </Text>
                {hotel?.address && (
                  <View style={styles.heroAddressRow}>
                    <Icon name="location-outline" size={14} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.heroAddress} numberOfLines={1}>
                      {hotel.address}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Below image: date range + guest count */}
            <View style={styles.heroInfoRow}>
              <View style={styles.heroInfoItem}>
                <Icon name="calendar-outline" size={16} color={group.primary} />
                <Text style={styles.heroInfoText}>
                  {formatDate(event?.checkInDate, lang)}
                  {event?.checkOutDate ? ` \u2013 ${formatDate(event.checkOutDate, lang)}` : ""}
                </Text>
              </View>
              {(event?.guestCount ?? 0) > 0 && (
                <View style={styles.heroInfoItem}>
                  <Icon name="people-outline" size={16} color={group.primary} />
                  <Text style={styles.heroInfoText}>
                    {event!.guestCount} {t(lang, "overview.guestsLabel")}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* ================================================================= */}
        {/* C. TIMELINE STEPPER                                               */}
        {/* ================================================================= */}
        {!isLoading && portal?.timelineCheckpoints && portal.timelineCheckpoints.length > 0 && (
          <TimelineStepper checkpoints={portal.timelineCheckpoints} lang={lang} />
        )}

        {/* ================================================================= */}
        {/* D. CTA ALERT                                                      */}
        {/* ================================================================= */}
        {showCta && (
          <View style={styles.ctaContainer}>
            <View style={styles.ctaContent}>
              <Icon name="people-outline" size={20} color={group.white} />
              <Text style={styles.ctaText}>
                {t(lang, "overview.cta.addGuests")}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.navigate("/(group)/guests" as any);
              }}
              style={styles.ctaBtn}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "overview.cta.addGuests")}
            >
              <Icon name="arrow-forward" size={18} color={group.primary} />
            </Pressable>
            <Pressable
              onPress={() => setCtaDismissed(true)}
              style={styles.ctaDismiss}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.close")}
            >
              <Icon name="close" size={16} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>
        )}

        {/* ================================================================= */}
        {/* E. QUICK ACTIONS (colored grid)                                   */}
        {/* ================================================================= */}
        {!isLoading && !isError && initData && (
          <Animated.View style={quickActionsSlide}>
            <View style={styles.quickActionsGrid}>
              {QUICK_ACTIONS.map((action) => (
                <QuickActionCircle
                  key={action.tab}
                  label={t(lang, action.labelKey)}
                  iconName={action.icon}
                  bg={action.bg}
                  color={action.color}
                  onPress={() => handleQuickAction(action.tab)}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* ================================================================= */}
        {/* F. ANNOUNCEMENTS SECTION                                          */}
        {/* ================================================================= */}
        {!isLoading && !isError && initData && (
          <View ref={announcementsRef} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t(lang, "group.announcements")}
            </Text>

            {!announcements?.length ? (
              <View style={styles.emptyCard}>
                <Icon name="megaphone-outline" size={36} color={group.textMuted} />
                <Text style={styles.emptyText}>
                  {t(lang, "group.noAnnouncements")}
                </Text>
              </View>
            ) : (
              <View style={styles.announcementsList}>
                {announcements.map((a, idx) => (
                  <AnnouncementCard
                    key={a.id}
                    announcement={a}
                    index={idx}
                    lang={lang}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ================================================================= */}
        {/* G. AGENDA PREVIEW                                                 */}
        {/* ================================================================= */}
        {!isLoading && !isError && initData && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {t(lang, "group.agenda")}
              </Text>
              {agenda && agenda.length > 5 && !showAllAgenda && (
                <Pressable
                  onPress={handleSeeAll}
                  accessibilityRole="button"
                  accessibilityLabel={t(lang, "group.seeAllAgenda")}
                  style={styles.seeAllBtn}
                >
                  <Text style={styles.seeAllText}>
                    {t(lang, "group.seeAllAgenda")}
                  </Text>
                  <Icon name="chevron-forward" size={14} color={group.primary} />
                </Pressable>
              )}
            </View>

            {!agenda?.length ? (
              <View style={styles.emptyCard}>
                <Icon name="calendar-outline" size={36} color={group.textMuted} />
                <Text style={styles.emptyText}>
                  {t(lang, "group.noAgenda")}
                </Text>
              </View>
            ) : (
              <View style={styles.timelineContainer}>
                {agendaItems.map((item, idx) => (
                  <View key={item.id} style={styles.timelineRow}>
                    {/* Timeline rail */}
                    <View style={styles.timelineRail}>
                      <View style={styles.timelineDot} />
                      {idx < agendaItems.length - 1 && (
                        <View style={styles.timelineLine} />
                      )}
                    </View>
                    {/* Content */}
                    <View style={styles.agendaCard}>
                      <View style={styles.agendaTimePill}>
                        <Text style={styles.agendaTimeText}>
                          {item.startTime ?? "\u2014"}
                        </Text>
                      </View>
                      <Text style={styles.agendaTitle}>{item.title}</Text>
                      {item.location && (
                        <View style={styles.agendaLocationRow}>
                          <Icon name="location-outline" size={12} color={group.textMuted} />
                          <Text style={styles.agendaLocation}>
                            {item.location}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ================================================================= */}
        {/* H. FAQ SECTION                                                    */}
        {/* ================================================================= */}
        {!isLoading && !isError && faq && faq.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t(lang, "overview.faq.title")}
            </Text>
            <View style={styles.faqList}>
              {faq.map((item) => (
                <FaqItem
                  key={item.id}
                  question={item.question}
                  answer={item.answer}
                />
              ))}
            </View>
          </View>
        )}

        {/* ================================================================= */}
        {/* I. HOTEL CONTACT FOOTER                                           */}
        {/* ================================================================= */}
        {!isLoading && !isError && initData && (
          <View style={styles.contactFooter}>
            <Text style={styles.contactTitle}>
              {t(lang, "overview.contact.title")}
            </Text>

            {/* Hotel info */}
            <View style={styles.contactRow}>
              <Icon name="business-outline" size={18} color={group.primary} />
              <Text style={styles.contactText}>{hotel?.name ?? "\u2014"}</Text>
            </View>
            {hotel?.address && (
              <View style={styles.contactRow}>
                <Icon name="location-outline" size={18} color={group.primary} />
                <Text style={styles.contactText}>{hotel.address}</Text>
              </View>
            )}
            {hotel?.phone && (
              <Pressable
                onPress={() => Linking.openURL(`tel:${hotel.phone}`)}
                style={styles.contactRow}
                accessibilityRole="link"
              >
                <Icon name="call-outline" size={18} color={group.primary} />
                <Text style={[styles.contactText, styles.contactLink]}>
                  {hotel.phone}
                </Text>
              </Pressable>
            )}
            {hotel?.email && (
              <Pressable
                onPress={() => Linking.openURL(`mailto:${hotel.email}`)}
                style={styles.contactRow}
                accessibilityRole="link"
              >
                <Icon name="mail-outline" size={18} color={group.primary} />
                <Text style={[styles.contactText, styles.contactLink]}>
                  {hotel.email}
                </Text>
              </Pressable>
            )}

            {/* Salesperson / event manager */}
            {salesperson && (salesperson.name || salesperson.email || salesperson.phone) && (
              <View style={styles.contactManagerSection}>
                <Text style={styles.contactManagerLabel}>
                  {t(lang, "overview.contact.eventManager")}
                </Text>
                {salesperson.name && (
                  <View style={styles.contactRow}>
                    <Icon name="person-outline" size={18} color={group.primary} />
                    <Text style={styles.contactText}>{salesperson.name}</Text>
                  </View>
                )}
                {salesperson.email && (
                  <Pressable
                    onPress={() => Linking.openURL(`mailto:${salesperson.email}`)}
                    style={styles.contactRow}
                    accessibilityRole="link"
                  >
                    <Icon name="mail-outline" size={18} color={group.primary} />
                    <Text style={[styles.contactText, styles.contactLink]}>
                      {salesperson.email}
                    </Text>
                  </Pressable>
                )}
                {salesperson.phone && (
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${salesperson.phone}`)}
                    style={styles.contactRow}
                    accessibilityRole="link"
                  >
                    <Icon name="call-outline" size={18} color={group.primary} />
                    <Text style={[styles.contactText, styles.contactLink]}>
                      {salesperson.phone}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Social links */}
            {socialLinks && socialLinks.length > 0 && (
              <View style={styles.socialRow}>
                {socialLinks.map((link, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => Linking.openURL(link.url)}
                    accessibilityRole="link"
                    accessibilityLabel={link.platform}
                    style={styles.socialIconBtn}
                  >
                    <Icon name={socialIcon(link.platform)} size={22} color={group.primary} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Powered by */}
            <Text style={styles.poweredBy}>
              {t(lang, "overview.poweredBy")}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// =============================================================================
// Styles
// =============================================================================

const HERO_HEIGHT = 200;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: group.bg,
  },
  scroll: {
    gap: spacing.xl,
  },

  // ── Header ──
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing["2xl"],
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  hotelLogo: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
  },
  hotelNameHeader: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    letterSpacing: letterSpacing.tight,
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  langToggle: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: group.surface,
  },
  langText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },
  logoutBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Loading ──
  loadingContainer: {
    paddingVertical: spacing["6xl"],
    alignItems: "center",
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },

  // ── Error ──
  errorCard: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing["2xl"],
    marginHorizontal: spacing["2xl"],
    alignItems: "center",
    gap: spacing.md,
    ...shadow.md,
  },
  errorText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 21,
  },
  retryBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing["2xl"],
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  retryBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },

  // ── Hero Section ──
  heroContainer: {
    height: HERO_HEIGHT,
    borderRadius: radius["2xl"],
    overflow: "hidden",
    marginHorizontal: spacing["2xl"],
    position: "relative",
    ...shadow.lg,
  },
  heroCoverImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
    top: 0,
    left: 0,
  },
  heroOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT * 0.7,
  },
  heroCountdownBadge: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  heroCountdownText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
  heroBottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroEventName: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: group.white,
    letterSpacing: letterSpacing.tight,
  },
  heroAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  heroAddress: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    flex: 1,
  },
  heroInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing.md,
  },
  heroInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  heroInfoText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.textSecondary,
  },

  // ── Timeline Stepper ──
  stepperContainer: {
    paddingLeft: spacing["2xl"],
  },
  stepperScroll: {
    flexDirection: "row",
    gap: 0,
    paddingRight: spacing["2xl"],
  },
  stepperStep: {
    alignItems: "center",
    width: 80,
    position: "relative",
  },
  stepperLine: {
    position: "absolute",
    top: 11,
    right: 40,
    left: -40,
    height: 2,
    zIndex: -1,
  },
  stepperDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  stepperDotComplete: {
    backgroundColor: group.primary,
  },
  stepperDotCurrent: {
    backgroundColor: group.white,
    borderWidth: 3,
    borderColor: group.primary,
  },
  stepperDotFuture: {
    backgroundColor: group.white,
    borderWidth: 2,
    borderColor: timeline.inactive,
  },
  stepperPulseInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: group.primary,
  },
  stepperLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 14,
  },
  stepperLabelActive: {
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  stepperDate: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    marginTop: 2,
  },

  // ── CTA Alert ──
  ctaContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.primary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing["2xl"],
    ...shadow.md,
  },
  ctaContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  ctaText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
    flex: 1,
  },
  ctaBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: group.white,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
  ctaDismiss: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.xs,
  },

  // ── Quick Actions Grid ──
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  quickActionItem: {
    alignItems: "center",
    width: 64,
  },
  quickActionCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
    ...shadow.sm,
  },
  quickActionLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: group.textSecondary,
    textAlign: "center",
    lineHeight: 14,
  },

  // ── Section ──
  section: {
    gap: spacing.md,
    paddingHorizontal: spacing["2xl"],
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    lineHeight: 24,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  seeAllText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
  },

  // ── Empty State ──
  emptyCard: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing["3xl"],
    alignItems: "center",
    gap: spacing.md,
    ...shadow.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },

  // ── Timeline Agenda ──
  timelineContainer: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: "row",
    minHeight: 72,
  },
  timelineRail: {
    width: 24,
    alignItems: "center",
    paddingTop: 6,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: group.primary,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: group.primaryLight,
    marginTop: 4,
  },
  agendaCard: {
    flex: 1,
    backgroundColor: group.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing.lg,
    marginLeft: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
    ...shadow.sm,
  },
  agendaTimePill: {
    alignSelf: "flex-start",
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
  agendaTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.text,
    lineHeight: 21,
  },
  agendaLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  agendaLocation: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },

  // ── Announcements ──
  announcementsList: {
    gap: spacing.md,
  },
  announcementCard: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    overflow: "hidden",
    ...shadow.md,
  },
  announcementImage: {
    width: "100%",
    height: 180,
  },
  announcementBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pinBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
  },
  announcementText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    lineHeight: 22,
    paddingRight: spacing["2xl"],
  },
  announcementDate: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
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

  // ── Contact Footer ──
  contactFooter: {
    backgroundColor: group.card,
    borderRadius: radius["2xl"],
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing["2xl"],
    marginHorizontal: spacing["2xl"],
    gap: spacing.md,
    ...shadow.md,
  },
  contactTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    marginBottom: spacing.xs,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 32,
  },
  contactText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  contactLink: {
    color: group.primary,
    textDecorationLine: "underline",
  },
  contactManagerSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: group.cardBorder,
    gap: spacing.sm,
  },
  contactManagerLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  socialRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: group.cardBorder,
  },
  socialIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: group.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  poweredBy: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: group.cardBorder,
  },
});
