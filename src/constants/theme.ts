// River Design System — "Glass on Deep Water"
// Single source of truth for styling tokens. React Native / Expo.
// Usage: const t = useRiverTheme(); // resolves dark/light via useColorScheme()

import { useColorScheme } from 'react-native';

// ─── Primitives ────────────────────────────────────────────────

const ice = (a: number) => `rgba(210, 235, 255, ${a})`; // the ONE glass hue (dark mode)
const navy = (a: number) => `rgba(11, 39, 64, ${a})`; // text/border hue (light mode)
const white = (a: number) => `rgba(255, 255, 255, ${a})`;

export const palette = {
  accent: '#3B9DF2', // selection, primary CTA (both modes)
  accentSoft: '#7CC0FF', // icons, personalized labels (dark)
  accentDeep: '#1F7FD4', // accent as icon/text on light backgrounds
  accentSoftFill: 'rgba(110, 190, 255, 0.14)', // icon chip bg (dark)
  accentDeepFill: 'rgba(31, 127, 212, 0.10)', // icon chip bg (light)
  chartLine: '#5EB2F5',
  gainDark: '#4ADE80',
  gainLight: '#15A356',
  loss: '#F87171',
} as const;

// ─── Mode-independent tokens ───────────────────────────────────

export const radius = {
  card: 22, // hero cards, chart cards, sheets (sheet top: 28)
  tile: 16, // grid tiles, set tiles (dense grids: 14)
  chip: 12, // selection chips, segmented segments (container: 14)
  thumb: 8, // card art thumbnails (large art: 10-12)
  pill: 999, // inputs, chips, buttons, range pills
} as const;

export const spacing = {
  screen: 20, // horizontal screen padding
  card: 16, // card inner padding (hero cards: 18)
  gap: 10, // grid gap (thumbnail rows: 8)
  hitTarget: 44, // minimum touch target
} as const;

// System font (SF Pro on iOS). weights as RN fontWeight strings.
// Named `typeScale` (not `type` as in the handoff file) because `type` as a
// named import collides with TS's inline type-import syntax.
export const typeScale = {
  heroNumber: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  bigNumber: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  screenTitle: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '600' },
  caption: { fontSize: 13, fontWeight: '500' },
  // Overline: ALWAYS uppercase; used for every section header.
  overline: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  badge: { fontSize: 9, fontWeight: '700' },
} as const;

export const chart = {
  strokeWidth: 2.5,
  line: palette.chartLine,
  fillTop: 'rgba(94, 178, 245, 0.28)', // gradient fill fades to 0 at bottom
  endDotRadius: 4.5,
} as const;

// ─── Mode themes ───────────────────────────────────────────────

export const darkTheme = {
  isDark: true,
  // expo-linear-gradient: colors + locations, top → bottom
  background: {
    colors: ['#133A5E', '#0E2A47', '#081826'],
    locations: [0, 0.4, 1],
  },
  scannerBackground: { colors: ['#23262B', '#17191D'], locations: [0, 1] },

  // Glass — content surfaces only. Toolbars/nav = native Liquid Glass, accent-tinted.
  glass: {
    surfaceFill: ice(0.07), // cards, tiles, sheets
    surfaceBorder: ice(0.12), // 1px
    elevatedFill: ice(0.08), // inputs, chips
    elevatedBorder: ice(0.14),
    sheetFill: 'rgba(19, 45, 72, 0.96)', // bottom sheets (near-opaque)
    pressedFill: ice(0.1), // press state = one step brighter
    shadow: null, // no shadows on glass in dark mode (except sheets/buttons)
  },

  text: {
    primary: '#FFFFFF',
    body: '#EFF6FC',
    secondary: ice(0.55),
    tertiary: ice(0.35),
  },

  accent: palette.accent,
  accentOn: palette.accentSoft, // accent used as icon/label color
  accentIconFill: palette.accentSoftFill,
  gain: palette.gainDark,
  loss: palette.loss,

  buttonGlow: { shadowColor: '#3B9DF2', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
} as const;

export const lightTheme = {
  isDark: false,
  // "Shallow water" — ice-blue, never gray
  background: {
    colors: ['#EAF3FB', '#DDEAF6', '#D2E2F0'],
    locations: [0, 0.4, 1],
  },
  scannerBackground: { colors: ['#23262B', '#17191D'], locations: [0, 1] }, // scanner stays dark

  glass: {
    surfaceFill: white(0.55),
    surfaceBorder: navy(0.08),
    elevatedFill: white(0.65),
    elevatedBorder: navy(0.1),
    sheetFill: white(0.92),
    pressedFill: white(0.75),
    // light glass gets a soft shadow instead of relying on borders alone
    shadow: { shadowColor: '#1E466E', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  },

  text: {
    primary: '#0B2740',
    body: '#123249',
    secondary: navy(0.55),
    tertiary: navy(0.35),
  },

  accent: palette.accent, // fills unchanged
  accentOn: palette.accentDeep, // darken when used as icon/text
  accentIconFill: palette.accentDeepFill,
  gain: palette.gainLight,
  loss: '#DC2626',

  buttonGlow: { shadowColor: '#3B9DF2', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
} as const;

export type RiverTheme = typeof darkTheme | typeof lightTheme;

export function useRiverTheme(): RiverTheme {
  return useColorScheme() === 'light' ? lightTheme : darkTheme;
}
