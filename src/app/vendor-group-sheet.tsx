import { Fragment, useMemo } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CardPressable from "@/components/CardPressable";
import { useRiverTheme } from "@/constants/theme";
import { useVendorItems } from "@/hooks/useVendorItems";

/**
 * Group picker in a NATIVE form sheet (menu-sheet presentation) — assigns the
 * given vendor_items rows to a group, back to Ungrouped, or into a brand-new
 * group created on the spot. Reached from the item sheet ("Move to group")
 * and the multi-select batch bar.
 */
export default function VendorGroupSheet() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const { ids } = useLocalSearchParams<{ ids: string; title?: string }>();
	const { items, groups, createGroup, assignToGroup } = useVendorItems();

	const pickedIds = useMemo(
		() => (ids ? ids.split(",").filter(Boolean) : []),
		[ids],
	);

	// The group every picked item already belongs to (undefined when mixed) —
	// rendered as the checked row, like menu-sheet's isOn.
	const currentGroupId = useMemo(() => {
		const picked = items.filter((i) => pickedIds.includes(i.id));
		if (picked.length === 0) return undefined;
		const first = picked[0].groupId ?? null;
		return picked.every((i) => (i.groupId ?? null) === first)
			? first
			: undefined;
	}, [items, pickedIds]);

	const assign = (groupId: string | null) => {
		Haptics.selectionAsync();
		assignToGroup.mutate(
			{ ids: pickedIds, groupId },
			{ onSuccess: () => router.back() },
		);
	};

	const promptNewGroup = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		Alert.prompt(
			"New group",
			"Give your group a name.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Create",
					onPress: (name?: string) => {
						const trimmed = name?.trim();
						if (!trimmed) return;
						createGroup.mutate(trimmed, {
							onSuccess: (groupId) => assign(groupId),
						});
					},
				},
			],
			"plain-text",
		);
	};

	const rows: {
		key: string;
		label: string;
		icon: string;
		groupId?: string | null;
		onPress: () => void;
	}[] = [
		...groups.map((g) => ({
			key: g.id,
			label: g.name,
			icon: "folder",
			groupId: g.id as string | null,
			onPress: () => assign(g.id),
		})),
		{
			key: "__none__",
			label: "No group",
			icon: "folder.badge.minus",
			groupId: null,
			onPress: () => assign(null),
		},
		{
			key: "__new__",
			label: "New group…",
			icon: "plus",
			onPress: promptNewGroup,
		},
	];

	return (
		<View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
			{rows.map((r, idx) => {
				const isOn =
					r.groupId !== undefined && r.groupId === (currentGroupId ?? null);
				return (
					<Fragment key={r.key}>
					{idx > 0 && (
						<View
							style={[
								styles.divider,
								{ backgroundColor: t.glass.surfaceBorder },
							]}
						/>
					)}
					<CardPressable
						pressScale={1}
						baseColor="transparent"
						pressedColor={t.glass.pressedFill}
						style={styles.optionRow}
						onPress={r.onPress}
					>
						<View style={styles.optionInner}>
							<View style={styles.optionLead}>
								<SymbolView
									name={r.icon as never}
									size={17}
									tintColor={
										r.key === "__new__" ? t.accentOn : t.text.secondary
									}
									weight="medium"
								/>
								<Text
									style={[
										styles.optionLabel,
										{
											color:
												r.key === "__new__"
													? t.accentOn
													: isOn
														? t.text.primary
														: t.text.body,
											fontWeight: isOn ? "700" : "500",
										},
									]}
								>
									{r.label}
								</Text>
							</View>
							{isOn && (
								<SymbolView
									name="checkmark"
									size={15}
									tintColor={t.accent}
									weight="semibold"
								/>
							)}
						</View>
					</CardPressable>
					</Fragment>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingTop: 12,
	},
	optionRow: {
		borderRadius: 12,
		marginHorizontal: 8,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginHorizontal: 20,
	},
	optionInner: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		paddingVertical: 14,
	},
	optionLead: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		flexShrink: 1,
	},
	optionLabel: {
		fontSize: 16,
	},
});
