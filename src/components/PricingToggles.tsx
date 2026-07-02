import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { typeScale, useRiverTheme } from "@/constants/theme";

/**
 * Pill-style selection controls shared by the card-detail configure sheet (and
 * available to any future screen). Self-theming via useRiverTheme(); selected
 * state is always the accent fill (never accent as decoration).
 */

export function ToggleLabel({
	children,
	style,
}: {
	children: React.ReactNode;
	style?: any;
}) {
	const t = useRiverTheme();
	return (
		<Text style={[styles.toggleLabel, { color: t.text.secondary }, style]}>
			{children}
		</Text>
	);
}

function Chip({
	label,
	active,
	onPress,
	columns,
}: {
	label: string;
	active: boolean;
	onPress: () => void;
	columns?: number;
}) {
	const t = useRiverTheme();
	return (
		<Pressable
			hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
			style={({ pressed }) => [
				styles.togglePill,
				// Fixed basis, no grow: chips keep the same width even when a row
				// isn't full (e.g. a card with only two grade options).
				columns ? { flexBasis: `${100 / columns - 2}%` } : null,
				active
					? { backgroundColor: t.accent }
					: {
							backgroundColor: pressed
								? t.glass.pressedFill
								: t.glass.elevatedFill,
							borderWidth: 1,
							borderColor: t.glass.elevatedBorder,
						},
			]}
			onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				onPress();
			}}
		>
			<Text
				style={[
					styles.toggleText,
					{ color: active ? "#FFFFFF" : t.text.primary },
				]}
			>
				{label}
			</Text>
		</Pressable>
	);
}

export function PillToggle({
	options,
	selected,
	onSelect,
	columns,
}: {
	options: string[];
	selected: string;
	onSelect: (val: string) => void;
	/** Lay chips out as an N-column grid instead of a natural wrap. */
	columns?: number;
}) {
	return (
		<View style={styles.toggleRow}>
			{options.map((opt) => (
				<Chip
					key={opt}
					label={opt}
					active={opt === selected}
					onPress={() => onSelect(opt)}
					columns={columns}
				/>
			))}
		</View>
	);
}

export function LabeledPillToggle({
	options,
	selected,
	onSelect,
	columns,
}: {
	options: { label: string; value: string }[];
	selected: string | null;
	onSelect: (val: string) => void;
	/** Lay chips out as an N-column grid instead of a natural wrap. */
	columns?: number;
}) {
	return (
		<View style={styles.toggleRow}>
			{options.map((opt) => (
				<Chip
					key={opt.value}
					label={opt.label}
					active={opt.value === selected}
					onPress={() => onSelect(opt.value)}
					columns={columns}
				/>
			))}
		</View>
	);
}

export function TabBar({
	tabs,
	selected,
	onSelect,
}: {
	tabs: string[];
	selected: string;
	onSelect: (val: string) => void;
}) {
	const t = useRiverTheme();
	return (
		<View
			style={[
				styles.segmentedControl,
				{
					backgroundColor: t.glass.surfaceFill,
					borderColor: t.glass.surfaceBorder,
				},
			]}
		>
			{tabs.map((tab) => {
				const active = tab === selected;
				return (
					<Pressable
						key={tab}
						style={[
							styles.segment,
							active && { backgroundColor: t.accent },
						]}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
							onSelect(tab);
						}}
					>
						<Text
							style={[
								styles.segmentText,
								{
									color: active ? "#FFFFFF" : t.text.secondary,
									fontWeight: active ? "700" : "600",
								},
							]}
						>
							{tab}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	// Every section header is an overline.
	toggleLabel: {
		...typeScale.overline,
		marginBottom: 10,
	},
	toggleRow: {
		flexDirection: "row",
		gap: 8,
		flexWrap: "wrap",
	},
	togglePill: {
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 12,
		minHeight: 36,
		justifyContent: "center",
		alignItems: "center",
	},
	toggleText: {
		fontSize: 13,
		fontWeight: "600",
	},
	// Segmented control: glass container radius 14 / padding 4; the selected
	// segment is an accent fill at radius 10.
	segmentedControl: {
		flexDirection: "row",
		borderRadius: 14,
		borderWidth: 1,
		padding: 4,
	},
	segment: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 8,
		borderRadius: 10,
		minHeight: 34,
	},
	segmentText: {
		fontSize: 13,
	},
});
