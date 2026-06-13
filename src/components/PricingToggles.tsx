import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { ThemeColors } from "@/constants/colors";

/**
 * Pill-style selection controls shared by the card-detail configure sheet (and
 * available to any future screen). Extracted from the old inline "Pricing
 * Options" card so the toggles live in one place.
 */

export function ToggleLabel({
	children,
	colors,
	style,
}: {
	children: React.ReactNode;
	colors: ThemeColors;
	style?: any;
}) {
	return (
		<Text style={[styles.toggleLabel, { color: colors.mutedForeground }, style]}>
			{children}
		</Text>
	);
}

export function PillToggle({
	options,
	selected,
	onSelect,
	colors,
}: {
	options: string[];
	selected: string;
	onSelect: (val: string) => void;
	colors: ThemeColors;
}) {
	return (
		<View style={styles.toggleRow}>
			{options.map((opt) => {
				const active = opt === selected;
				return (
					<Pressable
						key={opt}
						hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
						style={[
							styles.togglePill,
							{ backgroundColor: active ? colors.primary : colors.border },
						]}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							onSelect(opt);
						}}
					>
						<Text
							style={[
								styles.toggleText,
								{
									color: active
										? colors.primaryForeground
										: colors.foreground,
									opacity: active ? 1 : 0.75,
								},
							]}
						>
							{opt}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

export function LabeledPillToggle({
	options,
	selected,
	onSelect,
	colors,
}: {
	options: { label: string; value: string }[];
	selected: string | null;
	onSelect: (val: string) => void;
	colors: ThemeColors;
}) {
	return (
		<View style={[styles.toggleRow, { flexWrap: "wrap" }]}>
			{options.map((opt) => {
				const active = opt.value === selected;
				return (
					<Pressable
						key={opt.value}
						hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
						style={[
							styles.togglePill,
							{ backgroundColor: active ? colors.primary : colors.border },
						]}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							onSelect(opt.value);
						}}
					>
						<Text
							style={[
								styles.toggleText,
								{
									color: active
										? colors.primaryForeground
										: colors.foreground,
									opacity: active ? 1 : 0.75,
								},
							]}
						>
							{opt.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

export function TabBar({
	tabs,
	selected,
	onSelect,
	colors,
}: {
	tabs: string[];
	selected: string;
	onSelect: (val: string) => void;
	colors: ThemeColors;
}) {
	return (
		<View style={[styles.segmentedControl, { backgroundColor: colors.border }]}>
			{tabs.map((tab) => {
				const active = tab === selected;
				return (
					<Pressable
						key={tab}
						style={[
							styles.segment,
							active && {
								backgroundColor: colors.primary,
								shadowColor: "#000",
								shadowOpacity: 0.2,
								shadowRadius: 3,
								shadowOffset: { width: 0, height: 1 },
								elevation: 2,
							},
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
									color: active
										? colors.primaryForeground
										: colors.foreground,
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
	toggleLabel: {
		fontSize: 11,
		fontWeight: "600",
		letterSpacing: 0.5,
		textTransform: "uppercase",
		marginBottom: 8,
	},
	toggleRow: {
		flexDirection: "row",
		gap: 8,
		flexWrap: "wrap",
	},
	togglePill: {
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 10,
		minHeight: 36,
		justifyContent: "center",
	},
	toggleText: {
		fontSize: 13,
		fontWeight: "600",
	},
	segmentedControl: {
		flexDirection: "row",
		borderRadius: 10,
		padding: 3,
	},
	segment: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 8,
		borderRadius: 8,
		minHeight: 34,
	},
	segmentText: {
		fontSize: 13,
	},
});
