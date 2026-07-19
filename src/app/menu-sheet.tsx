import { Fragment, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CardPressable from "@/components/CardPressable";
import { useRiverTheme } from "@/constants/theme";
import { getMenuSheetActions } from "@/lib/menuSheet";

// Sort/filter options in a NATIVE form sheet — the same presentation as
// create-collection and configure (fitToContents detent, 28pt lip, grabber),
// replacing FloatingSearchBar's hand-rolled Modal lookalike. Title comes via
// the route's `title` param (read by the header in _layout); the actions
// come through the menuSheet handoff.
export default function MenuSheet() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	// Snapshot on mount: the checkmarks reflect the state at open time, and
	// the sheet dismisses on every selection, so it never needs to re-read.
	const actions = useRef(getMenuSheetActions()).current;

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
						// Dismiss and apply immediately — the native sheet's exit is
						// OS-driven, so it rides out the grid remount fine (the old
						// hand-rolled Modal needed a 260ms grace here).
						router.back();
						a.onPress();
					}}
				>
					<View style={styles.optionInner}>
						<View style={styles.optionLead}>
							{a.icon && (
								<SymbolView
									name={a.icon}
									size={17}
									tintColor={
										a.destructive ? t.loss : t.text.secondary
									}
									weight="medium"
								/>
							)}
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
						</View>
						{a.isOn && (
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
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingTop: 4,
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
