import { useMemo } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import CardPressable from "@/components/CardPressable";
import { spacing, useRiverTheme } from "@/constants/theme";
import { useCollectionSnapshot } from "@/hooks/useCollectionSnapshot";

type Suggestion = {
	icon: SFSymbol;
	label: string;
	prompt: string;
};

// Shown until the user owns a card worth analyzing — Bubble Mew isn't their
// card, it's just a demo prompt.
const FALLBACK_ANALYZE: Suggestion = {
	icon: "chart.line.uptrend.xyaxis",
	label: "Analyze Bubble Mew",
	prompt: "Do a market analysis on Bubble Mew from Paldean Fates",
};

/**
 * Horizontal carousel of compact prompt chips, shown above the chat input
 * while the conversation is empty.
 */
export default function ChatSuggestions({
	onSelect,
	disabled = false,
}: {
	onSelect: (prompt: string) => void;
	disabled?: boolean;
}) {
	const t = useRiverTheme();
	const { data: snapshot } = useCollectionSnapshot();

	// Personalize the analyze chip with the user's single most valuable card
	// across all collections. snapshot.topCards is sorted by line value
	// (value × qty), so re-rank by unit value and skip sealed product.
	const suggestions = useMemo<Suggestion[]>(() => {
		const topCard = snapshot?.topCards
			.filter((c) => c.productType !== "sealed")
			.reduce<(typeof snapshot.topCards)[number] | undefined>(
				(best, c) => (!best || c.value > best.value ? c : best),
				undefined,
			);
		const analyze: Suggestion = topCard
			? {
					icon: "chart.line.uptrend.xyaxis",
					label: `Analyze ${topCard.name}`,
					prompt: `Do a market analysis on ${topCard.name}${topCard.cardNumber ? ` ${topCard.cardNumber}` : ""}${topCard.setName ? ` from ${topCard.setName}` : ""} in my collection`,
				}
			: FALLBACK_ANALYZE;
		return [
			analyze,
			{
				icon: "chart.bar",
				label: "What's my collection worth?",
				prompt: "What's my collection worth right now?",
			},
			{
				icon: "sparkles",
				label: "What should I invest in?",
				prompt: "Which cards are good investments right now?",
			},
			{
				icon: "rosette",
				label: "How does grading work?",
				prompt: "How does card grading work and is it worth it?",
			},
		];
	}, [snapshot]);

	const handlePress = (prompt: string) => {
		if (disabled) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onSelect(prompt);
	};

	return (
		<Animated.View entering={FadeInDown.duration(500).delay(120)}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.row}
			>
				{suggestions.map((s) => (
					<CardPressable
						key={s.label}
						onPress={() => handlePress(s.prompt)}
						disabled={disabled}
						accessibilityRole="button"
						accessibilityLabel={s.label}
						hitSlop={4}
						pressScale={0.97}
						baseColor={t.glass.surfaceFill}
						pressedColor={t.glass.pressedFill}
						style={[
							styles.chip,
							{
								borderColor: t.glass.surfaceBorder,
								opacity: disabled ? 0.5 : 1,
							},
							t.glass.shadow,
						]}
					>
						<SymbolView
							name={s.icon}
							size={17}
							tintColor={t.accentOn}
							weight="medium"
						/>
						<Text
							style={[styles.label, { color: t.text.primary }]}
							numberOfLines={2}
						>
							{s.label}
						</Text>
					</CardPressable>
				))}
			</ScrollView>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	row: {
		paddingHorizontal: spacing.screen,
		gap: 8,
	},
	// Card-style chip: icon on top, label wrapping to two lines below. No
	// height set — the ScrollView row stretches every card to the tallest,
	// so one-line labels get the same height as two-line ones.
	chip: {
		width: 168,
		gap: 8,
		borderRadius: 16,
		borderWidth: 1,
		paddingVertical: 12,
		paddingHorizontal: 14,
	},
	label: {
		fontSize: 14,
		fontWeight: "600",
		lineHeight: 19,
	},
});
