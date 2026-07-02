import { SymbolView, type SFSymbol } from "expo-symbols";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRiverTheme } from "@/constants/theme";
import { SheetDoneButton } from "@/components/SheetDoneButton";

type Tip = {
	icon: SFSymbol;
	title: string;
	body: string;
};

const TIPS: Tip[] = [
	{
		icon: "viewfinder",
		title: "Fill the frame",
		body: "Line the card up inside the corner guides so the whole card is visible — edges and all.",
	},
	{
		icon: "arrow.up.left.and.arrow.down.right",
		title: "Pinch to zoom",
		body: "Pinch the preview to zoom in on a far-away card or fill the frame without moving closer.",
	},
	{
		icon: "sun.max",
		title: "Use even lighting",
		body: "Bright, diffuse light reads best. Tap the flashlight if a room is dim.",
	},
	{
		icon: "sparkles",
		title: "Beat the glare",
		body: "Holos and sleeves love to reflect. Tilt the card slightly until the shine clears the artwork.",
	},
	{
		icon: "hand.raised",
		title: "Hold steady",
		body: "When the guide turns amber it's locking on — keep still for a beat until it captures.",
	},
	{
		icon: "square.stack",
		title: "One card at a time",
		body: "Scan keeps running, so just swap the next card into the frame to keep adding to your batch.",
	},
	{
		icon: "rectangle.on.rectangle",
		title: "Plain background",
		body: "A flat, uncluttered surface behind the card helps the scanner find the right match faster.",
	},
];

export default function ScannerTipsScreen() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();

	return (
		// The sheet fill comes from the route's contentStyle (camera layout).
		<ScrollView
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
						style={[styles.iconWrap, { backgroundColor: t.accentIconFill }]}
					>
						<SymbolView
							name={tip.icon}
							size={18}
							tintColor={t.accentOn}
							weight="medium"
						/>
					</View>
					<View style={styles.rowText}>
						<Text style={[styles.rowTitle, { color: t.text.primary }]}>
							{tip.title}
						</Text>
						<Text style={[styles.rowBody, { color: t.text.secondary }]}>
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
		borderRadius: 10,
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
