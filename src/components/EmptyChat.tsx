import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";

export default function EmptyChat() {
	const { colors } = useTheme();

	return (
		<View style={styles.container}>
			<Text style={[styles.title, { color: colors.foreground }]}>
				Ask River
			</Text>
			<Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
				Your Pokemon TCG assistant
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFillObject,
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
