import { Image } from "expo-image";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RiverLogo from "@/components/RiverLogo";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";

// Cold-start warm-up screen. Its first frame matches the native splash — solid
// River blue with the centered white River logo mark — so the native → JS
// handoff is invisible. A halo blooms behind the mark while we warm up, with a
// small spinner + caption pinned to the bottom telling the user what's happening.
//
// On leaving we hand off immediately: the root Stack gives the (home) screen an
// `animation: "fade"`, so navigation cross-fades this whole screen into the app —
// no bespoke zoom/bloom needed here.
const RIVER = "#208AEF"; // exact native-splash background
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

	const glowScale = useSharedValue(0.92);
	const glowOpacity = useSharedValue(0);
	const footerOpacity = useSharedValue(0);

	// Come alive after the seamless handoff: fade in the halo and the footer.
	useEffect(() => {
		glowOpacity.value = withTiming(0.85, { duration: 600 });
		glowScale.value = withTiming(1, {
			duration: 600,
			easing: Easing.out(Easing.cubic),
		});
		footerOpacity.value = withDelay(250, withTiming(1, { duration: 450 }));
	}, [footerOpacity, glowOpacity, glowScale]);

	// Hand off the moment warm-up is done — the Stack's fade animation cross-fades
	// this screen into home.
	useEffect(() => {
		if (leaving) onExitComplete?.();
	}, [leaving, onExitComplete]);

	const glowStyle = useAnimatedStyle(() => ({
		opacity: glowOpacity.value,
		transform: [{ scale: glowScale.value }],
	}));
	const footerStyle = useAnimatedStyle(() => ({ opacity: footerOpacity.value }));

	return (
		<View style={styles.container}>
			<View style={styles.center} pointerEvents="none">
				<Animated.View style={glowStyle}>
					<Image source={GLOW} style={styles.glow} contentFit="contain" />
				</Animated.View>
			</View>

			<RiverLogo size={132} color="#FFFFFF" />

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
		backgroundColor: RIVER,
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
