import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useTheme } from "@/context/ThemeContext";

type Suggestion = {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	prompt: string;
};

// Example prompts shown on the empty chat screen. `label` is the short card text;
// `prompt` is what actually gets sent (kept conversational for better answers).
const SUGGESTIONS: Suggestion[] = [
	{
		icon: "stats-chart-outline",
		label: "Collection value",
		prompt: "What's my collection worth right now?",
	},
	{
		icon: "trending-up-outline",
		label: "Analyze Bubble Mew",
		prompt: "Do a market analysis on Bubble Mew from Paldean Fates",
	},
	{
		icon: "sparkles-outline",
		label: "What to invest in",
		prompt: "Which Pokémon cards are good investments right now?",
	},
	{
		icon: "ribbon-outline",
		label: "How to grade cards",
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
	const { colors } = useTheme();

	const handlePress = (prompt: string) => {
		if (disabled) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onSelect(prompt);
	};

	return (
		<Animated.View
			entering={FadeInDown.duration(500).delay(120)}
			style={styles.grid}
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
							backgroundColor: colors.card,
							borderColor: colors.border,
							opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
							transform: [{ scale: pressed ? 0.97 : 1 }],
						},
					]}
				>
					<View
						style={[styles.iconChip, { backgroundColor: `${colors.primary}1F` }]}
					>
						<Ionicons name={s.icon} size={15} color={colors.primary} />
					</View>
					<Text
						style={[styles.cardText, { color: colors.foreground }]}
						numberOfLines={2}
					>
						{s.label}
					</Text>
				</Pressable>
			))}
		</Animated.View>
	);
}

const GAP = 6;

const styles = StyleSheet.create({
	grid: {
		// Stacked + centered: each pill hugs its content instead of stretching
		// edge to edge.
		gap: GAP,
		alignItems: "center",
		paddingHorizontal: 16,
		marginTop: 14,
	},
	card: {
		// Shared fixed width so every pill is the same size (centered by the grid),
		// rather than each hugging its own label width.
		width: 230,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		paddingVertical: 8,
		paddingHorizontal: 14,
	},
	iconChip: {
		width: 28,
		height: 28,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	cardText: {
		fontSize: 13,
		fontWeight: "600",
		lineHeight: 16,
	},
});
