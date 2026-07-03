import { useCallback } from "react";
import {
	Pressable,
	StyleProp,
	StyleSheet,
	Text,
	View,
	ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";

import { useRiverTheme } from "@/constants/theme";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";

// Intensity fractions for the edge feather, top → center. Small steps between
// adjacent strips keep the seams invisible while reading as one gradual fade.
const FEATHER_RAMP = [0.12, 0.28, 0.5, 0.75];

interface ProGateProps {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
	blurIntensity?: number;
	ctaText?: string;
	/**
	 * Custom locked layout rendered INSTEAD of the blurred children — the
	 * preferred gate style (see feedback: blurred content on the dark
	 * gradient reads as smudge). Should be self-contained: crisp labels,
	 * RedactBars for values, and its own ProUnlockPill. Children never
	 * mount while locked, so real values stay off-screen.
	 */
	lockedView?: React.ReactNode;
}

/**
 * Glass placeholder bar standing in for redacted text — size it to the type
 * it replaces (via style) so the layout doesn't jump on unlock.
 */
export function RedactBar({
	style,
	tone = "elevated",
}: {
	style?: StyleProp<ViewStyle>;
	tone?: "elevated" | "surface";
}) {
	const t = useRiverTheme();
	return (
		<View
			style={[
				{
					backgroundColor:
						tone === "elevated"
							? t.glass.elevatedFill
							: t.glass.surfaceFill,
				},
				style,
			]}
		/>
	);
}

/**
 * The accent unlock pill on its own — for surfaces that build a custom
 * locked layout (e.g. the portfolio chart teaser) instead of blurring
 * real content behind ProGate.
 */
export function ProUnlockPill({
	ctaText = "Unlock with River AI TCG Pro",
}: {
	ctaText?: string;
}) {
	const t = useRiverTheme();

	const handleUnlock = useCallback(() => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		void presentProPaywallIfNeeded();
	}, []);

	return (
		<Pressable
			onPress={handleUnlock}
			style={[styles.cta, { backgroundColor: t.accent }, t.buttonGlow]}
		>
			<SymbolView
				name="lock"
				size={14}
				tintColor="#FFFFFF"
				weight="medium"
			/>
			<Text style={[styles.ctaText, { color: "#FFFFFF" }]}>{ctaText}</Text>
		</Pressable>
	);
}

export function ProGate({
	children,
	style,
	// Enough to make real values unreadable, low enough that the content's
	// shape still teases through — the gate should read as frosted glass,
	// not an empty slab.
	blurIntensity = 40,
	ctaText = "Unlock with River AI TCG Pro",
	lockedView,
}: ProGateProps) {
	const { isPro } = useRevenueCat();
	const t = useRiverTheme();

	const handleUnlock = useCallback(() => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		void presentProPaywallIfNeeded();
	}, []);

	if (isPro) {
		return <View style={style}>{children}</View>;
	}

	if (lockedView) {
		return <View style={style}>{lockedView}</View>;
	}

	return (
		<View style={[style, styles.clip]}>
			<View pointerEvents="none">{children}</View>
			{/* Progressive blur: iOS's native blur can't be alpha-masked (the
			    effect silently stops rendering), so the fade is stepped instead —
			    thin strips ramp the intensity up over the top edge and back down
			    over the bottom edge, melting the frosted region into the screen
			    instead of ending in a hard rectangular cut. */}
			<View pointerEvents="none" style={StyleSheet.absoluteFill}>
				{FEATHER_RAMP.map((f, i) => (
					<BlurView
						key={`top-${i}`}
						intensity={blurIntensity * f}
						tint={t.isDark ? "dark" : "light"}
						style={styles.featherStrip}
					/>
				))}
				<BlurView
					intensity={blurIntensity}
					tint={t.isDark ? "dark" : "light"}
					style={styles.featherFill}
				/>
				{FEATHER_RAMP.map((f, i) => (
					<BlurView
						key={`bottom-${i}`}
						intensity={
							blurIntensity *
							FEATHER_RAMP[FEATHER_RAMP.length - 1 - i]
						}
						tint={t.isDark ? "dark" : "light"}
						style={styles.featherStrip}
					/>
				))}
			</View>
			<Pressable
				onPress={handleUnlock}
				style={[StyleSheet.absoluteFill, styles.center]}
			>
				<ProUnlockPill ctaText={ctaText} />
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	clip: {
		overflow: "hidden",
	},
	// Fixed-height feather strips so the fade distance is consistent however
	// tall the gated content is.
	featherStrip: {
		height: 12,
	},
	featherFill: {
		flex: 1,
	},
	center: {
		alignItems: "center",
		justifyContent: "center",
	},
	cta: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 999,
	},
	ctaText: {
		fontSize: 13,
		fontWeight: "600",
	},
});
