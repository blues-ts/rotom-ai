import { StyleSheet, Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import type { ToastType } from "@/context/ToastContext";

const HIDDEN_Y = -60;

export default function Toast({
	visible,
	message,
	type,
}: {
	visible: boolean;
	message: string;
	type: ToastType;
}) {
	const { colors } = useTheme();
	const { top } = useSafeAreaInsets();
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
	}, [visible, translateY, opacity]);

	const style = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
		opacity: opacity.value,
	}));

	return (
		<Animated.View
			pointerEvents="none"
			style={[styles.container, { top: top + 8 }, style]}
		>
			<View
				style={[
					styles.pill,
					{ backgroundColor: colors.card, borderColor: colors.border },
				]}
			>
				<Ionicons
					name={type === "success" ? "checkmark-circle" : "alert-circle"}
					size={18}
					color={type === "success" ? colors.primary : colors.destructive}
				/>
				<Text style={[styles.text, { color: colors.foreground }]}>
					{message}
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
		zIndex: 200,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
		maxWidth: "85%",
		shadowColor: "#000",
		shadowOpacity: 0.1,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 2 },
		elevation: 4,
	},
	text: {
		fontSize: 13,
		fontWeight: "600",
		flexShrink: 1,
	},
});
