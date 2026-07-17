import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, FadeIn } from "react-native-reanimated";
import { useRiverTheme } from "@/constants/theme";

const FADE_MS = 450;

/**
 * The deep-water gradient every screen shares. Two layers: on a theme change
 * (colorway pick or a light/dark flip) the old gradient holds underneath
 * while the new one fades in over it, so appearance changes glide instead of
 * snapping. No fade on first mount.
 */
export default function ThemedBackground() {
	const t = useRiverTheme();
	const themeKey = `${t.colorway}-${t.isDark ? "dark" : "light"}`;
	// base = the PREVIOUS theme's gradient. Swapped via a render-phase update
	// (React's derived-state pattern) so the base changes in the same commit
	// that remounts the fading top layer — no one-frame flash of the new color.
	const [state, setState] = useState({
		key: themeKey,
		bg: t.background,
		base: t.background,
		changed: false,
	});
	if (state.key !== themeKey) {
		setState({
			key: themeKey,
			bg: t.background,
			base: state.bg,
			changed: true,
		});
	}

	return (
		<View pointerEvents="none" style={StyleSheet.absoluteFill}>
			<LinearGradient
				colors={state.base.colors}
				locations={state.base.locations}
				style={StyleSheet.absoluteFill}
			/>
			<Animated.View
				key={themeKey}
				entering={
					state.changed
						? FadeIn.duration(FADE_MS).easing(Easing.out(Easing.quad))
						: undefined
				}
				style={StyleSheet.absoluteFill}
			>
				<LinearGradient
					colors={t.background.colors}
					locations={t.background.locations}
					style={StyleSheet.absoluteFill}
				/>
			</Animated.View>
		</View>
	);
}
