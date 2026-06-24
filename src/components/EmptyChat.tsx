import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useTheme } from "@/context/ThemeContext";

export default function EmptyChat() {
	const { colors, theme } = useTheme();

	return (
		<Pressable style={styles.container} onPress={Keyboard.dismiss}>
			{/* Declarative entering animation — runs natively and always resolves to
			    visible, unlike a mount-time useEffect that can be dropped mid-
			    navigation and leave the header stuck at opacity 0. */}
			<Animated.View entering={FadeInDown.duration(500)}>
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
				<Text
					style={[
						styles.subtitle,
						{
							// White in dark mode so the tagline doesn't read as washed-out
							// grey against the dark background.
							color: theme === "dark" ? "#ffffff" : colors.mutedForeground,
							textAlign: "center",
						},
					]}
				>
					Your Pokemon TCG AI Assistant
				</Text>
			</Animated.View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: {
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
