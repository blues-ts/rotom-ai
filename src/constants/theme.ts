// River Design System — "Glass on Deep Water"
// Single source of truth for styling tokens. React Native / Expo.
// Usage: const t = useRiverTheme(); // resolves dark/light via useColorScheme()
// and the active brand colorway via ColorwayContext (Pro appearance setting).
//
// The context has a safe default (River), so useRiverTheme keeps working with
// no provider mounted — the root ErrorBoundary depends on that.

import { createContext, useContext } from "react";
import { useColorScheme } from "react-native";
import {
	type Colorway,
	type ColorwayName,
	colorways,
	DEFAULT_COLORWAY,
} from "./colorways";

// ─── Color helpers ─────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** `#RRGGBB` → `rgba(...)`. For colorway-aware tints of theme colors. */
export function withAlpha(hex: string, a: number): string {
	const [r, g, b] = hexToRgb(hex);
	return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Mix `from` toward `to` by t (0..1), returning hex. Colorway-aware shades. */
export function mixColor(from: string, to: string, t: number): string {
	const a = hexToRgb(from);
	const b = hexToRgb(to);
	const ch = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
	return `#${[ch(0), ch(1), ch(2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ─── Primitives (River-default statics, kept for existing imports) ──

// (The dark-mode "ice" glass hue now lives per-colorway in colorways.ts.)
const navy = (a: number) => `rgba(11, 39, 64, ${a})`; // text/border hue (light mode)
const white = (a: number) => `rgba(255, 255, 255, ${a})`;

export const palette = {
	accent: "#3B9DF2", // selection, primary CTA (both modes)
	accentSoft: "#7CC0FF", // icons, personalized labels (dark)
	accentDeep: "#1F7FD4", // accent as icon/text on light backgrounds
	accentSoftFill: "rgba(110, 190, 255, 0.14)", // icon chip bg (dark)
	accentDeepFill: "rgba(31, 127, 212, 0.10)", // icon chip bg (light)
	chartLine: "#5EB2F5",
	gainDark: "#4ADE80",
	gainLight: "#15A356",
	loss: "#F87171",
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
	heroNumber: { fontSize: 34, fontWeight: "800", letterSpacing: -0.5 },
	bigNumber: { fontSize: 28, fontWeight: "800", letterSpacing: -0.4 },
	cardTitle: { fontSize: 18, fontWeight: "700" },
	screenTitle: { fontSize: 17, fontWeight: "600" },
	body: { fontSize: 16, fontWeight: "600" },
	caption: { fontSize: 13, fontWeight: "500" },
	// Overline: ALWAYS uppercase; used for every section header.
	overline: { fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
	badge: { fontSize: 9, fontWeight: "700" },
} as const;

export const chart = {
	strokeWidth: 2.5,
	line: palette.chartLine,
	fillTop: "rgba(94, 178, 245, 0.28)", // gradient fill fades to 0 at bottom
	endDotRadius: 4.5,
} as const;

// ─── Theme shape ───────────────────────────────────────────────

type GradientStops3 = {
	colors: [string, string, string];
	locations: [number, number, number];
};

type Shadow = {
	shadowColor: string;
	shadowOpacity: number;
	shadowRadius: number;
	shadowOffset: { width: number; height: number };
};

export interface RiverTheme {
	isDark: boolean;
	colorway: ColorwayName;
	// expo-linear-gradient: colors + locations, top → bottom
	background: GradientStops3;
	scannerBackground: { colors: [string, string]; locations: [number, number] };
	// Glass — content surfaces only. Toolbars/nav = native Liquid Glass, accent-tinted.
	glass: {
		surfaceFill: string; // cards, tiles, sheets
		surfaceBorder: string; // 1px
		elevatedFill: string; // inputs, chips
		elevatedBorder: string;
		sheetFill: string; // bottom sheets (near-opaque)
		pressedFill: string; // press state = one step brighter
		shadow: Shadow | null; // no shadows on glass in dark mode (except sheets/buttons)
	};
	text: {
		primary: string;
		body: string;
		secondary: string;
		tertiary: string;
	};
	accent: string;
	accentOn: string; // accent used as icon/label color
	accentIconFill: string;
	chartLine: string;
	chartFillTop: string;
	gain: string;
	loss: string;
	buttonGlow: Shadow;
}

// ─── Theme builders (one pair per colorway) ────────────────────

const SCANNER_BACKGROUND = {
	colors: ["#23262B", "#17191D"] as [string, string],
	locations: [0, 1] as [number, number],
};

function buildDarkTheme(cw: Colorway): RiverTheme {
	const isRiver = cw.name === "river";
	const iceA = (a: number) => withAlpha(cw.ice, a);
	return {
		isDark: true,
		colorway: cw.name,
		background: {
			colors: [cw.bg0, cw.bg1, cw.bg2],
			locations: [0, 0.4, 1],
		},
		scannerBackground: SCANNER_BACKGROUND,
		glass: {
			surfaceFill: iceA(0.07),
			surfaceBorder: iceA(0.12),
			elevatedFill: iceA(0.08),
			elevatedBorder: iceA(0.14),
			// River keeps its shipped hand-tuned sheet color; others derive the
			// same "bg1, one step brighter, near-opaque" recipe.
			sheetFill: isRiver
				? "rgba(19, 45, 72, 0.96)"
				: withAlpha(mixColor(cw.bg1, "#FFFFFF", 0.02), 0.96),
			pressedFill: iceA(0.1),
			shadow: null,
		},
		text: {
			primary: "#FFFFFF",
			body: isRiver ? "#EFF6FC" : mixColor(cw.ice, "#FFFFFF", 0.36),
			secondary: iceA(0.55),
			tertiary: iceA(0.35),
		},
		accent: cw.accent,
		accentOn: cw.accentSoft,
		accentIconFill: isRiver ? palette.accentSoftFill : withAlpha(cw.accentSoft, 0.14),
		chartLine: cw.chartLine,
		chartFillTop: withAlpha(cw.chartLine, 0.28),
		gain: palette.gainDark,
		loss: palette.loss,
		buttonGlow: {
			shadowColor: cw.accent,
			shadowOpacity: 0.4,
			shadowRadius: 12,
			shadowOffset: { width: 0, height: 4 },
		},
	};
}

function buildLightTheme(cw: Colorway): RiverTheme {
	const isRiver = cw.name === "river";
	return {
		isDark: false,
		colorway: cw.name,
		// "Shallow water" — a whisper of the colorway's soft accent, never gray.
		background: {
			colors: isRiver
				? ["#EAF3FB", "#DDEAF6", "#D2E2F0"]
				: [
						mixColor("#FFFFFF", cw.accentSoft, 0.16),
						mixColor("#FFFFFF", cw.accentSoft, 0.24),
						mixColor("#FFFFFF", cw.accentSoft, 0.32),
					],
			locations: [0, 0.4, 1],
		},
		scannerBackground: SCANNER_BACKGROUND, // scanner stays dark
		glass: {
			surfaceFill: white(0.55),
			surfaceBorder: navy(0.08),
			elevatedFill: white(0.65),
			elevatedBorder: navy(0.1),
			sheetFill: white(0.92),
			pressedFill: white(0.75),
			// light glass gets a soft shadow instead of relying on borders alone
			shadow: {
				shadowColor: "#1E466E",
				shadowOpacity: 0.07,
				shadowRadius: 10,
				shadowOffset: { width: 0, height: 2 },
			},
		},
		text: {
			primary: "#0B2740",
			body: "#123249",
			secondary: navy(0.55),
			tertiary: navy(0.35),
		},
		accent: cw.accent, // fills unchanged
		accentOn: cw.accentDeep, // darken when used as icon/text
		accentIconFill: isRiver ? palette.accentDeepFill : withAlpha(cw.accentDeep, 0.1),
		chartLine: cw.chartLine,
		chartFillTop: withAlpha(cw.chartLine, 0.28),
		gain: palette.gainLight,
		loss: "#DC2626",
		buttonGlow: {
			shadowColor: cw.accent,
			shadowOpacity: 0.35,
			shadowRadius: 12,
			shadowOffset: { width: 0, height: 4 },
		},
	};
}

const themes = Object.fromEntries(
	Object.values(colorways).map((cw) => [
		cw.name,
		{ dark: buildDarkTheme(cw), light: buildLightTheme(cw) },
	]),
) as Record<ColorwayName, { dark: RiverTheme; light: RiverTheme }>;

// River defaults, kept for surfaces that are intentionally colorway-agnostic
// (scanner chrome, force-dark headers, pre-provider screens).
export const darkTheme = themes.river.dark;
export const lightTheme = themes.river.light;

// ─── Colorway selection ────────────────────────────────────────

export interface ColorwayContextValue {
	colorway: ColorwayName;
	setColorway: (name: ColorwayName) => void;
}

// Default value keeps useRiverTheme functional with no provider mounted.
export const ColorwayContext = createContext<ColorwayContextValue>({
	colorway: DEFAULT_COLORWAY,
	setColorway: () => {},
});

export function useColorway(): ColorwayContextValue {
	return useContext(ColorwayContext);
}

export function useRiverTheme(): RiverTheme {
	const { colorway } = useContext(ColorwayContext);
	const scheme = useColorScheme();
	const pair = themes[colorway] ?? themes.river;
	return scheme === "light" ? pair.light : pair.dark;
}

/** The active colorway's dark theme regardless of system scheme — for
 * always-dark surfaces (scanner/camera chrome). */
export function useRiverDarkTheme(): RiverTheme {
	const { colorway } = useContext(ColorwayContext);
	return (themes[colorway] ?? themes.river).dark;
}
