import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";

const HIDDEN_Y = -60;
// A cached/no-op refresh resolves almost instantly, so the pill would flash and
// be gone before you can read it. Once shown, keep it up for at least this long.
const MIN_VISIBLE_MS = 1000;

export default function RefreshingPill({
	visible,
	label = "Updating prices…",
	topOffset = 8,
}: {
	visible: boolean;
	label?: string;
	topOffset?: number;
}) {
	const { colors } = useTheme();
	const { top } = useSafeAreaInsets();
	const translateY = useSharedValue(HIDDEN_Y);
	const opacity = useSharedValue(0);

	// Latch `visible` so a too-fast refresh still stays on screen MIN_VISIBLE_MS.
	const [shown, setShown] = useState(visible);
	const shownAt = useRef(0);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (hideTimer.current) {
			clearTimeout(hideTimer.current);
			hideTimer.current = null;
		}
		if (visible) {
			shownAt.current = Date.now();
			setShown(true);
		} else {
			const elapsed = Date.now() - shownAt.current;
			const remaining = MIN_VISIBLE_MS - elapsed;
			if (remaining > 0) {
				hideTimer.current = setTimeout(() => setShown(false), remaining);
			} else {
				setShown(false);
			}
		}
		return () => {
			if (hideTimer.current) clearTimeout(hideTimer.current);
		};
	}, [visible]);

	useEffect(() => {
		if (shown) {
			translateY.value = withTiming(0, { duration: 260 });
			opacity.value = withTiming(1, { duration: 200 });
		} else {
			translateY.value = withTiming(HIDDEN_Y, { duration: 220 });
			opacity.value = withTiming(0, { duration: 180 });
		}
	}, [shown]);

	const style = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
		opacity: opacity.value,
	}));

	return (
		<Animated.View
			pointerEvents="none"
			style={[styles.container, { top: top + topOffset }, style]}
		>
			<View
				style={[
					styles.pill,
					{ backgroundColor: colors.card, borderColor: colors.border },
				]}
			>
				<ActivityIndicator size="small" color={colors.foreground} />
				<Text style={[styles.text, { color: colors.foreground }]}>
					{label}
				</Text>
			</View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		left: 0,
		right: 0,
		alignItems: "center",
		zIndex: 100,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
		shadowColor: "#000",
		shadowOpacity: 0.1,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 2 },
		elevation: 4,
	},
	text: {
		fontSize: 13,
		fontWeight: "600",
	},
});
