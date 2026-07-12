import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useRiverTheme } from "@/constants/theme";

// Our own segmented pill — deliberately NOT the SwiftUI Picker: iOS hides
// native glass hosts whenever the bottom search bar activates, which made the
// controls vanish mid-search. Same ice-glass language as the rest of the
// chrome, but it never disappears out from under the user.

export default function SegmentedChips<T extends string>({
	options,
	value,
	onChange,
	itemWidth,
}: {
	options: { value: T; label: string }[];
	value: T;
	/** Called with the tapped value (also fires for the already-active one). */
	onChange: (v: T) => void;
	/**
	 * Fixed segment width (labels center) — lets two different controls share
	 * one footprint so they can crossfade into each other.
	 */
	itemWidth?: number;
}) {
	const t = useRiverTheme();
	return (
		<View
			style={[
				styles.track,
				{
					backgroundColor: t.glass.elevatedFill,
					borderColor: t.glass.elevatedBorder,
				},
			]}
		>
			{options.map((o) => {
				const on = o.value === value;
				return (
					<Pressable
						key={o.value}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							onChange(o.value);
						}}
						style={[
							styles.item,
							itemWidth !== undefined && {
								width: itemWidth,
								alignItems: "center",
							},
							on && { backgroundColor: t.accent },
						]}
					>
						<Text
							style={[
								styles.label,
								{ color: on ? "#fff" : t.text.secondary },
							]}
						>
							{o.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	track: {
		flexDirection: "row",
		alignSelf: "flex-start",
		borderRadius: 999,
		borderWidth: 1,
		padding: 3,
		gap: 2,
	},
	item: {
		paddingHorizontal: 16,
		paddingVertical: 6,
		borderRadius: 999,
	},
	label: {
		fontSize: 13,
		fontWeight: "600",
	},
});
