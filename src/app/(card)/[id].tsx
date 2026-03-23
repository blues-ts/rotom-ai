import { StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@/context/ThemeContext";

export default function CardDetail() {
	const { colors } = useTheme();
	const { id, name } = useLocalSearchParams<{ id: string; name: string }>();

	return (
		<>
			<Stack.Screen options={{ headerTitle: name ?? "Card" }} />
			<View style={[styles.container, { backgroundColor: colors.background }]}>
				<Text style={[styles.name, { color: colors.foreground }]}>
					{name}
				</Text>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	name: {
		fontSize: 24,
		fontWeight: "700",
	},
});
