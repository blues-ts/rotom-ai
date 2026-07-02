import { Pressable, StyleSheet, Text, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { spacing, typeScale, useRiverTheme } from "@/constants/theme";

type Suggestion = {
	icon: SFSymbol;
	label: string;
	prompt: string;
	// Personalized rows get an accent overline above the label ("YOUR TOP CARD").
	overline?: string;
};

// Example prompts shown on the empty chat screen. `label` is the short card text;
// `prompt` is what actually gets sent (kept conversational for better answers).
const SUGGESTIONS: Suggestion[] = [
	{
		icon: "chart.bar",
		label: "What's my collection worth?",
		prompt: "What's my collection worth right now?",
	},
	{
		icon: "chart.line.uptrend.xyaxis",
		label: "Analyze Bubble Mew",
		prompt: "Do a market analysis on Bubble Mew from Paldean Fates",
		overline: "Your top card",
	},
	{
		icon: "sparkles",
		label: "What should I invest in?",
		prompt: "Which Pokémon cards are good investments right now?",
	},
	{
		icon: "rosette",
		label: "How does grading work?",
		prompt: "How does card grading work and is it worth it?",
	},
];

export default function ChatSuggestions({
	onSelect,
	disabled = false,
}: {
	onSelect: (prompt: string) => void;
	disabled?: boolean;
}) {
	const t = useRiverTheme();

	const handlePress = (prompt: string) => {
		if (disabled) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onSelect(prompt);
	};

	return (
		<Animated.View
			entering={FadeInDown.duration(500).delay(120)}
			style={styles.list}
		>
			{SUGGESTIONS.map((s) => (
				<Pressable
					key={s.label}
					onPress={() => handlePress(s.prompt)}
					disabled={disabled}
					accessibilityRole="button"
					accessibilityLabel={s.label}
					hitSlop={4}
					style={({ pressed }) => [
						styles.card,
						{
							backgroundColor: pressed
								? t.glass.pressedFill
								: t.glass.surfaceFill,
							borderColor: t.glass.surfaceBorder,
							opacity: disabled ? 0.5 : 1,
						},
						t.glass.shadow,
					]}
				>
					<View
						style={[styles.iconChip, { backgroundColor: t.accentIconFill }]}
					>
						<SymbolView
							name={s.icon}
							size={18}
							tintColor={t.accentOn}
							weight="medium"
						/>
					</View>
					<View style={styles.labelBlock}>
						{s.overline ? (
							<Text style={[styles.overline, { color: t.accentOn }]}>
								{s.overline}
							</Text>
						) : null}
						<Text
							style={[styles.label, { color: t.text.primary }]}
							numberOfLines={1}
						>
							{s.label}
						</Text>
					</View>
					<SymbolView
						name="chevron.right"
						size={14}
						tintColor={t.text.tertiary}
						weight="semibold"
					/>
				</Pressable>
			))}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	list: {
		alignSelf: "stretch",
		paddingHorizontal: spacing.screen,
		gap: 12,
		marginTop: 30,
	},
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 18,
		borderWidth: 1,
		paddingVertical: 13,
		paddingHorizontal: 14,
	},
	iconChip: {
		width: 34,
		height: 34,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	labelBlock: {
		flex: 1,
		gap: 2,
	},
	overline: {
		...typeScale.overline,
	},
	label: {
		...typeScale.body,
	},
});
