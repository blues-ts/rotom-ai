import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { formatCurrency } from "@/lib/format";
import * as Haptics from "expo-haptics";
import {
	Dimensions,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Image } from "expo-image";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
	onAddCards: () => void;
	onMenuPress: () => void;
	onPress?: () => void;
}


export default function CollectionCard({
	name,
	cardCount,
	totalValue,
	cardImages,
	onAddCards,
	onMenuPress,
	onPress,
}: CollectionCardProps) {
	const { colors } = useTheme();
	const scale = useSharedValue(1);
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<AnimatedPressable
			onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				onPress?.();
			}}
			onPressIn={() => {
				scale.value = withTiming(0.97, { duration: 80 });
			}}
			onPressOut={() => {
				scale.value = withTiming(1, { duration: 120 });
			}}
			style={[
				styles.container,
				{ backgroundColor: colors.card, borderColor: colors.border },
				animatedStyle,
			]}
		>
			{/* Header */}
			<View style={styles.header}>
				<View>
					<Text style={[styles.name, { color: colors.foreground }]}>
						{name}
					</Text>
					<Text
						style={[styles.count, { color: colors.mutedForeground }]}
					>
						{cardCount} card{cardCount !== 1 ? "s" : ""}
					</Text>
				</View>
				<View style={{ alignItems: "flex-end" }}>
					<Text
						style={[
							styles.valueLabel,
							{ color: colors.mutedForeground },
						]}
					>
						Total value
					</Text>
					<Text style={[styles.value, { color: colors.foreground }]}>
						{formatCurrency(totalValue)}
					</Text>
				</View>
			</View>

			{/* Card Images */}
			{cardImages.length > 0 && (
				<View style={[styles.imageScroll, styles.imageRow]}>
					{cardImages.slice(0, 4).map((uri, i) => (
						<View key={i} style={styles.cardImageWrapper}>
							<Image
								source={{ uri }}
								style={styles.cardImage}
								contentFit="contain"
							/>
						</View>
					))}
				</View>
			)}

			{/* Footer */}
			<View style={styles.footer}>
				<Pressable
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						onAddCards();
					}}
					style={({ pressed }) => [
						styles.addButton,
						{
							borderColor: pressed ? colors.primary : colors.border,
							backgroundColor: pressed ? colors.primary + "15" : "transparent",
						},
					]}
				>
					<Ionicons name="add" size={16} color={colors.foreground} />
					<Text
						style={[
							styles.addButtonText,
							{ color: colors.foreground },
						]}
					>
						Add cards
					</Text>
				</Pressable>
				<Pressable onPress={onMenuPress} style={styles.menuButton}>
					<Ionicons
						name="ellipsis-horizontal"
						size={20}
						color={colors.mutedForeground}
					/>
				</Pressable>
			</View>
		</AnimatedPressable>
	);
}

const styles = StyleSheet.create({
	container: {
		borderRadius: 12,
		borderWidth: 1,
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
	footer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: 12,
	},
	addButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderWidth: 1,
		borderRadius: 20,
		paddingHorizontal: 14,
		paddingVertical: 8,
		flex: 1,
		justifyContent: "center",
		marginRight: 10,
	},
	addButtonText: {
		fontSize: 14,
		fontWeight: "600",
	},
	menuButton: {
		padding: 8,
	},
});
