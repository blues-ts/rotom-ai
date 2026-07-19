import { Alert, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CardPressable from "@/components/CardPressable";
import { useRiverTheme } from "@/constants/theme";
import { formatCurrency } from "@/lib/format";
import { useVendorItems } from "@/hooks/useVendorItems";

/**
 * Manage one vending group in a NATIVE form sheet (menu-sheet presentation) —
 * rename or delete, reached from the ellipsis on a group's section header.
 * Title (the group name) rides in as the `title` route param.
 */
export default function VendorGroupOptionsSheet() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const { id } = useLocalSearchParams<{ id: string; title?: string }>();
	const { groups, listed, renameGroup, deleteGroup } = useVendorItems();

	const group = groups.find((g) => g.id === id);
	// Deleted while open (a back is in flight) — nothing to show.
	if (!group) return null;

	const members = listed.filter((i) => i.groupId === group.id);
	const cardCount = members.reduce((sum, i) => sum + i.quantity, 0);
	const shelfValue = members.reduce(
		(sum, i) => sum + (i.askingPrice ?? i.marketValue) * i.quantity,
		0,
	);

	const promptRename = () => {
		Alert.prompt(
			"Rename group",
			undefined,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Save",
					onPress: (name?: string) => {
						const trimmed = name?.trim();
						if (!trimmed || trimmed === group.name) return;
						renameGroup.mutate(
							{ id: group.id, name: trimmed },
							{ onSuccess: () => router.back() },
						);
					},
				},
			],
			"plain-text",
			group.name,
		);
	};

	const confirmDelete = () => {
		Alert.alert(
			`Delete “${group.name}”?`,
			"Its cards move to Ungrouped — nothing is removed from the shelf.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: () => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
						deleteGroup.mutate(
							{ id: group.id },
							{ onSuccess: () => router.back() },
						);
					},
				},
			],
		);
	};

	return (
		<View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
			{/* Group summary — how much shelf this group is carrying. */}
			<View style={styles.summary}>
				<View
					style={[styles.summaryIcon, { backgroundColor: t.accentIconFill }]}
				>
					<SymbolView
						name="folder"
						size={16}
						tintColor={t.accentOn}
						weight="semibold"
					/>
				</View>
				<Text style={[styles.summaryText, { color: t.text.secondary }]}>
					{cardCount} {cardCount === 1 ? "card" : "cards"} ·{" "}
					{formatCurrency(shelfValue)} asking
				</Text>
			</View>

			<CardPressable
				pressScale={1}
				baseColor="transparent"
				pressedColor={t.glass.pressedFill}
				style={styles.optionRow}
				onPress={() => {
					Haptics.selectionAsync();
					promptRename();
				}}
			>
				<View style={styles.optionInner}>
					<Text style={[styles.optionLabel, { color: t.text.body }]}>
						Rename
					</Text>
					<SymbolView
						name="pencil"
						size={17}
						tintColor={t.text.secondary}
						weight="medium"
					/>
				</View>
			</CardPressable>
			<CardPressable
				pressScale={1}
				baseColor="transparent"
				pressedColor={t.glass.pressedFill}
				style={styles.optionRow}
				onPress={() => {
					Haptics.selectionAsync();
					confirmDelete();
				}}
			>
				<View style={styles.optionInner}>
					<Text style={[styles.optionLabel, { color: t.loss }]}>
						Delete group
					</Text>
					<SymbolView
						name="trash"
						size={16}
						tintColor={t.loss}
						weight="medium"
					/>
				</View>
			</CardPressable>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingTop: 4,
	},
	summary: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 20,
		paddingTop: 8,
		paddingBottom: 12,
	},
	summaryIcon: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
	},
	summaryText: {
		fontSize: 14,
		fontWeight: "500",
		flexShrink: 1,
	},
	optionRow: {
		borderRadius: 12,
		marginHorizontal: 8,
	},
	optionInner: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		paddingVertical: 14,
	},
	optionLabel: {
		fontSize: 16,
		fontWeight: "500",
	},
});
