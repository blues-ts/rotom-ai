import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/ThemeContext";

export default function ErrorState({
	title = "Something went wrong",
	message = "Check your connection and try again.",
	onRetry,
}: {
	title?: string;
	message?: string;
	onRetry?: () => void;
}) {
	const { colors } = useTheme();

	return (
		<View style={styles.container}>
			<Ionicons
				name="cloud-offline-outline"
				size={48}
				color={colors.mutedForeground}
			/>
			<Text style={[styles.title, { color: colors.foreground }]}>
				{title}
			</Text>
			<Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
				{message}
			</Text>
			{onRetry ? (
				<Pressable
					style={[styles.retryButton, { backgroundColor: colors.card }]}
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						onRetry();
					}}
				>
					<Ionicons name="refresh" size={16} color={colors.foreground} />
					<Text style={[styles.retryText, { color: colors.foreground }]}>
						Try Again
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
		gap: 10,
	},
	title: {
		fontSize: 20,
		fontWeight: "700",
		marginTop: 8,
	},
	subtitle: {
		fontSize: 15,
		textAlign: "center",
		lineHeight: 21,
	},
	retryButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 12,
		marginTop: 8,
	},
	retryText: {
		fontSize: 15,
		fontWeight: "600",
	},
});
