import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import RiverMark from "@/components/RiverMark";
import { type Colorway, colorwayList } from "@/constants/colorways";
import {
	radius,
	typeScale,
	useColorway,
	useRiverTheme,
} from "@/constants/theme";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";

// Optional native module: switching the home-screen icon needs a dev build
// that includes expo-alternate-app-icons. Guarded so a JS-only reload on an
// older build still renders Settings (the icon picker shows a hint instead).
let AppIcons: typeof import("expo-alternate-app-icons") | null;
try {
	// Must be a guarded runtime require: a static import would crash module
	// load when the native module is absent.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	AppIcons = require("expo-alternate-app-icons");
} catch {
	AppIcons = null;
}

function readCurrentIconName(): string | null {
	try {
		return AppIcons?.getAppIconName() ?? null;
	} catch {
		return null;
	}
}

// Pro-gated appearance settings: the app-theme colorway and the app-icon
// colorway (both from the wave-orb handoff palette) are picked independently.
export default function AppearanceSection() {
	const t = useRiverTheme();
	const { colorway, setColorway } = useColorway();
	const { isPro } = useRevenueCat();
	// "Lagoon" … or null for the default (River) icon.
	const [iconName, setIconName] = useState<string | null>(readCurrentIconName);

	const iconColorway = (iconName ?? "river").toLowerCase();

	const gateToPro = (cw: Colorway) => {
		if (isPro || cw.name === "river") return false;
		void presentProPaywallIfNeeded();
		return true;
	};

	const handleSelectTheme = (cw: Colorway) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		if (gateToPro(cw)) return;
		setColorway(cw.name);
	};

	const handleSelectIcon = async (cw: Colorway) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		if (gateToPro(cw)) return;
		if (!AppIcons) return;
		try {
			const result = await AppIcons.setAlternateAppIcon(
				cw.name === "river" ? null : cw.label,
			);
			setIconName(result);
		} catch (err) {
			console.warn("[Appearance] setAlternateAppIcon failed:", err);
		}
	};

	return (
		<View style={styles.section}>
			<View style={styles.headerRow}>
				<Text style={[styles.overline, { color: t.text.secondary }]}>
					Appearance
				</Text>
				{!isPro ? (
					<View style={[styles.proChip, { backgroundColor: t.accentIconFill }]}>
						<Text style={[styles.proChipText, { color: t.accentOn }]}>PRO</Text>
					</View>
				) : null}
			</View>
			<View
				style={[
					styles.card,
					{
						backgroundColor: t.glass.surfaceFill,
						borderColor: t.glass.surfaceBorder,
					},
					t.glass.shadow,
				]}
			>
				{/* App theme */}
				<Text style={[styles.pickerLabel, { color: t.text.secondary }]}>
					App theme
				</Text>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.swatchRow}
				>
					{colorwayList.map((cw) => {
						const selected = cw.name === colorway;
						return (
							<Pressable
								key={cw.name}
								onPress={() => handleSelectTheme(cw)}
								accessibilityRole="button"
								accessibilityState={{ selected }}
								accessibilityLabel={`${cw.label} theme`}
								style={styles.swatch}
							>
								<View
									style={[
										styles.orbRing,
										{ borderColor: selected ? t.accent : "transparent" },
									]}
								>
									<RiverMark size={40} colorway={cw.name} />
								</View>
								<Text
									style={[
										styles.swatchLabel,
										{
											color: selected ? t.accentOn : t.text.tertiary,
											fontWeight: selected ? "700" : "500",
										},
									]}
									numberOfLines={1}
								>
									{cw.label}
								</Text>
							</Pressable>
						);
					})}
				</ScrollView>

				<View
					style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]}
				/>

				{/* App icon */}
				<Text style={[styles.pickerLabel, { color: t.text.secondary }]}>
					App icon
				</Text>
				{AppIcons?.supportsAlternateIcons ? (
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.swatchRow}
					>
						{colorwayList.map((cw) => {
							const selected = cw.name === iconColorway;
							return (
								<Pressable
									key={cw.name}
									onPress={() => handleSelectIcon(cw)}
									accessibilityRole="button"
									accessibilityState={{ selected }}
									accessibilityLabel={`${cw.label} app icon`}
									style={styles.swatch}
								>
									<View
										style={[
											styles.iconRing,
											{ borderColor: selected ? t.accent : "transparent" },
										]}
									>
										<LinearGradient
											colors={[cw.squircleTop, cw.squircleBot]}
											style={styles.iconTile}
										>
											{/* Match the real icon's proportions: mark at 70% of
											    the 44pt tile (see generate-brand-assets.ts). */}
											<RiverMark size={31} colorway={cw.name} />
										</LinearGradient>
									</View>
									<Text
										style={[
											styles.swatchLabel,
											{
												color: selected ? t.accentOn : t.text.tertiary,
												fontWeight: selected ? "700" : "500",
											},
										]}
										numberOfLines={1}
									>
										{cw.label}
									</Text>
								</Pressable>
							);
						})}
					</ScrollView>
				) : (
					<Text style={[styles.unavailable, { color: t.text.tertiary }]}>
						App-icon switching needs the latest app build.
					</Text>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	section: {
		gap: 8,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 4,
	},
	overline: {
		...typeScale.overline,
	},
	proChip: {
		borderRadius: radius.pill,
		paddingHorizontal: 7,
		paddingVertical: 2,
	},
	proChipText: {
		...typeScale.badge,
		letterSpacing: 0.5,
	},
	card: {
		borderRadius: radius.tile,
		borderWidth: 1,
		overflow: "hidden",
		paddingVertical: 14,
	},
	pickerLabel: {
		...typeScale.caption,
		paddingHorizontal: 14,
		marginBottom: 10,
	},
	swatchRow: {
		paddingHorizontal: 14,
		gap: 14,
	},
	swatch: {
		alignItems: "center",
		gap: 5,
		minWidth: 52,
	},
	orbRing: {
		width: 50,
		height: 50,
		borderRadius: 25,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	iconRing: {
		borderRadius: 15,
		borderWidth: 2,
		padding: 1,
	},
	iconTile: {
		width: 44,
		height: 44,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	swatchLabel: {
		fontSize: 11,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginVertical: 14,
	},
	unavailable: {
		...typeScale.caption,
		paddingHorizontal: 14,
	},
});
