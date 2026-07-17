// River brand colorways — source: design handoff "River App Icon — Wave Orb (20d)".
// Every colorway keeps identical mark geometry; only fills change. Theme roles
// map onto the design system per the handoff's theme table: glass stays
// ice @ 7% fill / 12% border, gain/loss are shared across all themes.
//
// River's `ice` and `accentDeep` intentionally keep the app's shipped values
// (not the handoff table's) so the default colorway is pixel-identical to the
// current app.

export type ColorwayName =
	| "river"
	| "lagoon"
	| "twilight"
	| "sunset"
	| "meadow"
	| "rose"
	| "amber"
	| "ultra"
	| "glacier";

export interface Colorway {
	name: ColorwayName;
	label: string;
	// ── Mark fills (in-app logo + app icon) ──
	skyTop: string;
	skyBot: string;
	seaTop: string;
	seaBot: string;
	deep: string;
	// App-icon squircle background (vertical gradient)
	squircleTop: string;
	squircleBot: string;
	// ── Full-app theme roles ──
	bg0: string; // dark background ramp: bg0 0% → bg1 40% → bg2 100%
	bg1: string;
	bg2: string;
	accent: string; // selection, primary CTA (both modes)
	accentSoft: string; // icons, personalized labels (dark)
	accentDeep: string; // accent as icon/text on light backgrounds
	chartLine: string;
	ice: string; // the ONE glass/text tint hue (dark mode)
}

export const DEFAULT_COLORWAY: ColorwayName = "river";

export const colorways: Record<ColorwayName, Colorway> = {
	river: {
		name: "river",
		label: "River",
		skyTop: "#9AD1FF",
		skyBot: "#7CC0FF",
		seaTop: "#3B9DF2",
		seaBot: "#1B5FC4",
		deep: "#164FA8",
		squircleTop: "#0F2140",
		squircleBot: "#081426",
		bg0: "#133A5E",
		bg1: "#0E2A47",
		bg2: "#081826",
		accent: "#3B9DF2",
		accentSoft: "#7CC0FF",
		accentDeep: "#1F7FD4",
		chartLine: "#5EB2F5",
		ice: "#D2EBFF",
	},
	lagoon: {
		name: "lagoon",
		label: "Lagoon",
		skyTop: "#9AE8DE",
		skyBot: "#6ED9C9",
		seaTop: "#2BB4A0",
		seaBot: "#0F7D74",
		deep: "#0A625C",
		squircleTop: "#0E3833",
		squircleBot: "#071E1B",
		bg0: "#0F4A44",
		bg1: "#0B332F",
		bg2: "#06201D",
		accent: "#2BB4A0",
		accentSoft: "#7CDFD0",
		accentDeep: "#0F7D74",
		chartLine: "#4FC9B8",
		ice: "#DFF5F1",
	},
	twilight: {
		name: "twilight",
		label: "Twilight",
		skyTop: "#CCC2FF",
		skyBot: "#AC9EFF",
		seaTop: "#7C6CF2",
		seaBot: "#4E3EC4",
		deep: "#3D2FA8",
		squircleTop: "#1E1A4A",
		squircleBot: "#100C2B",
		bg0: "#2A2468",
		bg1: "#1D1949",
		bg2: "#100C2B",
		accent: "#7C6CF2",
		accentSoft: "#AC9EFF",
		accentDeep: "#4E3EC4",
		chartLine: "#9384F7",
		ice: "#E9E6FC",
	},
	sunset: {
		name: "sunset",
		label: "Sunset",
		skyTop: "#FFCBAA",
		skyBot: "#FFAC7E",
		seaTop: "#F2763B",
		seaBot: "#C44A1B",
		deep: "#A83A16",
		squircleTop: "#40200F",
		squircleBot: "#261106",
		bg0: "#5E2A13",
		bg1: "#40200F",
		bg2: "#261106",
		accent: "#F2763B",
		accentSoft: "#FFAC7E",
		accentDeep: "#C44A1B",
		chartLine: "#F58F5E",
		ice: "#FCEAE2",
	},
	meadow: {
		name: "meadow",
		label: "Meadow",
		skyTop: "#B8ECC2",
		skyBot: "#8ADF9C",
		seaTop: "#3BC46A",
		seaBot: "#1B8A47",
		deep: "#14703C",
		squircleTop: "#0E3A22",
		squircleBot: "#071F12",
		bg0: "#14522F",
		bg1: "#0E3A22",
		bg2: "#071F12",
		accent: "#3BC46A",
		accentSoft: "#8ADF9C",
		accentDeep: "#1B8A47",
		chartLine: "#5ED285",
		ice: "#E4F8EA",
	},
	rose: {
		name: "rose",
		label: "Rose",
		skyTop: "#FFC0D4",
		skyBot: "#FF9BBB",
		seaTop: "#F25B8C",
		seaBot: "#C42B60",
		deep: "#A82250",
		squircleTop: "#401024",
		squircleBot: "#260812",
		bg0: "#5E1332",
		bg1: "#401024",
		bg2: "#260812",
		accent: "#F25B8C",
		accentSoft: "#FF9BBB",
		accentDeep: "#C42B60",
		chartLine: "#F57BA3",
		ice: "#FCE2EB",
	},
	amber: {
		name: "amber",
		label: "Amber",
		skyTop: "#FFE3A8",
		skyBot: "#FFD07C",
		seaTop: "#F2A93B",
		seaBot: "#C47D1B",
		deep: "#A86616",
		squircleTop: "#402A0F",
		squircleBot: "#261806",
		bg0: "#5E3E13",
		bg1: "#402A0F",
		bg2: "#261806",
		accent: "#F2A93B",
		accentSoft: "#FFD07C",
		accentDeep: "#C47D1B",
		chartLine: "#F5BC5E",
		ice: "#FCF1E2",
	},
	ultra: {
		name: "ultra",
		label: "Ultra",
		skyTop: "#F0C4FF",
		skyBot: "#E2A0FF",
		seaTop: "#C25BF2",
		seaBot: "#8F2BC4",
		deep: "#7A22A8",
		squircleTop: "#33103F",
		squircleBot: "#1D0826",
		bg0: "#46165E",
		bg1: "#33103F",
		bg2: "#1D0826",
		accent: "#C25BF2",
		accentSoft: "#E2A0FF",
		accentDeep: "#8F2BC4",
		chartLine: "#CF7BF5",
		ice: "#F4E2FC",
	},
	glacier: {
		name: "glacier",
		label: "Glacier",
		skyTop: "#F4F8FC",
		skyBot: "#DDE8F2",
		seaTop: "#9FB8CE",
		seaBot: "#6E8BA6",
		deep: "#58748E",
		squircleTop: "#1C2A38",
		squircleBot: "#0E161F",
		bg0: "#2A3C4E",
		bg1: "#1C2A38",
		bg2: "#0E161F",
		accent: "#9FB8CE",
		accentSoft: "#C8D8E6",
		// seaBot is too light for text on light backgrounds — use the deep wave.
		accentDeep: "#58748E",
		chartLine: "#AFC6DA",
		ice: "#EFF4F9",
	},
};

export const colorwayList: Colorway[] = Object.values(colorways);

export function isColorwayName(value: string): value is ColorwayName {
	return value in colorways;
}
