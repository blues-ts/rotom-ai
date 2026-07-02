import { StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import CardPressable from "@/components/CardPressable";
import { useRiverTheme } from "@/constants/theme";

export default function ErrorState({
	title = "Something went wrong",
	message = "Check your connection and try again.",
	onRetry,
}: {
	title?: string;
	message?: string;
	onRetry?: () => void;
}) {
	const t = useRiverTheme();

	return (
		<View style={styles.container}>
			<SymbolView
				name="wifi.slash"
				size={44}
				tintColor={t.text.tertiary}
				weight="regular"
			/>
			<Text style={[styles.title, { color: t.text.primary }]}>
				{title}
			</Text>
			<Text style={[styles.subtitle, { color: t.text.secondary }]}>
				{message}
			</Text>
			{onRetry ? (
				<CardPressable
					pressScale={0.96}
					baseColor={t.glass.elevatedFill}
					pressedColor={t.glass.pressedFill}
					style={[
						styles.retryButton,
						{ borderColor: t.glass.elevatedBorder },
					]}
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						onRetry();
					}}
				>
					<SymbolView
						name="arrow.clockwise"
						size={14}
						tintColor={t.text.primary}
						weight="medium"
					/>
					<Text style={[styles.retryText, { color: t.text.primary }]}>
						Try Again
					</Text>
				</CardPressable>
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
		borderRadius: 999,
		borderWidth: 1,
		marginTop: 8,
	},
	retryText: {
		fontSize: 15,
		fontWeight: "600",
	},
});
