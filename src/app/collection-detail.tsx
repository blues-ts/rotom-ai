import { useCallback, useMemo, useState } from "react";
import {
	ActionSheetIOS,
	Alert,
	Dimensions,
	FlatList,
	Keyboard,
	Platform,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import Animated, {
	FadeIn,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/ThemeContext";
import {
	useCollectionCards,
	useCollectionDetail,
	useCollections,
	useRefreshCollectionPrices,
} from "@/hooks/useCollections";
import RefreshingPill from "@/components/RefreshingPill";
import CardImage from "@/components/CardImage";
import ErrorState from "@/components/ErrorState";
import { formatCurrency } from "@/lib/format";
import { CONDITION_LABELS, formatVariantLabel } from "@/lib/scrydex";
import type { CollectionCard } from "@/types/collection";

const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
const screenWidth = Dimensions.get("window").width;
const imageWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const imageHeight = imageWidth * 1.4;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type SortOption = "dateAdded" | "nameAsc" | "valueDesc" | "valueAsc";

const SORT_LABELS: Record<SortOption, string> = {
	valueDesc: "Value (high to low)",
	valueAsc: "Value (low to high)",
	nameAsc: "Name (A–Z)",
	dateAdded: "Date added (newest)",
};

function sortCards(cards: CollectionCard[], by: SortOption): CollectionCard[] {
	const arr = cards.slice();
	switch (by) {
		case "dateAdded":
			return arr.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
		case "nameAsc":
			return arr.sort((a, b) => a.cardName.localeCompare(b.cardName));
		case "valueDesc":
			return arr.sort((a, b) => b.cardValue * b.quantity - a.cardValue * a.quantity);
		case "valueAsc":
			return arr.sort((a, b) => a.cardValue * a.quantity - b.cardValue * b.quantity);
	}
}

function CardPressable({
	children,
	onPress,
}: {
	children: React.ReactNode;
	onPress: () => void;
}) {
	const scale = useSharedValue(1);
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<AnimatedPressable
			style={animatedStyle}
			onPressIn={() => {
				scale.value = withTiming(0.96, { duration: 80 });
			}}
			onPressOut={() => {
				scale.value = withTiming(1, { duration: 120 });
			}}
			onPress={onPress}
		>
			{children}
		</AnimatedPressable>
	);
}

export default function CollectionDetail() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { colors, theme } = useTheme();
	const { renameCollection } = useCollections();
	const refreshPrices = useRefreshCollectionPrices();
	const {
		data: collection,
		isError: collectionError,
		refetch: refetchCollection,
	} = useCollectionDetail(id);
	const {
		data: cards,
		isLoading: cardsLoading,
		isError: cardsError,
		refetch: refetchCards,
	} = useCollectionCards(id);
	const [filterQuery, setFilterQuery] = useState("");
	const [sortBy, setSortBy] = useState<SortOption>("valueDesc");

	const sortScale = useSharedValue(1);
	const sortAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: sortScale.value }],
	}));

	const filteredCards = useMemo(() => {
		if (!cards) return [];
		const sorted = sortCards(cards, sortBy);
		const q = filterQuery.trim().toLowerCase();
		if (!q) return sorted;
		return sorted.filter((c) => {
			const isGraded = c.pricingType === "Graded";
			const haystack = [
				c.cardName,
				c.cardNumber ?? "",
				c.setName ?? "",
				c.pricingType,
				c.productType === "sealed" ? "sealed" : "",
				formatVariantLabel(c.variant),
				c.condition,
				CONDITION_LABELS[c.condition] ?? "",
				isGraded ? (c.gradedCompany ?? "") : "",
				isGraded ? (c.gradedGrade ?? "") : "",
				isGraded && c.gradedCompany && c.gradedGrade
					? `${c.gradedCompany} ${c.gradedGrade}`
					: "",
			]
				.join(" ")
				.toLowerCase()
				.replace(/_/g, " ");
			return haystack.includes(q);
		});
	}, [cards, filterQuery, sortBy]);

	const handleRename = useCallback(() => {
		if (!collection) return;
		Alert.prompt(
			"Rename Collection",
			"Enter a new name for this collection",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Save",
					onPress: (name: string | undefined) => {
						if (name?.trim()) {
							renameCollection.mutate({ id, name: name.trim() });
						}
					},
				},
			],
			"plain-text",
			collection.name,
		);
	}, [collection, id, renameCollection]);

	const renderItem = useCallback(
		({ item, index }: { item: CollectionCard; index: number }) => (
			<Animated.View
				entering={FadeIn.delay(Math.min(index * 30, 300)).duration(200)}
			>
				<CardPressable
					onPress={() => {
						Keyboard.dismiss();
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						if (item.productType === "sealed") {
							router.push({
								pathname: "/(sealed)/[id]",
								params: {
									id: item.cardId,
									name: item.cardName,
									variant: item.variant,
									collectionId: item.collectionId,
									quantity: String(item.quantity),
									pricePaid:
										item.pricePaid !== undefined
											? String(item.pricePaid)
											: "",
								},
							});
							return;
						}
						router.push({
							pathname: "/(card)/[id]",
							params: {
								id: item.cardId,
								name: item.cardName,
								pricingType: item.pricingType,
								variant: item.variant,
								condition: item.condition,
								gradedCompany: item.gradedCompany ?? "",
								gradedGrade: item.gradedGrade ?? "",
								collectionId: item.collectionId,
								quantity: String(item.quantity),
								pricePaid:
									item.pricePaid !== undefined
										? String(item.pricePaid)
										: "",
							},
						});
					}}
				>
					<View style={styles.cardCell}>
						{/* Info panel rendered first so the image overlays its top edge */}
						<View
							style={[
								styles.infoPanel,
								{
									backgroundColor: colors.card,
									borderColor: colors.border,
								},
							]}
						>
							<Text
								style={[styles.infoName, { color: colors.foreground }]}
								numberOfLines={1}
							>
								{item.cardName}
							</Text>
							{/* Middle line always renders so card and sealed tiles
							    keep identical heights. */}
							<Text
								style={[
									styles.infoNumber,
									{ color: colors.primary },
								]}
								numberOfLines={1}
							>
								{item.productType === "sealed"
									? item.setName || " "
									: item.cardNumber
										? `#${item.cardNumber}`
										: " "}
							</Text>
							<View style={styles.infoValueRow}>
								<Text
									style={[
										styles.infoValue,
										{ color: colors.foreground },
									]}
									numberOfLines={1}
								>
									{formatCurrency(item.cardValue)}
								</Text>
								<Text
									style={[
										styles.infoCondition,
										{ color: colors.primary },
									]}
									numberOfLines={1}
								>
									{item.productType === "sealed"
										? "Sealed"
										: item.pricingType === "Graded" &&
											  item.gradedCompany &&
											  item.gradedGrade
											? `${item.gradedCompany} ${item.gradedGrade}`
											: item.condition}
									{item.quantity > 1 ? ` ×${item.quantity}` : ""}
								</Text>
							</View>
						</View>

						{/* Image overlaid on top, kept fully rounded so its bottom curve sits on the info card */}
						{item.cardImageUrl && item.productType === "sealed" ? (
							// Sealed art comes in arbitrary aspect ratios — inset it on the
							// tile background so the tile keeps the same card silhouette.
							<View
								style={[
									styles.cardImage,
									styles.sealedTile,
									{ backgroundColor: colors.card },
								]}
							>
								<CardImage
									uri={item.cardImageUrl}
									style={styles.sealedImage}
									backgroundColor="transparent"
									shimmerColor={colors.border}
								/>
							</View>
						) : item.cardImageUrl ? (
							<CardImage
								uri={item.cardImageUrl}
								style={styles.cardImage}
								backgroundColor={colors.card}
								shimmerColor={colors.border}
							/>
						) : (
							<View
								style={[
									styles.cardImage,
									styles.placeholder,
									{ backgroundColor: colors.card },
								]}
							>
								<Ionicons
									name="image-outline"
									size={24}
									color={colors.mutedForeground}
								/>
							</View>
						)}
					</View>
				</CardPressable>
			</Animated.View>
		),
		[colors],
	);

	return (
		<>
			<Stack.Screen
				options={{
					headerShown: true,
					headerTitle: collection?.name ?? "",
					headerBackButtonDisplayMode: "minimal",
					headerStyle: { backgroundColor: colors.background },
					headerTintColor: colors.foreground,
					headerShadowVisible: false,
					headerRight: () => (
						<View style={styles.headerRight}>
							<Pressable
								onPress={() => {
									Haptics.impactAsync(
										Haptics.ImpactFeedbackStyle.Light,
									);
									handleRename();
								}}
								style={styles.headerButton}
							>
								<Ionicons
									name="pencil-outline"
									size={20}
									color={colors.foreground}
								/>
							</Pressable>
							<Pressable
								onPress={() => {
									Haptics.impactAsync(
										Haptics.ImpactFeedbackStyle.Light,
									);
									router.push("/(search)");
								}}
								style={styles.headerButton}
							>
								<Ionicons
									name="add"
									size={26}
									color={colors.foreground}
								/>
							</Pressable>
						</View>
					),
				}}
			/>

			<View style={[styles.container, { backgroundColor: colors.background }]}>
				<RefreshingPill visible={refreshPrices.isPending} />
				{/* Filter bar */}
				<View style={styles.filterContainer}>
					<View
						style={[
							styles.filterBar,
							styles.filterBarFlex,
							{
								backgroundColor: colors.card,
								borderColor: colors.border,
							},
						]}
					>
						<Ionicons
							name="search"
							size={18}
							color={colors.mutedForeground}
						/>
						<TextInput
							style={[styles.filterInput, { color: colors.foreground }]}
							placeholder="Search cards..."
							placeholderTextColor={colors.mutedForeground}
							value={filterQuery}
							onChangeText={setFilterQuery}
							returnKeyType="search"
						/>
						{filterQuery.length > 0 && (
							<Pressable
								onPress={() => setFilterQuery("")}
								hitSlop={8}
							>
								<Ionicons
									name="close-circle"
									size={18}
									color={colors.mutedForeground}
								/>
							</Pressable>
						)}
					</View>
					<AnimatedPressable
						onPressIn={() => {
							sortScale.value = withTiming(0.9, { duration: 80 });
						}}
						onPressOut={() => {
							sortScale.value = withTiming(1, { duration: 140 });
						}}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							if (Platform.OS !== "ios") return;
							const opts = Object.keys(SORT_LABELS) as SortOption[];
							ActionSheetIOS.showActionSheetWithOptions(
								{
									title: "Sort by",
									options: [
										...opts.map((o) =>
											sortBy === o ? `✓  ${SORT_LABELS[o]}` : SORT_LABELS[o],
										),
										"Cancel",
									],
									cancelButtonIndex: opts.length,
									userInterfaceStyle: theme === "dark" ? "dark" : "light",
								},
								(idx) => {
									if (idx < opts.length) setSortBy(opts[idx]);
								},
							);
						}}
						style={[
							styles.sortButton,
							{
								backgroundColor: colors.card,
								borderColor: colors.border,
							},
							sortAnimatedStyle,
						]}
					>
						<Ionicons
							name="swap-vertical"
							size={20}
							color={colors.primary}
						/>
					</AnimatedPressable>
				</View>

				{/* Summary row */}
				{collection && (
					<View style={styles.summaryRow}>
						<View>
							<Text
								style={[
									styles.summaryLabel,
									{ color: colors.mutedForeground },
								]}
							>
								Collection value
							</Text>
							<Text
								style={[
									styles.summaryValue,
									{ color: colors.foreground },
								]}
							>
								{formatCurrency(collection.totalValue)}
							</Text>
						</View>
						<View style={styles.summaryRight}>
							<Text
								style={[
									styles.summaryLabel,
									{ color: colors.mutedForeground },
								]}
							>
								Cards
							</Text>
							<Text
								style={[
									styles.summaryValue,
									{ color: colors.foreground },
								]}
							>
								{collection.cardCount}
							</Text>
						</View>
					</View>
				)}

				{/* Card grid or empty state */}
				{collectionError || cardsError ? (
					<ErrorState
						title="Couldn't load collection"
						message="Something went wrong reading this collection."
						onRetry={() => {
							refetchCollection();
							refetchCards();
						}}
					/>
				) : filteredCards.length > 0 ? (
					<FlatList
						data={filteredCards}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={renderItem}
						contentContainerStyle={styles.grid}
						columnWrapperStyle={styles.row}
						showsVerticalScrollIndicator={false}
						keyboardDismissMode="on-drag"
						keyboardShouldPersistTaps="handled"
						refreshControl={
							<RefreshControl
								refreshing={refreshPrices.isPending}
								onRefresh={() => refreshPrices.mutate(id)}
								tintColor={colors.mutedForeground}
							/>
						}
					/>
				) : filterQuery.trim().length > 0 ? (
					<View style={styles.emptyStateCentered}>
						<Ionicons
							name="search-outline"
							size={48}
							color={colors.mutedForeground}
						/>
						<Text
							style={[
								styles.emptyTitle,
								{ color: colors.foreground },
							]}
						>
							No matching cards
						</Text>
					</View>
				) : cardsLoading ? null : (
					<View style={styles.emptyState}>
						<Ionicons
							name="folder-open-outline"
							size={48}
							color={colors.mutedForeground}
						/>
						<Text
							style={[
								styles.emptyTitle,
								{ color: colors.foreground },
							]}
						>
							No Cards Yet
						</Text>
						<Text
							style={[
								styles.emptySubtitle,
								{ color: colors.mutedForeground },
							]}
						>
							Tap + to search and add cards to this collection
						</Text>
					</View>
				)}
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	headerRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	headerButton: {
		padding: 8,
	},
	filterContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 12,
	},
	filterBar: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 10,
		borderWidth: 1,
		paddingHorizontal: 12,
		height: 40,
		gap: 8,
	},
	filterBarFlex: {
		flex: 1,
	},
	sortButton: {
		width: 40,
		height: 40,
		borderRadius: 10,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	filterInput: {
		flex: 1,
		fontSize: 15,
		height: 40,
	},
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingBottom: 12,
	},
	summaryRight: {
		alignItems: "flex-end",
	},
	summaryLabel: {
		fontSize: 13,
		marginBottom: 2,
	},
	summaryValue: {
		fontSize: 22,
		fontWeight: "700",
	},
	grid: {
		padding: PADDING,
		paddingBottom: 40,
	},
	row: {
		gap: GAP,
		marginBottom: GAP,
	},
	cardCell: {
		width: imageWidth,
		position: "relative",
	},
	cardImage: {
		position: "absolute",
		top: 0,
		left: 0,
		width: imageWidth,
		height: imageHeight,
		borderRadius: 8,
	},
	placeholder: {
		alignItems: "center",
		justifyContent: "center",
	},
	sealedTile: {
		padding: 10,
	},
	sealedImage: {
		flex: 1,
		borderRadius: 4,
	},
	infoPanel: {
		// Push the info card down so the image (positioned absolutely at top:0)
		// overlays its top edge by INFO_OVERLAP pixels. Content padding pushes
		// the text below the image bottom; the BG/rounded corners peek out for
		// the smooth "card-behind-card" transition.
		marginTop: imageHeight - 12,
		paddingHorizontal: 6,
		paddingTop: 12 + 4,
		paddingBottom: 6,
		gap: 1,
		borderRadius: 8,
		borderWidth: StyleSheet.hairlineWidth,
	},
	infoName: {
		fontSize: 11,
		fontWeight: "700",
	},
	infoNumber: {
		fontSize: 9,
		fontWeight: "500",
	},
	infoValueRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
		marginTop: 2,
		gap: 4,
	},
	infoValue: {
		fontSize: 12,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
		flexShrink: 1,
	},
	infoCondition: {
		fontSize: 9,
		fontWeight: "600",
		flexShrink: 0,
	},
	emptyState: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
		gap: 10,
	},
	emptyStateCentered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
		gap: 10,
		paddingBottom: 120,
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: "700",
		marginTop: 8,
	},
	emptySubtitle: {
		fontSize: 15,
		textAlign: "center",
		lineHeight: 21,
	},
});
