import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRiverTheme } from "@/constants/theme";
import { HAS_BOTTOM_SEARCH_BAR } from "@/lib/platform";

// Soft tail below the header where content finishes fading in.
const FADE_EXTENT = 28;

function withAlpha(hex: string, alpha: number): string {
	// Theme colors are 6-digit hex; append the alpha byte. Fading to the SAME
	// hue at alpha 0 (never "transparent") avoids the fade-through-gray that
	// rgba(0,0,0,0) interpolation produces.
	const a = Math.round(alpha * 255)
		.toString(16)
		.padStart(2, "0");
	return `${hex}${a}`;
}

/**
 * iOS-26-style header fade for older iOS: content scrolling under the
 * transparent header dissolves into the background color instead of hitting
 * a frosted-glass strip. Render it as a late sibling of the screen's scroll
 * view (absolute-positioned, taps pass through). On iOS 26+ the native
 * liquid-glass chrome already does this, so it renders nothing.
 */
export default function HeaderFadeScrim({
	headerHeight = 52,
	color,
	maxOpacity = 0.6,
}: {
	headerHeight?: number;
	/** Fade color — defaults to the theme background's top color. */
	color?: string;
	/**
	 * Peak opacity at the very top. Sub-1 for screens where the top strip
	 * must stay see-through (e.g. a scrim over the live camera feed).
	 */
	maxOpacity?: number;
}) {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	if (HAS_BOTTOM_SEARCH_BAR) return null;
	const base = color ?? t.background.colors[0];
	return (
		<LinearGradient
			// No hold — one straight dissolve from the top edge. A light wash,
			// not a bar; bump maxOpacity per screen if a title needs more help.
			colors={[withAlpha(base, maxOpacity), withAlpha(base, 0)]}
			locations={[0, 1]}
			pointerEvents="none"
			style={[
				styles.scrim,
				{ height: insets.top + headerHeight + FADE_EXTENT },
			]}
		/>
	);
}

const styles = StyleSheet.create({
	scrim: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
	},
});
