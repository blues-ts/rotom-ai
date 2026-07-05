import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import CardPressable from "@/components/CardPressable";
import { spacing, typeScale, useRiverTheme } from "@/constants/theme";
import { useCollectionSnapshot } from "@/hooks/useCollectionSnapshot";

type Suggestion = {
	icon: SFSymbol;
	label: string;
	prompt: string;
	// Personalized rows get an accent overline above the label ("YOUR TOP CARD").
	overline?: string;
	// Dimmer inline continuation of the label (set name · card number).
	labelSuffix?: string;
};

// Shown until the user owns a card worth analyzing. No "Your top card"
// overline — Bubble Mew isn't their card, it's just a demo prompt.
const FALLBACK_ANALYZE: Suggestion = {
	icon: "chart.line.uptrend.xyaxis",
	label: "Analyze Bubble Mew",
	prompt: "Do a market analysis on Bubble Mew from Paldean Fates",
};

export default function ChatSuggestions({
	onSelect,
	disabled = false,
}: {
	onSelect: (prompt: string) => void;
	disabled?: boolean;
}) {
	const t = useRiverTheme();
	const { data: snapshot } = useCollectionSnapshot();

	// Personalize the analyze row with the user's single most valuable card
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
					overline: "Your top card",
					labelSuffix:
						[topCard.setName, topCard.cardNumber]
							.filter(Boolean)
							.join(" ") || undefined,
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
				prompt: "Which Pokémon cards are good investments right now?",
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
		<Animated.View
			entering={FadeInDown.duration(500).delay(120)}
			style={styles.list}
		>
			{suggestions.map((s) => (
				<CardPressable
					key={s.label}
					onPress={() => handlePress(s.prompt)}
					disabled={disabled}
					accessibilityRole="button"
					accessibilityLabel={s.label}
					hitSlop={4}
					pressScale={0.98}
					baseColor={t.glass.surfaceFill}
					pressedColor={t.glass.pressedFill}
					style={[
						styles.card,
						{
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
							{s.labelSuffix ? (
								<Text style={{ color: t.text.secondary }}>
									{" · "}
									{s.labelSuffix}
								</Text>
							) : null}
						</Text>
					</View>
					<SymbolView
						name="chevron.right"
						size={14}
						tintColor={t.text.tertiary}
						weight="semibold"
					/>
				</CardPressable>
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
