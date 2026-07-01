import { useTheme } from "@/context/ThemeContext";
import { formatCurrency } from "@/lib/format";
import * as Haptics from "expo-haptics";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import CardPressable from "@/components/CardPressable";

// Fixed thumbnail size based on a 4-card layout so 1–3 card collections
// don't stretch their thumbnails. Math: screen - list padding (16*2) -
// card padding (16*2) - 3 gaps of 8 = screen - 88, divided by 4 cards.
const THUMB_WIDTH = (Dimensions.get("window").width - 88) / 4;
const THUMB_HEIGHT = THUMB_WIDTH * (112 / 80);

interface CollectionCardProps {
	name: string;
	cardCount: number;
	totalValue: number;
	cardImages: string[];
	onPress?: () => void;
	// Override when the card sits on a `card`-colored surface (e.g. the
	// collections sheet) where its default background would blend in.
	backgroundColor?: string;
}

export default function CollectionCard({
	name,
	cardCount,
	totalValue,
	cardImages,
	onPress,
	backgroundColor,
}: CollectionCardProps) {
	const { colors } = useTheme();

	return (
		<CardPressable
			onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				onPress?.();
			}}
			style={[
				styles.container,
				{ backgroundColor: backgroundColor ?? colors.card },
			]}
		>
			{/* Header */}
			<View style={styles.header}>
				<View>
					<Text style={[styles.name, { color: colors.foreground }]}>
						{name}
					</Text>
					<Text style={[styles.count, { color: colors.mutedForeground }]}>
						{cardCount} card{cardCount !== 1 ? "s" : ""}
					</Text>
				</View>
				<View style={{ alignItems: "flex-end" }}>
					<Text style={[styles.valueLabel, { color: colors.mutedForeground }]}>
						Total value
					</Text>
					<Text style={[styles.value, { color: colors.foreground }]}>
						{formatCurrency(totalValue)}
					</Text>
				</View>
			</View>

			{/* Card Images — staggered fade-up, dealt left to right */}
			{cardImages.length > 0 && (
				<View style={[styles.imageScroll, styles.imageRow]}>
					{cardImages.slice(0, 4).map((uri, i) => (
						<Animated.View
							// Index-qualified: a collection can hold the same card in two
							// variants/conditions, so image URLs aren't unique → a bare
							// `key={uri}` collides and crashes the list.
							key={`${uri}-${i}`}
							entering={FadeInDown.delay(i * 70).duration(360)}
							style={styles.cardImageWrapper}
						>
							<Image
								source={{ uri }}
								style={styles.cardImage}
								contentFit="contain"
							/>
						</Animated.View>
					))}
				</View>
			)}

		</CardPressable>
	);
}

const styles = StyleSheet.create({
	container: {
		borderRadius: 12,
		padding: 16,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
	},
	name: {
		fontSize: 17,
		fontWeight: "700",
	},
	count: {
		fontSize: 13,
		marginTop: 2,
	},
	valueLabel: {
		fontSize: 12,
	},
	value: {
		fontSize: 17,
		fontWeight: "700",
		marginTop: 2,
	},
	imageScroll: {
		marginTop: 12,
	},
	imageRow: {
		flexDirection: "row",
		gap: 8,
	},
	cardImageWrapper: {
		width: THUMB_WIDTH,
		height: THUMB_HEIGHT,
		borderRadius: 4,
		overflow: "hidden",
	},
	cardImage: {
		width: "100%",
		height: "100%",
	},
});
