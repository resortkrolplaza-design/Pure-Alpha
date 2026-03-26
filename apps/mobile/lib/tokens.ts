// =============================================================================
// Pure Alpha — Design Tokens for React Native
// Norwegian Prima theme (Guest) + Admin tokens (Group/Employee)
// =============================================================================

import { Platform } from "react-native";

// ── Guest Portal: Norwegian Prima ────────────────────────────────────────────

export const NAVY = "#0D2236";
export const NAVY_LIGHT = "#1a3a5c";
export const GOLD = "#D4AF37";
export const GOLD_DARK = "#c4a030";

export const guest = {
  bg: NAVY,
  bgLight: NAVY_LIGHT,
  accent: GOLD,
  accentDark: GOLD_DARK,
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.6)",
  textMuted: "rgba(255,255,255,0.4)",
  card: "rgba(255,255,255,0.05)",
  cardBorder: "rgba(255,255,255,0.1)",
  glass: "rgba(255,255,255,0.12)",
  glassBorder: "rgba(255,255,255,0.18)",
  goldGlow: "rgba(212,175,55,0.15)",
  goldBorder: "rgba(212,175,55,0.3)",
  error: "#fca5a5",
  errorBg: "rgba(239,68,68,0.1)",
  success: "#6ee7b7",
  successBg: "rgba(16,185,129,0.1)",
  inputBg: "rgba(255,255,255,0.05)",
  inputBorder: "rgba(255,255,255,0.1)",
  textOnGold: "rgba(13,34,54,0.6)",
  tierBadgeBg: "rgba(13,34,54,0.15)",
  warningBg: "rgba(245,158,11,0.1)",
  warningBorder: "rgba(245,158,11,0.2)",
  warningText: "#fcd34d",
  inputBarBg: "rgba(13,34,54,0.8)",
  msgTimeMine: "rgba(13,34,54,0.5)",
} as const;

// ── Employee App: Warm Beige ─────────────────────────────────────────────────

export const employee = {
  bgFrom: "#FAF7F2",
  bgTo: "#F2EBD9",
  brand: "#92400e",
  text: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#526175",
  card: "rgba(255,255,255,0.9)",
  cardBorder: "rgba(0,0,0,0.06)",
  accent: "#fef3c7",
  tabBarBg: "rgba(255,255,255,0.85)",
} as const;

// ── Group Portal: Admin Indigo ───────────────────────────────────────────────

export const group = {
  bg: "#f8f6f3",
  primary: "#6366f1",
  primaryDark: "#4f46e5",
  text: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  card: "rgba(255,255,255,0.9)",
  cardBorder: "rgba(0,0,0,0.06)",
  surface: "rgba(255,255,255,0.7)",
  inputBg: "rgba(0,0,0,0.04)",
  disabledBg: "rgba(0,0,0,0.08)",
  overlayWhite70: "rgba(255,255,255,0.7)",
  overlayWhite60: "rgba(255,255,255,0.6)",
  primaryLight: "rgba(99,102,241,0.1)",
  photoFallback: "rgba(0,0,0,0.06)",
} as const;

// ── Shared Semantic Colors ───────────────────────────────────────────────────

export const semantic = {
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  successLight: "#6ee7b7",
  dangerLight: "#fca5a5",
} as const;

// ── Destructive Action Colors ───────────────────────────────────────────────

export const destructive = {
  bg: "#fef2f2",
  border: "#fecaca",
  text: "#dc2626",
} as const;

// ── Shift Type Colors (SSOT -- used by dashboard + schedule) ────────────────

export const shiftColors: Record<string, string> = {
  MORNING: "#fbbf24",
  AFTERNOON: "#60a5fa",
  NIGHT: "#818cf8",
  DAY: "#34d399",
  SPLIT: "#a78bfa",
  CUSTOM: "#a8a29e",
  REST_DAY: "#e7e5e4",
};

// ── RSVP Status Colors (SSOT -- used by group guests) ──────────────────────

export const rsvpColors: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
  declined: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
  pending: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" },
};

// ── Spacing (px values, NOT rem) ─────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  "6xl": 64,
} as const;

// ── Border Radius ────────────────────────────────────────────────────────────

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  full: 9999,
} as const;

// ── Typography ───────────────────────────────────────────────────────────────

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const;

export const fontWeight = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};

// ── Shadows (platform-specific) ──────────────────────────────────────────────

export const shadow = {
  sm: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
  }),
  md: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    android: { elevation: 4 },
  }),
  lg: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
    },
    android: { elevation: 8 },
  }),
  gold: Platform.select({
    ios: {
      shadowColor: GOLD,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
    },
    android: { elevation: 4 },
  }),
} as const;

// ── Touch Target (WCAG AA) ──────────────────────────────────────────────────

export const TOUCH_TARGET = 44;

// ── Animation ────────────────────────────────────────────────────────────────

export const animation = {
  fast: 150,
  normal: 250,
  slow: 350,
  spring: { damping: 15, stiffness: 150, mass: 1 },
  springBounce: { damping: 12, stiffness: 200, mass: 0.8 },
} as const;
