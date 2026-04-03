import { useEffect } from "react";
import { Keyboard, Pressable, StyleSheet, Text } from "react-native";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/context/ThemeContext";

export default function EmptyChat() {
	const { colors } = useTheme();
	const opacity = useSharedValue(0);
	const translateY = useSharedValue(10);

	useEffect(() => {
		opacity.value = withTiming(1, { duration: 500 });
		translateY.value = withTiming(0, { duration: 500 });
	}, []);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ translateY: translateY.value }],
	}));

	return (
		<Pressable style={styles.container} onPress={Keyboard.dismiss}>
			<Animated.View style={animatedStyle}>
				<Text style={[styles.title, { color: colors.foreground, textAlign: "center" }]}>
					River
				</Text>
				<Text style={[styles.subtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
					Your Pokemon AI Assistant
				</Text>
			</Animated.View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
	},
	title: {
		fontSize: 28,
		fontWeight: "700",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 16,
	},
});
