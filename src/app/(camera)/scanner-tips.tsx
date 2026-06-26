import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/ThemeContext";
import { SheetDoneButton } from "@/components/SheetDoneButton";

type Tip = {
	icon: keyof typeof Ionicons.glyphMap;
	title: string;
	body: string;
};

const TIPS: Tip[] = [
	{
		icon: "scan-outline",
		title: "Fill the frame",
		body: "Line the card up inside the corner guides so the whole card is visible — edges and all.",
	},
	{
		icon: "resize-outline",
		title: "Pinch to zoom",
		body: "Pinch the preview to zoom in on a far-away card or fill the frame without moving closer.",
	},
	{
		icon: "sunny-outline",
		title: "Use even lighting",
		body: "Bright, diffuse light reads best. Tap the flashlight if a room is dim.",
	},
	{
		icon: "sparkles-outline",
		title: "Beat the glare",
		body: "Holos and sleeves love to reflect. Tilt the card slightly until the shine clears the artwork.",
	},
	{
		icon: "hand-left-outline",
		title: "Hold steady",
		body: "When the guide turns amber it's locking on — keep still for a beat until it captures.",
	},
	{
		icon: "albums-outline",
		title: "One card at a time",
		body: "Scan keeps running, so just swap the next card into the frame to keep adding to your batch.",
	},
	{
		icon: "layers-outline",
		title: "Plain background",
		body: "A flat, uncluttered surface behind the card helps the scanner find the right match faster.",
	},
];

export default function ScannerTipsScreen() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();

	return (
		<ScrollView
			style={{ backgroundColor: colors.card }}
			contentContainerStyle={{
				paddingTop: 8,
				paddingBottom: insets.bottom + 24,
				paddingHorizontal: 20,
			}}
			showsVerticalScrollIndicator={false}
		>
			<Stack.Screen
				options={{
					headerTitle: "Scanning Tips",
					headerRight: () => <SheetDoneButton />,
				}}
			/>
			{TIPS.map((tip) => (
				<View key={tip.title} style={styles.row}>
					<View
						style={[styles.iconWrap, { backgroundColor: colors.background }]}
					>
						<Ionicons name={tip.icon} size={20} color={colors.primary} />
					</View>
					<View style={styles.rowText}>
						<Text style={[styles.rowTitle, { color: colors.foreground }]}>
							{tip.title}
						</Text>
						<Text style={[styles.rowBody, { color: colors.mutedForeground }]}>
							{tip.body}
						</Text>
					</View>
				</View>
			))}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 14,
		paddingVertical: 12,
	},
	iconWrap: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	rowText: {
		flex: 1,
	},
	rowTitle: {
		fontSize: 16,
		fontWeight: "700",
		marginBottom: 3,
	},
	rowBody: {
		fontSize: 14,
		lineHeight: 19.5,
	},
});
