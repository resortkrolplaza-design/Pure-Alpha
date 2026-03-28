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
  Platform,
  Modal,
  TextInput,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import {
  group,
  quickActionColors,
  timeline,
  semantic,
  fontSize,
  radius,
  spacing,
  shadow,
  letterSpacing,
  TOUCH_TARGET,
} from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import type { IconName } from "@/lib/icons";
import { useSlideUp, useScalePress } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { logout, setPersistedLang, getSecureItem, setSecureItem } from "@/lib/auth";
import { isImageUrlSafe, isExternalUrlSafe, sanitizePhone, sanitizeEmail } from "@/lib/url-safety";
import { fetchPortalInit, fetchPolls, votePoll, groupFetch } from "@/lib/group-api";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { GroupAnnouncementData, PortalInitData, PollData } from "@/lib/types";

// =============================================================================
// DeviceId (stable per install, used for poll vote dedup -- same as polls.tsx)
// =============================================================================

function getDeviceId(): string {
  const id =
    Constants.installationId ??
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
      ?.installationId ??
    null;
  return typeof id === "string" && id.length >= 8
    ? id
    : `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const DEVICE_ID = getDeviceId();

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

// Safe URL opener -- prevents crash in Expo Go dev mode
async function safeOpenURL(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await safeOpenURL(url);
    }
  } catch {
    /* silently ignore -- Expo Go dev mode throws on some URLs */
  }
}

// =============================================================================
// Live Event Banner — pulsing green dot + "Event is live!" text
// =============================================================================

function LiveEventBanner({ lang }: { lang: "pl" | "en" }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View
      style={styles.liveBanner}
      accessibilityRole="text"
      accessibilityLabel={t(lang, "overview.liveEvent")}
    >
      <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
      <Text style={styles.liveBannerText}>{t(lang, "overview.liveEvent")}</Text>
    </View>
  );
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

// =============================================================================
// QUICK ACTIONS config
// =============================================================================

const QUICK_ACTIONS: Array<{
  labelKey: string;
  icon: IconName;
  tab: string;
  params?: Record<string, string>;
  bg: string;
  color: string;
  flag?: string;
  organizerOnly?: boolean;
}> = [
  { labelKey: "quickAction.rsvp", icon: "checkmark-circle", tab: "rsvp", bg: quickActionColors.rsvp.bg, color: quickActionColors.rsvp.icon },
  { labelKey: "group.quickGuests", icon: "people", tab: "rsvp", params: { section: "guests" }, bg: quickActionColors.guests.bg, color: quickActionColors.guests.icon, flag: "guestListEnabled", organizerOnly: true },
  { labelKey: "quickAction.agenda", icon: "calendar", tab: "event", params: { scrollTo: "agenda" }, bg: quickActionColors.agenda.bg, color: quickActionColors.agenda.icon, flag: "agendaEnabled" },
  { labelKey: "group.quickMessages", icon: "chatbubbles", tab: "messages", bg: quickActionColors.messages.bg, color: quickActionColors.messages.icon, flag: "messagingEnabled" },
  { labelKey: "group.quickDocuments", icon: "document-text", tab: "rsvp", params: { section: "documents" }, bg: quickActionColors.documents.bg, color: quickActionColors.documents.icon, flag: "documentsEnabled", organizerOnly: true },
  { labelKey: "group.quickPhotos", icon: "camera", tab: "photos", bg: quickActionColors.photos.bg, color: quickActionColors.photos.icon, flag: "photoWallEnabled" },
  { labelKey: "quickAction.gallery", icon: "images", tab: "event", params: { scrollTo: "gallery" }, bg: quickActionColors.gallery.bg, color: quickActionColors.gallery.icon, flag: "galleryEnabled" },
  { labelKey: "quickAction.services", icon: "pricetag", tab: "event", params: { scrollTo: "services" }, bg: quickActionColors.services.bg, color: quickActionColors.services.icon, flag: "servicesEnabled" },
  { labelKey: "quickAction.attractions", icon: "compass", tab: "event", params: { scrollTo: "attractions" }, bg: quickActionColors.attractions.bg, color: quickActionColors.attractions.icon, flag: "attractionsEnabled" },
  { labelKey: "quickAction.faq", icon: "help-circle", tab: "event", params: { scrollTo: "faq" }, bg: quickActionColors.faq.bg, color: quickActionColors.faq.icon, flag: "faqEnabled" },
  { labelKey: "quickAction.polls", icon: "bar-chart", tab: "messages", params: { tab: "polls" }, bg: quickActionColors.polls.bg, color: quickActionColors.polls.icon, flag: "pollsEnabled" },
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
        {isImageUrlSafe(announcement.imageUrl) && (
          <Image
            source={{ uri: announcement.imageUrl! }}
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
            <View
              key={idx}
              style={styles.stepperStep}
              accessibilityLabel={`${label}${cp.date ? `, ${formatDate(cp.date, lang)}` : ""}${isComplete ? ` (${t(lang, "overview.timeline.complete")})` : isCurrent ? ` (${t(lang, "overview.timeline.current")})` : ""}`}
            >
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
// Poll Popup Modal (auto-show first active unvoted poll on overview load)
// =============================================================================

function PollPopupModal({
  poll,
  lang,
  visible,
  onDismiss,
}: {
  poll: PollData;
  lang: "pl" | "en";
  visible: boolean;
  onDismiss: () => void;
}) {
  const queryClient = useQueryClient();
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const [votedIdx, setVotedIdx] = useState<number | null>(null);

  const voteMutation = useMutation({
    mutationFn: (optionIdx: number) =>
      votePoll(trackingId, poll.id, optionIdx, DEVICE_ID),
    onSuccess: (_data, optionIdx) => {
      setVotedIdx(optionIdx);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["polls", trackingId] });
      // Auto-dismiss after brief delay so user sees their vote
      setTimeout(() => {
        onDismiss();
      }, 1200);
    },
  });

  const options = poll.options ?? [];
  const voteCounts = poll.voteCounts ?? [];
  const totalVotes = poll.totalVotes ?? 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable
        style={pollStyles.overlay}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t(lang, "pollPopup.skip")}
      >
        <Pressable
          style={pollStyles.card}
          onPress={() => {}}
          accessibilityRole="none"
        >
          {/* Header */}
          <View style={pollStyles.header}>
            <Icon name="bar-chart-outline" size={22} color={group.primary} />
            <Text style={pollStyles.headerLabel}>
              {t(lang, "polls.title")}
            </Text>
          </View>

          {/* Question */}
          <Text style={pollStyles.question}>{String(poll.question)}</Text>

          {/* Options */}
          <View style={pollStyles.optionsList}>
            {options.map((option, idx) => {
              const count = voteCounts[idx] ?? 0;
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isVoted = votedIdx === idx;
              const isVoting = voteMutation.isPending;

              return (
                <Pressable
                  key={idx}
                  style={[
                    pollStyles.optionRow,
                    isVoted && pollStyles.optionRowVoted,
                  ]}
                  onPress={() => {
                    if (votedIdx !== null || isVoting) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    voteMutation.mutate(idx);
                  }}
                  disabled={votedIdx !== null || isVoting}
                  accessibilityRole="button"
                  accessibilityLabel={`${String(option)}, ${pct}%`}
                  accessibilityState={{ selected: isVoted }}
                >
                  {/* Progress bar background */}
                  <View
                    style={[
                      pollStyles.optionProgressBg,
                      {
                        width: votedIdx !== null
                          ? `${Math.min(pct, 100)}%`
                          : 0,
                      },
                    ]}
                  />
                  <Text style={pollStyles.optionText} numberOfLines={2}>
                    {String(option)}
                  </Text>
                  {votedIdx !== null && (
                    <Text style={pollStyles.optionPct}>{pct}%</Text>
                  )}
                  {isVoted && (
                    <Icon name="checkmark-circle" size={18} color={group.primary} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Vote success message */}
          {votedIdx !== null && (
            <Text style={pollStyles.successMsg}>
              {t(lang, "pollPopup.voteSuccess")}
            </Text>
          )}

          {/* Skip button (only before voting) */}
          {votedIdx === null && (
            <Pressable
              style={pollStyles.skipBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onDismiss();
              }}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "pollPopup.skip")}
            >
              <Text style={pollStyles.skipBtnText}>
                {t(lang, "pollPopup.skip")}
              </Text>
            </Pressable>
          )}

          {/* Loading indicator */}
          {voteMutation.isPending && (
            <ActivityIndicator
              color={group.primary}
              size="small"
              style={{ marginTop: spacing.sm }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// =============================================================================
// Main Screen
// =============================================================================

function OverviewScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const guest = useAppStore((s) => s.guest);
  const portalRole = useAppStore((s) => s.portalRole);
  const isParticipant = portalRole === "participant";

  // Register push notifications on first load
  usePushNotifications();

  const [ctaDismissed, setCtaDismissed] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const announcementsRef = useRef<View>(null);
  const announcementsY = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleLogout = useCallback(async () => {
    const doLogout = async () => {
      await logout();
      useAppStore.getState().reset();
      router.replace("/");
    };
    if (Platform.OS === "web") {
      if (window.confirm(t(lang, "group.logoutConfirm"))) {
        await doLogout();
      }
    } else {
      Alert.alert(t(lang, "group.logout"), t(lang, "group.logoutConfirm"), [
        { text: t(lang, "common.cancel"), style: "cancel" },
        { text: t(lang, "group.logout"), style: "destructive", onPress: doLogout },
      ]);
    }
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
    gallery,
    services,
    attractions,
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

  const handleQuickAction = useCallback((tab: string, params?: Record<string, string>) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (params && Object.keys(params).length > 0) {
      router.navigate({
        pathname: `/(group)/${tab}` as any,
        params,
      });
      return;
    }
    router.navigate(`/(group)/${tab}` as any);
  }, []);

  // -- Cover image source --
  const hasCover = !!hotel?.coverImageUrl && !coverError;

  // -- Show CTA? --
  const showCta =
    !isParticipant &&
    !ctaDismissed &&
    totalGuestCount === 0 &&
    diffDays !== null &&
    diffDays > 0;

  // -- TASK 1: Poll Popup (auto-show first active unvoted poll) --
  const [pollPopupVisible, setPollPopupVisible] = useState(false);
  const [activePollForPopup, setActivePollForPopup] = useState<PollData | null>(null);
  const pollPopupChecked = useRef(false);

  const { data: pollsData } = useQuery({
    queryKey: ["polls", trackingId],
    queryFn: async () => {
      if (!trackingId) return [];
      const res = await fetchPolls(trackingId);
      return res.status === "success" && res.data ? res.data : [];
    },
    enabled: !!trackingId && !!portal?.pollsEnabled,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (pollPopupChecked.current) return;
    if (!pollsData || pollsData.length === 0) return;

    const activePolls = pollsData.filter((p) => p.isActive);
    if (activePolls.length === 0) return;

    // Check SecureStore for dismissed/voted polls
    pollPopupChecked.current = true;

    (async () => {
      for (const poll of activePolls) {
        const dismissKey = `poll_dismissed_${poll.id}`;
        const wasDismissed = await getSecureItem(dismissKey).catch(() => null);
        if (!wasDismissed) {
          setActivePollForPopup(poll);
          setPollPopupVisible(true);
          return;
        }
      }
    })();
  }, [pollsData]);

  const handlePollPopupDismiss = useCallback(() => {
    if (activePollForPopup) {
      const dismissKey = `poll_dismissed_${activePollForPopup.id}`;
      setSecureItem(dismissKey, "1");
    }
    setPollPopupVisible(false);
  }, [activePollForPopup]);

  // -- Reminder banner (organizer only, event upcoming) --
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const confirmedCount = useMemo(() => {
    if (!initData) return 0;
    return initData.totalGuestCount;
  }, [initData]);
  const showReminder = !isParticipant && !reminderDismissed && diffDays !== null && diffDays > 0 && diffDays <= 30;

  // -- Welcome popup (pinned announcement, once per portal) --
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const welcomeChecked = useRef(false);
  const pinnedAnnouncement = useMemo(() => {
    const anns = initData?.announcements;
    if (!anns?.length) return null;
    return anns.find((a) => a.isPinned) ?? null;
  }, [initData]);

  useEffect(() => {
    if (welcomeChecked.current || !pinnedAnnouncement || !trackingId) return;
    welcomeChecked.current = true;
    const key = `welcome_seen_${trackingId}`;
    getSecureItem(key).then((val) => {
      if (!val) setWelcomeVisible(true);
    });
  }, [pinnedAnnouncement, trackingId]);

  const handleWelcomeDismiss = useCallback(() => {
    setWelcomeVisible(false);
    if (trackingId) {
      setSecureItem(`welcome_seen_${trackingId}`, "1");
    }
  }, [trackingId]);

  // -- Rating modal (participant, post-event) -- P2-4: 4 categories
  const [ratingVisible, setRatingVisible] = useState(false);
  const [ratingOverall, setRatingOverall] = useState(0);
  const [ratingOrganization, setRatingOrganization] = useState(0);
  const [ratingFood, setRatingFood] = useState(0);
  const [ratingRooms, setRatingRooms] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const ratingChecked = useRef(false);

  useEffect(() => {
    if (ratingChecked.current || !isParticipant || diffDays === null || diffDays >= -1 || !trackingId) return;
    ratingChecked.current = true;
    const key = `rated_${trackingId}`;
    getSecureItem(key).then((val) => {
      if (!val) setRatingVisible(true);
    });
  }, [isParticipant, diffDays, trackingId]);

  const canSubmitRating = ratingOverall > 0;

  const handleRatingSubmit = useCallback(async () => {
    if (!canSubmitRating || ratingSubmitting || !trackingId) return;
    setRatingSubmitting(true);
    try {
      await groupFetch(trackingId, "/rating", {
        method: "POST",
        body: JSON.stringify({
          rating: ratingOverall,
          organization: ratingOrganization || undefined,
          food: ratingFood || undefined,
          rooms: ratingRooms || undefined,
          comment: ratingComment.trim() || undefined,
        }),
      });
      await setSecureItem(`rated_${trackingId}`, "1");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t(lang, "common.error"), t(lang, "overview.rating.error"));
      setRatingSubmitting(false);
      return;
    }
    setRatingVisible(false);
    setRatingSubmitting(false);
  }, [canSubmitRating, ratingOverall, ratingOrganization, ratingFood, ratingRooms, ratingComment, ratingSubmitting, trackingId]);

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
                onPress={() => {
                  const newLang = lang === "pl" ? "en" : "pl";
                  setLang(newLang);
                  setPersistedLang(newLang);
                }}
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
        {/* LIVE EVENT BANNER                                                 */}
        {/* ================================================================= */}
        {!isLoading && !isError && diffDays !== null && (diffDays === 0 || diffDays === -1) && (
          <LiveEventBanner lang={lang} />
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
                <View
                  style={styles.heroCountdownBadge}
                  accessibilityLabel={countdownLabel(diffDays, lang)}
                  accessibilityRole="text"
                >
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
        {/* B2. WELCOME BACK CARD (identified guest, confirmed RSVP)          */}
        {/* ================================================================= */}
        {guest && guest.rsvpStatus === "confirmed" && (
          <View style={styles.welcomeBackCard}>
            <Icon name="hand-right-outline" size={22} color={group.primary} />
            <View style={styles.welcomeBackText}>
              <Text style={styles.welcomeBackName}>{guest.firstName}{guest.lastName ? ` ${guest.lastName}` : ""}</Text>
              <Text style={styles.welcomeBackStatus}>{t(lang, "rsvp.alreadyConfirmed")}</Text>
            </View>
          </View>
        )}

        {/* ================================================================= */}
        {/* C. TIMELINE STEPPER                                               */}
        {/* ================================================================= */}
        {!isLoading && portal?.timelineEnabled !== false && portal?.timelineCheckpoints && portal.timelineCheckpoints.length > 0 && (
          <TimelineStepper checkpoints={portal.timelineCheckpoints} lang={lang} />
        )}

        {/* ================================================================= */}
        {/* C2. ORGANIZER NOTES                                               */}
        {/* ================================================================= */}
        {!isLoading && portal?.notes ? (
          <View style={styles.notesCard}>
            <View style={styles.notesHeader}>
              <Icon name="document-text-outline" size={20} color={group.primary} />
              <Text style={styles.notesTitle}>{t(lang, "notes.title")}</Text>
            </View>
            <Text style={styles.notesBody}>{portal.notes}</Text>
          </View>
        ) : null}

        {/* ================================================================= */}
        {/* C3. REMINDER BANNER (organizer, event upcoming)                   */}
        {/* ================================================================= */}
        {showReminder && (
          <View style={styles.reminderBanner}>
            <View style={styles.reminderContent}>
              <Icon name="time-outline" size={18} color="#92400e" />
              <Text style={styles.reminderText}>
                {t(lang, "overview.reminder.prefix")} {diffDays} {t(lang, diffDays === 1 ? "overview.reminder.day" : "overview.reminder.days")} | {confirmedCount} {t(lang, "overview.guestsLabel")}
              </Text>
            </View>
            <Pressable
              onPress={() => setReminderDismissed(true)}
              style={styles.reminderClose}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.close")}
            >
              <Icon name="close" size={14} color="#92400e" />
            </Pressable>
          </View>
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
        {/* D2. RSVP + SELF-REGISTER ACTION CARDS                            */}
        {/* ================================================================= */}
        {!isLoading && !isError && initData && (
          <View style={styles.actionCardsRow}>
            <Pressable
              style={styles.actionCard}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.navigate("/(group)/rsvp" as any);
              }}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "rsvp.title")}
            >
              <View style={[styles.actionCardIcon, { backgroundColor: "rgba(16,185,129,0.1)" }]}>
                <Icon name="checkmark-circle-outline" size={24} color={semantic.success} />
              </View>
              <Text style={styles.actionCardText}>{t(lang, "rsvp.title")}</Text>
            </Pressable>
            {portal?.selfRegistrationEnabled && (
              <Pressable
                style={styles.actionCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.navigate("/(group)/register" as any);
                }}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "register.title")}
              >
                <View style={[styles.actionCardIcon, { backgroundColor: group.primaryLight }]}>
                  <Icon name="person-add-outline" size={24} color={group.primary} />
                </View>
                <Text style={styles.actionCardText}>{t(lang, "register.title")}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ================================================================= */}
        {/* D3. UPSELL BANNER                                                 */}
        {/* ================================================================= */}
        {!isLoading && portal?.upsellEnabled && portal?.servicesEnabled && services && services.length > 0 && (
          <View style={styles.upsellSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t(lang, "upsell.title")}</Text>
              {services.length > 2 && (
                <Pressable
                  style={styles.seeAllBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.navigate("/(group)/services" as any);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t(lang, "upsell.seeAll")}
                >
                  <Text style={styles.seeAllText}>{t(lang, "upsell.seeAll")}</Text>
                  <Icon name="chevron-forward" size={16} color={group.primary} />
                </Pressable>
              )}
            </View>
            {services.slice(0, 2).map((svc) => (
              <View key={svc.id} style={styles.upsellCard}>
                <View style={styles.upsellCardBody}>
                  <Text style={styles.upsellCardName} numberOfLines={1}>{svc.name}</Text>
                  {svc.description ? (
                    <Text style={styles.upsellCardDesc} numberOfLines={2}>{svc.description}</Text>
                  ) : null}
                  {svc.price != null ? (
                    <Text style={styles.upsellCardPrice}>
                      {svc.price} {svc.currency ?? "PLN"}{svc.unit ? ` / ${svc.unit}` : ""}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  style={styles.upsellAskBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const prefill = t(lang, "upsell.askAbout").replace("{name}", svc.name);
                    router.navigate({
                      pathname: "/(group)/messages" as any,
                      params: { prefill },
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t(lang, "upsell.askAbout").replace("{name}", svc.name)}
                >
                  <Icon name="chatbubble-outline" size={16} color={group.white} />
                  <Text style={styles.upsellAskText}>{t(lang, "upsell.ask")}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* ================================================================= */}
        {/* E. QUICK ACTIONS (colored grid)                                   */}
        {/* ================================================================= */}
        {!isLoading && !isError && initData && (
          <Animated.View style={quickActionsSlide}>
            <View style={styles.quickActionsGrid}>
              {QUICK_ACTIONS.filter((action) => {
                if (action.organizerOnly && isParticipant) return false;
                if (action.flag && portal && !(portal as Record<string, unknown>)[action.flag]) return false;
                return true;
              }).map((action) => (
                <QuickActionCircle
                  key={action.labelKey}
                  label={t(lang, action.labelKey)}
                  iconName={action.icon}
                  bg={action.bg}
                  color={action.color}
                  onPress={() => handleQuickAction(action.tab, action.params)}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* ================================================================= */}
        {/* F. ANNOUNCEMENTS SECTION                                          */}
        {/* ================================================================= */}
        {!isLoading && !isError && initData && (
          <View ref={announcementsRef} onLayout={(e) => { announcementsY.current = e.nativeEvent.layout.y; }} style={styles.section} accessibilityLiveRegion="polite">
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {t(lang, "group.announcements")}
              </Text>
              {announcements && announcements.length > 3 && (
                <Pressable
                  style={styles.seeAllBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.navigate("/(group)/announcements" as any);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t(lang, "common.seeAll")}
                >
                  <Text style={styles.seeAllText}>{t(lang, "common.seeAll")}</Text>
                  <Icon name="chevron-forward" size={16} color={group.primary} />
                </Pressable>
              )}
            </View>

            {!announcements?.length ? (
              <View style={styles.emptyCard}>
                <Icon name="megaphone-outline" size={36} color={group.textMuted} />
                <Text style={styles.emptyText}>
                  {t(lang, "group.noAnnouncements")}
                </Text>
              </View>
            ) : (
              <View style={styles.announcementsList}>
                {announcements.slice(0, 3).map((a, idx) => (
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

        {/* Sections G-K moved to dedicated screens (agenda, faq, gallery, services, attractions) */}
        {/* Access via quick action grid above */}

        {/* ================================================================= */}
        {/* L. HOTEL CONTACT FOOTER                                           */}
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
                onPress={() => safeOpenURL(`tel:${sanitizePhone(hotel.phone!)}`)}
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
                onPress={() => safeOpenURL(`mailto:${sanitizeEmail(hotel.email!)}`)}
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
                    onPress={() => safeOpenURL(`mailto:${sanitizeEmail(salesperson.email!)}`)}
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
                    onPress={() => safeOpenURL(`tel:${sanitizePhone(salesperson.phone!)}`)}
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

            {/* Open in Maps */}
            {portal?.mapEnabled !== false && hotel?.address && (
              <Pressable
                style={styles.openMapsBtn}
                onPress={() => safeOpenURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotel.address!)}`)}
                accessibilityRole="button"
                accessibilityLabel={t(lang, "overview.openMaps")}
              >
                <Icon name="map-outline" size={20} color={group.primary} />
                <Text style={styles.openMapsBtnText}>{t(lang, "overview.openMaps")}</Text>
              </Pressable>
            )}

            {/* Social links */}
            {socialLinks && socialLinks.length > 0 && (
              <View style={styles.socialRow}>
                {socialLinks.filter((link) => isExternalUrlSafe(link.url)).map((link, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => safeOpenURL(link.url)}
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

      {/* TASK 1: Poll Popup Modal */}
      {activePollForPopup && (
        <PollPopupModal
          poll={activePollForPopup}
          lang={lang}
          visible={pollPopupVisible}
          onDismiss={handlePollPopupDismiss}
        />
      )}

      {/* Welcome Popup (pinned announcement, once per portal) */}
      {pinnedAnnouncement && (
        <Modal visible={welcomeVisible} transparent animationType="fade" onRequestClose={handleWelcomeDismiss}>
          <Pressable style={styles.modalOverlay} onPress={handleWelcomeDismiss}>
            <View style={styles.welcomeCard}>
              <Icon name="megaphone" size={28} color={group.primary} />
              <Text style={styles.welcomeTitle}>{t(lang, "group.announcements")}</Text>
              <Text style={styles.welcomeContent}>{pinnedAnnouncement.content}</Text>
              <Pressable style={styles.welcomeBtn} onPress={handleWelcomeDismiss} accessibilityRole="button">
                <Text style={styles.welcomeBtnText}>{t(lang, "overview.welcome.dismiss")}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Rating Modal (participant, post-event) -- P2-4: 4 categories */}
      <Modal visible={ratingVisible} transparent animationType="fade" onRequestClose={() => setRatingVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setRatingVisible(false)}>
          <View style={styles.ratingCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.ratingTitle}>{t(lang, "overview.rating.title")}</Text>
            <Text style={styles.ratingSubtitle}>{t(lang, "overview.rating.subtitle")}</Text>

            {/* Overall */}
            <View style={styles.ratingCategoryRow}>
              <Text style={styles.ratingCategoryLabel}>{t(lang, "overview.rating.overall")}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} onPress={() => setRatingOverall(star)} style={styles.starBtn}>
                    <Icon
                      name={star <= ratingOverall ? "star" : "star-outline"}
                      size={28}
                      color={star <= ratingOverall ? "#f59e0b" : group.textMuted}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Organization */}
            <View style={styles.ratingCategoryRow}>
              <Text style={styles.ratingCategoryLabel}>{t(lang, "overview.rating.organization")}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} onPress={() => setRatingOrganization(star)} style={styles.starBtn}>
                    <Icon
                      name={star <= ratingOrganization ? "star" : "star-outline"}
                      size={28}
                      color={star <= ratingOrganization ? "#f59e0b" : group.textMuted}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Food */}
            <View style={styles.ratingCategoryRow}>
              <Text style={styles.ratingCategoryLabel}>{t(lang, "overview.rating.food")}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} onPress={() => setRatingFood(star)} style={styles.starBtn}>
                    <Icon
                      name={star <= ratingFood ? "star" : "star-outline"}
                      size={28}
                      color={star <= ratingFood ? "#f59e0b" : group.textMuted}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Rooms */}
            <View style={styles.ratingCategoryRow}>
              <Text style={styles.ratingCategoryLabel}>{t(lang, "overview.rating.rooms")}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} onPress={() => setRatingRooms(star)} style={styles.starBtn}>
                    <Icon
                      name={star <= ratingRooms ? "star" : "star-outline"}
                      size={28}
                      color={star <= ratingRooms ? "#f59e0b" : group.textMuted}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            <TextInput
              style={styles.ratingInput}
              placeholder={t(lang, "overview.rating.commentPlaceholder")}
              placeholderTextColor={group.textMuted}
              value={ratingComment}
              onChangeText={setRatingComment}
              multiline
              maxLength={500}
            />
            <Pressable
              style={[styles.ratingSubmit, !canSubmitRating && styles.ratingSubmitDisabled]}
              onPress={handleRatingSubmit}
              disabled={!canSubmitRating || ratingSubmitting}
              accessibilityRole="button"
            >
              <Text style={styles.ratingSubmitText}>
                {ratingSubmitting ? t(lang, "common.loading") : t(lang, "overview.rating.submit")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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

  // ── Live Event Banner ──
  liveBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: semantic.success,
    marginHorizontal: spacing["2xl"],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    gap: spacing.sm,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: group.white,
  },
  liveBannerText: {
    color: group.white,
    fontSize: fontSize.sm,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
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
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center",
    marginTop: spacing.xxs,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: group.white,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
  ctaDismiss: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.xs,
  },

  // ── Notes Card ──
  notesCard: {
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing.lg,
    marginHorizontal: spacing["2xl"],
    gap: spacing.md,
    ...shadow.sm,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  notesTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  notesBody: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    lineHeight: 20,
  },

  // ── Upsell Section ──
  upsellSection: {
    gap: spacing.md,
    paddingHorizontal: spacing["2xl"],
  },
  upsellCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: group.cardBorder,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  upsellCardBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  upsellCardName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  upsellCardDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    lineHeight: 18,
  },
  upsellCardPrice: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_700Bold",
    color: group.primary,
    marginTop: spacing.xxs,
  },
  upsellAskBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: group.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  upsellAskText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },

  // ── Welcome Back Card ──
  welcomeBackCard: {
    flexDirection: "row",
    backgroundColor: group.primaryLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    alignItems: "center",
  },
  welcomeBackText: {
    flex: 1,
  },
  welcomeBackName: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  welcomeBackStatus: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
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

  // ── Open in Maps ──
  openMapsBtn: {
    flexDirection: "row" as const,
    backgroundColor: group.primaryLight,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    minHeight: 44,
    alignItems: "center" as const,
  },
  openMapsBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
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
    minHeight: 44,
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

  // Action cards (RSVP + Register)
  actionCardsRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  actionCard: {
    flex: 1,
    backgroundColor: group.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 88,
    justifyContent: "center",
    ...shadow.sm,
  },
  actionCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  actionCardText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    textAlign: "center",
  },

  // ── Reminder Banner ──
  reminderBanner: {
    flexDirection: "row" as const,
    backgroundColor: "#fef3c7",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    alignItems: "center" as const,
  },
  reminderContent: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.sm,
  },
  reminderText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: "#92400e",
    flex: 1,
  },
  reminderClose: {
    padding: spacing.xs,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },

  // ── Modal Overlay (shared) ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: spacing.xl,
  },

  // ── Welcome Popup ──
  welcomeCard: {
    backgroundColor: group.white,
    borderRadius: radius.xl,
    padding: spacing["3xl"],
    width: "100%" as const,
    maxWidth: 340,
    alignItems: "center" as const,
    gap: spacing.md,
    ...shadow.lg,
  },
  welcomeTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  welcomeContent: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.textSecondary,
    textAlign: "center" as const,
    lineHeight: 22,
  },
  welcomeBtn: {
    backgroundColor: group.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing["2xl"],
    marginTop: spacing.sm,
  },
  welcomeBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },

  // ── Rating Modal ──
  ratingCard: {
    backgroundColor: group.white,
    borderRadius: radius.xl,
    padding: spacing["3xl"],
    width: "100%" as const,
    maxWidth: 340,
    alignItems: "center" as const,
    gap: spacing.md,
    ...shadow.lg,
  },
  ratingTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
  },
  ratingSubtitle: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
    textAlign: "center" as const,
  },
  ratingCategoryRow: {
    width: "100%" as const,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingVertical: spacing.xs,
  },
  ratingCategoryLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: group.textSecondary,
    minWidth: 90,
  },
  starsRow: {
    flexDirection: "row" as const,
    gap: spacing.xxs,
  },
  starBtn: {
    minWidth: 36,
    minHeight: 36,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  ratingInput: {
    width: "100%" as const,
    borderWidth: 1,
    borderColor: group.cardBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: group.text,
    backgroundColor: group.inputBg,
    minHeight: 80,
    textAlignVertical: "top" as const,
  },
  ratingSubmit: {
    backgroundColor: group.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing["2xl"],
    width: "100%" as const,
    alignItems: "center" as const,
  },
  ratingSubmitDisabled: {
    opacity: 0.5,
  },
  ratingSubmitText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: group.white,
  },
});

