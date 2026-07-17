import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RiverMark from "@/components/RiverMark";
import { useRiverDarkTheme } from "@/constants/theme";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";

// Cold-start warm-up screen. Its first frame matches the native splash — solid
// deep-water navy with the centered wave-orb River mark at the splash's 151pt
// width — so the native → JS handoff is invisible. The full deep-water gradient then fades in over the
// solid base while a halo blooms behind the mark, with a small spinner +
// caption pinned to the bottom telling the user what's happening.
//
// Always deep water, even in light mode (like the scanner): the orb needs the
// dark ground, and the app cross-fades to the themed screen anyway.
//
// The Appearance colorway applies here too, but the native splash art is
// static River — so frame 1 is always River (base color + orb), and the
// colorway arrives WITH the existing 600ms bloom: the themed gradient fades
// in over the navy base and a themed orb cross-fades over the River orb.
// The handoff stays invisible; the re-tint reads as part of the intro.
//
// On leaving we hand off immediately: the root Stack gives the (home) screen an
// `animation: "fade"`, so navigation cross-fades this whole screen into the app —
// no bespoke zoom/bloom needed here.
const SPLASH = "#0E2A47"; // exact native-splash background (gradient mid stop)
const GLOW = require("../../assets/images/logo-glow.png");

const CAPTION = "Downloading the latest data";

export default function AppInitScreen({
	leaving = false,
	onExitComplete,
}: {
	leaving?: boolean;
	onExitComplete?: () => void;
}) {
	const insets = useSafeAreaInsets();
	const td = useRiverDarkTheme();

	const gradientOpacity = useSharedValue(0);
	const glowScale = useSharedValue(0.92);
	const glowOpacity = useSharedValue(0);
	const footerOpacity = useSharedValue(0);

	// Come alive after the seamless handoff: fade in the gradient, the halo,
	// and the footer.
	useEffect(() => {
		gradientOpacity.value = withTiming(1, { duration: 600 });
		glowOpacity.value = withTiming(0.85, { duration: 600 });
		glowScale.value = withTiming(1, {
			duration: 600,
			easing: Easing.out(Easing.cubic),
		});
		footerOpacity.value = withDelay(250, withTiming(1, { duration: 450 }));
	}, [footerOpacity, glowOpacity, glowScale, gradientOpacity]);

	// Hand off the moment warm-up is done — the Stack's fade animation cross-fades
	// this screen into home.
	useEffect(() => {
		if (leaving) onExitComplete?.();
	}, [leaving, onExitComplete]);

	const gradientStyle = useAnimatedStyle(() => ({
		opacity: gradientOpacity.value,
	}));
	const glowStyle = useAnimatedStyle(() => ({
		opacity: glowOpacity.value,
		transform: [{ scale: glowScale.value }],
	}));
	const footerStyle = useAnimatedStyle(() => ({ opacity: footerOpacity.value }));

	return (
		<View style={styles.container}>
			<Animated.View style={[StyleSheet.absoluteFill, gradientStyle]}>
				<LinearGradient
					colors={td.background.colors}
					locations={td.background.locations}
					pointerEvents="none"
					style={StyleSheet.absoluteFill}
				/>
			</Animated.View>

			<View style={styles.center} pointerEvents="none">
				<Animated.View style={glowStyle}>
					<Image
						source={GLOW}
						style={styles.glow}
						contentFit="contain"
						// The halo PNG is River-blue; re-tint it for other colorways
						// (undefined keeps the original art untouched for River).
						tintColor={td.colorway === "river" ? undefined : td.accent}
					/>
				</Animated.View>
			</View>

			<View>
				<RiverMark size={151} />
				{td.colorway !== "river" && (
					<Animated.View style={[StyleSheet.absoluteFill, gradientStyle]}>
						<RiverMark size={151} colorway={td.colorway} />
					</Animated.View>
				)}
			</View>

			<Animated.View
				style={[styles.footer, footerStyle, { bottom: insets.bottom + 28 }]}
				pointerEvents="none"
			>
				<ActivityIndicator size="small" color="rgba(255,255,255,0.9)" />
				<Text style={styles.caption} allowFontScaling={false}>
					{CAPTION}
				</Text>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: SPLASH,
		alignItems: "center",
		justifyContent: "center",
	},
	center: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	glow: {
		width: 460,
		height: 460,
	},
	footer: {
		position: "absolute",
		left: 0,
		right: 0,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	caption: {
		fontSize: 13,
		fontWeight: "500",
		letterSpacing: 0.2,
		color: "rgba(255,255,255,0.85)",
	},
});
