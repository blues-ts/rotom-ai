import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/context/ThemeContext";

const HIDDEN_Y = -60;

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
	const translateY = useSharedValue(HIDDEN_Y);
	const opacity = useSharedValue(0);

	useEffect(() => {
		if (visible) {
			translateY.value = withTiming(0, { duration: 260 });
			opacity.value = withTiming(1, { duration: 200 });
		} else {
			translateY.value = withTiming(HIDDEN_Y, { duration: 220 });
			opacity.value = withTiming(0, { duration: 180 });
		}
	}, [visible]);

	const style = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
		opacity: opacity.value,
	}));

	return (
		<Animated.View
			pointerEvents="none"
			style={[styles.container, { top: topOffset }, style]}
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
