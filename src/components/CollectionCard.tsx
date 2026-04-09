import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import * as Haptics from "expo-haptics";
import {
	Image,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";

interface CollectionCardProps {
	name: string;
	cardCount: number;
	totalValue: number;
	cardImages: string[];
	onAddCards: () => void;
	onMenuPress: () => void;
	onPress?: () => void;
}

function formatPrice(price: number): string {
	return `$${price.toFixed(2)}`;
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

	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.container,
				{ backgroundColor: colors.card, borderColor: colors.border },
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
						{formatPrice(totalValue)}
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
								resizeMode="contain"
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
		</Pressable>
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
		borderRadius: Math.round(80 * 0.05),
		overflow: "hidden",
	},
	cardImage: {
		width: 80,
		height: 112,
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