// =============================================================================
// Poll Popup Styles
// =============================================================================

const pollStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    backgroundColor: group.white,
    borderRadius: radius["2xl"],
    padding: spacing["2xl"],
    width: "100%",
    maxWidth: 400,
    ...shadow.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  headerLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.primary,
    letterSpacing: letterSpacing.tight,
    textTransform: "uppercase",
  },
  question: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: group.text,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  optionsList: {
    gap: spacing.sm,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: group.inputBg,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: TOUCH_TARGET,
    overflow: "hidden",
    position: "relative",
  },
  optionRowVoted: {
    backgroundColor: group.primaryLight,
    borderWidth: 1,
    borderColor: group.primary,
  },
  optionProgressBg: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(99,102,241,0.08)",
    borderRadius: radius.md,
  },
  optionText: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.text,
  },
  optionPct: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: group.textSecondary,
    marginLeft: spacing.sm,
  },
  successMsg: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: semantic.success,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  skipBtn: {
    marginTop: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: group.inputBg,
  },
  skipBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: group.textMuted,
  },
});

// ── Default export wrapped in ErrorBoundary ──────────────────────────────────

export default function OverviewScreen() {
  return (
    <ErrorBoundary>
      <OverviewScreenInner />
    </ErrorBoundary>
  );
}
