import { radius, spacing, typeScale, useRiverTheme } from "@/constants/theme";
import { formatCurrency } from "@/lib/format";
import * as Haptics from "expo-haptics";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import CardPressable from "@/components/CardPressable";

// Fixed thumbnail size based on a 4-card layout so 1–3 card collections
// don't stretch their thumbnails. Math: screen - sheet padding (16*2) -
// card padding (16*2) - 3 gaps of 8 = screen - 88, divided by 4 cards.
const THUMB_WIDTH = (Dimensions.get("window").width - 88) / 4;
// Card art is always TCG ratio (63:88), never cropped.
const THUMB_HEIGHT = THUMB_WIDTH * (88 / 63);

interface CollectionCardProps {
	name: string;
	cardCount: number;
	totalValue: number;
	cardImages: string[];
	onPress?: () => void;
}

export default function CollectionCard({
	name,
	cardCount,
	totalValue,
	cardImages,
	onPress,
}: CollectionCardProps) {
	const t = useRiverTheme();
	const overflow = cardCount - 4;

	return (
		<CardPressable
			onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				onPress?.();
			}}
			style={[
				styles.container,
				{
					backgroundColor: t.glass.surfaceFill,
					borderColor: t.glass.surfaceBorder,
				},
				t.glass.shadow,
			]}
		>
			{/* Header */}
			<View style={styles.header}>
				<View>
					<Text style={[styles.name, { color: t.text.primary }]}>
						{name}
					</Text>
					<Text style={[styles.count, { color: t.text.secondary }]}>
						{cardCount} card{cardCount !== 1 ? "s" : ""}
					</Text>
				</View>
				<View style={{ alignItems: "flex-end" }}>
					<Text style={[styles.valueLabel, { color: t.text.secondary }]}>
						Total value
					</Text>
					<Text style={[styles.value, { color: t.text.primary }]}>
						{formatCurrency(totalValue)}
					</Text>
				</View>
			</View>

			{/* Card Images — staggered fade-up, dealt left to right */}
			{cardImages.length > 0 && (
				<View style={styles.imageRow}>
					{cardImages.slice(0, 4).map((uri, i, shown) => (
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
							{overflow > 0 && i === shown.length - 1 && (
								<View style={styles.overflowBadge}>
									<Text style={styles.overflowText}>+{overflow}</Text>
								</View>
							)}
						</Animated.View>
					))}
				</View>
			)}
		</CardPressable>
	);
}

const styles = StyleSheet.create({
	container: {
		borderRadius: radius.card,
		borderWidth: 1,
		padding: spacing.card,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
	},
	name: {
		...typeScale.cardTitle,
	},
	count: {
		...typeScale.caption,
		marginTop: 2,
	},
	valueLabel: {
		...typeScale.overline,
	},
	value: {
		fontSize: 18,
		fontWeight: "800",
		marginTop: 2,
		fontVariant: ["tabular-nums"],
	},
	imageRow: {
		flexDirection: "row",
		gap: 8,
		marginTop: 12,
	},
	// No overflow clipping here — the "+N" badge hangs past the thumbnail's
	// corner; the image clips itself via its own borderRadius.
	cardImageWrapper: {
		width: THUMB_WIDTH,
		height: THUMB_HEIGHT,
	},
	cardImage: {
		width: "100%",
		height: "100%",
		borderRadius: radius.thumb,
	},
	// Dark count circle pinned to the last thumbnail's corner (same both modes —
	// it always sits on card art, not on the screen background).
	overflowBadge: {
		position: "absolute",
		right: -5,
		bottom: -5,
		minWidth: 26,
		height: 26,
		borderRadius: 13,
		paddingHorizontal: 6,
		backgroundColor: "rgba(8, 24, 38, 0.9)",
		borderWidth: 1,
		borderColor: "rgba(210, 235, 255, 0.18)",
		alignItems: "center",
		justifyContent: "center",
	},
	overflowText: {
		fontSize: 11,
		fontWeight: "700",
		color: "#FFFFFF",
	},
});
