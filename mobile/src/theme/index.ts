/**
 * VIMARSH design tokens — defined ONCE here and reused everywhere.
 * Official Indian government-portal aesthetic: calm, trustworthy, not a startup look.
 * Accent (saffron) is used sparingly (CTAs, active tab, highlights) — never as a background.
 */

export const colors = {
  // Brand
  primary: '#1B2F5B', // deep navy (AICTE blue)
  primaryDark: '#14244A',
  primaryLight: '#2A4A8B',
  accent: '#E8871E', // saffron — CTAs / active indicators / highlights ONLY
  accentDark: '#C97312',

  // Status
  success: '#1E7B3A', // India green — status only (approved/connected/verified)
  danger: '#C0392B', // restrained red — leave/end/remove + errors only
  warning: '#B8860B',

  // Surfaces (light theme — the app default)
  background: '#F4F6FA', // very light grey-blue
  surface: '#FFFFFF', // white cards
  surfaceAlt: '#EEF1F7',
  border: '#DCE2EC', // 1px subtle borders
  overlay: 'rgba(16,24,40,0.45)',

  // Text
  text: '#1B2430', // near-black navy
  textMuted: '#5B6577',
  textSubtle: '#8A93A3',
  textInverse: '#FFFFFF',

  // Meeting room (dark)
  roomBg: '#10151F', // dark navy-charcoal
  roomSurface: '#1A2230',
  roomBorder: '#2A3444',
  roomText: '#E6EAF2',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12, // one consistent corner radius across the app
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  // Font families loaded in App.tsx (Noto Sans UI + Noto Sans Devanagari wordmark).
  fontFamily: {
    regular: 'NotoSans_400Regular',
    medium: 'NotoSans_500Medium',
    semibold: 'NotoSans_600SemiBold',
    bold: 'NotoSans_700Bold',
    devanagari: 'NotoSansDevanagari_700Bold',
  },
  size: {
    xs: 12,
    sm: 14,
    body: 16, // minimum body text = 16px
    md: 18,
    lg: 22,
    xl: 28,
    xxl: 34,
  },
} as const;

export const elevation = {
  // minimal shadows
  card: {
    shadowColor: '#1B2F5B',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;

// Role badge colors (consistent across the app).
export const roleBadge: Record<string, { bg: string; fg: string; label: string }> = {
  SUPER_ADMIN: { bg: '#1B2F5B', fg: '#FFFFFF', label: 'AICTE Admin' },
  MINISTRY: { bg: '#4B3B8F', fg: '#FFFFFF', label: 'Ministry' },
  INSTITUTE_ADMIN: { bg: '#0F6E8C', fg: '#FFFFFF', label: 'Institute Admin' },
  HOD: { bg: '#1E7B3A', fg: '#FFFFFF', label: 'HOD' },
  FACULTY: { bg: '#2A4A8B', fg: '#FFFFFF', label: 'Faculty' },
  GUEST: { bg: '#5B6577', fg: '#FFFFFF', label: 'Guest' },
};

// Confidentiality labels (consistent styling).
export const confidentiality: Record<string, { bg: string; fg: string; label: string }> = {
  PUBLIC: { bg: '#E7F3EA', fg: '#1E7B3A', label: 'Public' },
  INTERNAL: { bg: '#E9EEF7', fg: '#1B2F5B', label: 'Internal' },
  CONFIDENTIAL: { bg: '#FCEFE0', fg: '#B8860B', label: 'Confidential' },
  RESTRICTED: { bg: '#FBE8E6', fg: '#C0392B', label: 'Restricted' },
};

export const theme = { colors, spacing, radius, typography, elevation, roleBadge, confidentiality };
export type Theme = typeof theme;
