import { useEffect } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
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
				<View style={styles.titleRow}>
					<Text style={[styles.title, { color: colors.foreground }]}>
						River
					</Text>
					<Image
						source="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/501.gif"
						style={styles.sprite}
						contentFit="contain"
					/>
				</View>
				<Text style={[styles.subtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
					Your Pokemon TCG AI Assistant
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
	titleRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "center",
		marginBottom: 8,
		overflow: "visible",
	},
	title: {
		fontSize: 28,
		fontWeight: "700",
	},
	sprite: {
		width: 56,
		height: 56,
		marginLeft: 4,
	},
	subtitle: {
		fontSize: 16,
	},
});
