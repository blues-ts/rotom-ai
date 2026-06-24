import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import {
	AccessibilityInfo,
	ActivityIndicator,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
	Easing,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";

// Cold-start warm-up screen. Its first frame matches the native splash — solid
// River blue with the centered "River AI" wordmark — so the native → JS handoff
// is invisible. Then the brand's own materials come alive:
//   • a halo blooms behind the wordmark while we warm up, with a small spinner +
//     caption pinned to the bottom telling the user what's happening
//   • on leaving, the wordmark ASCENDS as the field blooms into ice-light, then
//     cross-fades into the app.
const RIVER = "#208AEF"; // exact native-splash background
const ICE = "#EAF4FF"; // the light the wordmark rises into on exit
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
	const reduceMotion = useRef(false);

	const glowScale = useSharedValue(0.92);
	const glowOpacity = useSharedValue(0);
	const footerOpacity = useSharedValue(0);
	const peakY = useSharedValue(0);
	const peakScale = useSharedValue(1);
	const peakOpacity = useSharedValue(1);
	const bloom = useSharedValue(0);

	// Come alive after the seamless handoff: fade in the halo and the footer.
	useEffect(() => {
		let active = true;
		AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
			if (!active) return;
			reduceMotion.current = rm;
			glowOpacity.value = withTiming(rm ? 0.7 : 0.85, { duration: 600 });
			footerOpacity.value = withDelay(
				rm ? 0 : 250,
				withTiming(1, { duration: rm ? 200 : 450 }),
			);
		});
		return () => {
			active = false;
		};
	}, [footerOpacity, glowOpacity]);

	// Exit choreography: the wordmark rises, the field blooms into light, then go.
	useEffect(() => {
		if (!leaving) return;
		const finish = () => onExitComplete?.();
		footerOpacity.value = withTiming(0, { duration: 180 });

		if (reduceMotion.current) {
			peakOpacity.value = withTiming(0, { duration: 240 });
			bloom.value = withTiming(0.95, { duration: 260 }, (done) => {
				if (done) runOnJS(finish)();
			});
			return;
		}

		glowOpacity.value = withTiming(1, { duration: 320 });
		glowScale.value = withTiming(2.5, {
			duration: 560,
			easing: Easing.out(Easing.cubic),
		});
		bloom.value = withDelay(
			110,
			withTiming(0.96, { duration: 460, easing: Easing.out(Easing.quad) }),
		);
		peakScale.value = withTiming(1.24, {
			duration: 620,
			easing: Easing.out(Easing.cubic),
		});
		peakY.value = withTiming(-48, {
			duration: 620,
			easing: Easing.out(Easing.cubic),
		});
		peakOpacity.value = withDelay(
			300,
			withTiming(0, { duration: 360 }, (done) => {
				if (done) runOnJS(finish)();
			}),
		);
	}, [
		leaving,
		bloom,
		footerOpacity,
		glowOpacity,
		glowScale,
		onExitComplete,
		peakOpacity,
		peakScale,
		peakY,
	]);

	const glowStyle = useAnimatedStyle(() => ({
		opacity: glowOpacity.value,
		transform: [{ scale: glowScale.value }],
	}));
	const peakStyle = useAnimatedStyle(() => ({
		opacity: peakOpacity.value,
		transform: [{ translateY: peakY.value }, { scale: peakScale.value }],
	}));
	const footerStyle = useAnimatedStyle(() => ({ opacity: footerOpacity.value }));
	const bloomStyle = useAnimatedStyle(() => ({ opacity: bloom.value }));

	return (
		<View style={styles.container}>
			<View style={styles.center} pointerEvents="none">
				<Animated.View style={glowStyle}>
					<Image source={GLOW} style={styles.glow} contentFit="contain" />
				</Animated.View>
			</View>

			<Animated.View style={peakStyle}>
				<Text style={styles.wordmark} allowFontScaling={false}>
					River<Text style={styles.wordmarkAI}> AI</Text>
				</Text>
			</Animated.View>

			<Animated.View
				style={[
					styles.footer,
					footerStyle,
					{ bottom: insets.bottom + 28 },
				]}
				pointerEvents="none"
			>
				<ActivityIndicator size="small" color="rgba(255,255,255,0.9)" />
				<Text style={styles.caption} allowFontScaling={false}>
					{CAPTION}
				</Text>
			</Animated.View>

			<Animated.View
				style={[styles.bloom, bloomStyle]}
				pointerEvents="none"
			/>
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
	wordmark: {
		fontSize: 44,
		fontWeight: "800",
		letterSpacing: -1,
		color: "#FFFFFF",
	},
	wordmarkAI: {
		fontWeight: "600",
		color: "rgba(255,255,255,0.78)",
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
	bloom: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: ICE,
	},
});
