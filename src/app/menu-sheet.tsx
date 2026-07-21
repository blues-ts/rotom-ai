import { Fragment, useEffect, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CardPressable from "@/components/CardPressable";
import { useRiverTheme } from "@/constants/theme";
import {
	closeMenuSheetSlot,
	getMenuSheetActions,
	subscribeMenuSheetActions,
} from "@/lib/menuSheet";

// Sort/filter options in a NATIVE form sheet — the same presentation as
// create-collection and configure (fitToContents detent, 28pt lip, grabber),
// replacing FloatingSearchBar's hand-rolled Modal lookalike. Title comes via
// the route's `title` param (read by the header in _layout); the actions
// come through the menuSheet handoff.
export default function MenuSheet() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	// Live read: rows that keep the sheet open re-publish their actions as the
	// sort changes, so the checkmark and direction arrow follow along.
	const actions = useSyncExternalStore(
		subscribeMenuSheetActions,
		getMenuSheetActions,
	);
	useEffect(() => closeMenuSheetSlot, []);

	return (
		<View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
			{actions.map((a, idx) => (
				<Fragment key={a.label}>
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
					onPress={() => {
						Haptics.selectionAsync();
						// Direction toggles stay up so the arrow can be flipped again;
						// everything else dismisses and applies immediately — the
						// native sheet's exit is OS-driven, so it rides out the grid
						// remount fine (the old hand-rolled Modal needed 260ms here).
						if (!a.keepOpen) router.back();
						a.onPress();
					}}
				>
					<View style={styles.optionInner}>
						<Text
							style={[
								styles.optionLabel,
								{
									color: a.destructive
										? t.loss
										: a.isOn
											? t.text.primary
											: t.text.body,
									fontWeight: a.isOn ? "700" : "500",
								},
							]}
						>
							{a.label}
						</Text>
						{a.isOn && (
							<SymbolView
								name="checkmark"
								size={15}
								tintColor={t.accent}
								weight="semibold"
							/>
						)}
						{/* Trailing glyph — the UIMenu / vendor-sheet convention
						    (label left, icon on the far edge). */}
						{a.icon && (
							<SymbolView
								name={a.icon}
								size={17}
								tintColor={a.destructive ? t.loss : t.text.secondary}
								weight="medium"
							/>
						)}
					</View>
				</CardPressable>
				</Fragment>
			))}
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
	// Inset hairline between options — same recipe as the vendor sheets.
	divider: {
		height: StyleSheet.hairlineWidth,
		marginHorizontal: 20,
	},
	optionInner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 14,
	},
	optionLabel: {
		flex: 1,
		fontSize: 16,
	},
});
