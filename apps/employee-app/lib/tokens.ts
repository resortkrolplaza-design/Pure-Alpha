// =============================================================================
// Employee App -- Design Tokens (Warm Cream theme -- Group Portal style)
// Primary: blue-800 (#1e40af) for employee identity
// =============================================================================

import { Platform } from "react-native";

// -- Employee App: Warm Cream + Blue-800 ------------------------------------

export const emp = {
  bg: "#f8f6f3",
  bgLight: "#F5F3EF",
  primary: "#1e40af",
  primaryDark: "#1e3a8a",
  white: "#FFFFFF",
  tabBarBg: "rgba(255,255,255,0.95)",
  text: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#556578",
  card: "rgba(255,255,255,0.9)",
  cardBorder: "rgba(0,0,0,0.06)",
  surface: "rgba(255,255,255,0.7)",
  inputBg: "rgba(0,0,0,0.04)",
  inputBorder: "rgba(0,0,0,0.08)",
  disabledBg: "rgba(0,0,0,0.08)",
  primaryLight: "rgba(30,64,175,0.1)",
  photoFallback: "rgba(0,0,0,0.06)",
  overlayWhite70: "rgba(255,255,255,0.7)",
  overlayWhite60: "rgba(255,255,255,0.6)",
  overlay: "rgba(0,0,0,0.5)",
  success: "#059669",
  successLight: "rgba(5,150,105,0.1)",
  danger: "#dc2626",
  dangerLight: "rgba(220,38,38,0.1)",
  warning: "#f59e0b",
  info: "#3b82f6",
  accent: "#1e40af",
  // Hero / gradient overlay helpers
  heroLabel: "#ffffff",
  heroDept: "rgba(255,255,255,0.85)",
  heroBadgeBg: "rgba(0,0,0,0.2)",
  shadowDark: "#0f172a",
  shadowBlack: "#000000",
  // Wave / decorative backgrounds (primary @ low alpha)
  waveFaint: "rgba(30,64,175,0.03)",
  waveLight: "rgba(30,64,175,0.04)",
  waveMedium: "rgba(30,64,175,0.06)",
} as const;

// -- Destructive Action Colors ------------------------------------------------

export const destructive = {
  bg: "rgba(239,68,68,0.08)",
  border: "rgba(239,68,68,0.2)",
  text: "#ef4444",
} as const;

// -- Shift Type Colors (SSOT -- used by dashboard + schedule) -----------------

export const shiftColors: Record<string, string> = {
  MORNING: "#f59e0b",
  AFTERNOON: "#3b82f6",
  NIGHT: "#6366f1",
  DAY: "#10b981",
  SPLIT: "#8b5cf6",
  CUSTOM: "#64748b",
  REST_DAY: "#d1d5db",
};

// -- Leave Status Colors ------------------------------------------------------

export const leaveStatusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" },
  approved: { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
  rejected: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
  cancelled: { bg: "rgba(100,116,139,0.1)", text: "#64748b" },
  PENDING: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" },
  APPROVED: { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
  REJECTED: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
  CANCELLED: { bg: "rgba(100,116,139,0.1)", text: "#64748b" },
  completed: { bg: "rgba(5,150,105,0.1)", text: "#059669" },
  COMPLETED: { bg: "rgba(5,150,105,0.1)", text: "#059669" },
  in_progress: { bg: "rgba(37,99,235,0.1)", text: "#2563eb" },
  IN_PROGRESS: { bg: "rgba(37,99,235,0.1)", text: "#2563eb" },
};

// -- Spacing (px values, NOT rem) ---------------------------------------------

export const spacing = {
  xxs: 2,
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

// -- Border Radius ------------------------------------------------------------

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  full: 9999,
} as const;

// -- Typography ---------------------------------------------------------------

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

export const letterSpacing = { tight: -0.3, snug: -0.5 } as const;

// -- Shadows (platform-specific) ----------------------------------------------

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
} as const;

// -- Touch Target (WCAG AA) --------------------------------------------------

export const TOUCH_TARGET = 44;

// -- PIN Length (SSOT: used in login, dashboard PIN modal, backend) -----------

export const PIN_LENGTH = 4;

// -- Animation ----------------------------------------------------------------

export const animation = {
  fast: 150,
  normal: 250,
  slow: 350,
  spring: { damping: 15, stiffness: 150, mass: 1 },
  springBounce: { damping: 12, stiffness: 200, mass: 0.8 },
} as const;
