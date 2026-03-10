import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";

export default function EmptyChat() {
	const { colors } = useTheme();

	return (
		<Pressable style={styles.container} onPress={Keyboard.dismiss}>
			<Text style={[styles.title, { color: colors.foreground }]}>
				River
			</Text>
			<Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
				Your Pokemon AI Assistant
			</Text>
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
