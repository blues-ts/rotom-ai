import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Alert,
	Dimensions,
	FlatList,
	Keyboard,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	FadeInDown,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { usePrefetchDetail } from "@/hooks/usePrefetchDetail";
import {
	useCollectionCards,
	useCollectionDetail,
	useCollections,
	useRefreshCollectionPrices,
} from "@/hooks/useCollections";
import RefreshingPill from "@/components/RefreshingPill";
import CardImage from "@/components/CardImage";
import CardPressable from "@/components/CardPressable";
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

const SKELETON_DATA = Array.from({ length: 9 }, (_, i) => ({
	id: `skeleton-${i}`,
}));

function SkeletonBlock({
	width,
	height,
	color,
	style,
}: {
	width: number | string;
	height: number;
	color: string;
	style?: object;
}) {
	const opacity = useSharedValue(0.3);

	useEffect(() => {
		opacity.value = withRepeat(
			withSequence(
				withTiming(0.7, { duration: 800 }),
				withTiming(0.3, { duration: 800 }),
			),
			-1,
		);
	}, []);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
	}));

	return (
		<Animated.View
			style={[
				{ width, height, backgroundColor: color, borderRadius: 8 },
				animatedStyle,
				style,
			]}
		/>
	);
}

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
			return arr.sort(
				(a, b) => b.cardValue * b.quantity - a.cardValue * a.quantity,
			);
		case "valueAsc":
			return arr.sort(
				(a, b) => a.cardValue * a.quantity - b.cardValue * b.quantity,
			);
	}
}

export default function CollectionDetail() {
	const {
		id,
		name: nameParam,
		totalValue: totalValueParam,
		cardCount: cardCountParam,
	} = useLocalSearchParams<{
		id: string;
		name?: string;
		totalValue?: string;
		cardCount?: string;
	}>();
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const prefetchDetail = usePrefetchDetail();
	// Explicit header offset: contentInsetAdjustmentBehavior applies its inset
	// a frame after mount, which made the summary jump down on remounts.
	const topPadding = insets.top + 52;
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

	// Tracks items that have already played their entrance animation. FlatList
	// recycles cells (unmount/remount) while scrolling and an `entering` animation
	// re-fires on every mount — so without this guard the fade-up would replay on
	// every scroll-back and jank the grid. Each item animates once, on its genuine
	// first appearance. Cleared when the dataset changes (sort/filter) so a fresh
	// list animates in again.
	const animatedIdsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		animatedIdsRef.current = new Set();
	}, [filterQuery, sortBy]);

	// Banner values: query data when present, falling back to route params so
	// the banner renders fully populated on the very first frame (same
	// params-first pattern as the set-detail banner, which never flickers).
	const bannerValue =
		collection?.totalValue ??
		(totalValueParam !== undefined ? Number(totalValueParam) : undefined);
	const bannerCount =
		collection?.cardCount ??
		(cardCountParam !== undefined ? Number(cardCountParam) : undefined);
	const hasBannerData = bannerValue !== undefined && bannerCount !== undefined;

	const summaryHeader = hasBannerData ? (
		<View style={styles.summaryRow}>
			<View>
				<Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
					Collection value
				</Text>
				<Text style={[styles.summaryValue, { color: colors.foreground }]}>
					{formatCurrency(bannerValue!)}
				</Text>
			</View>
			<View style={styles.summaryRight}>
				<Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
					Cards
				</Text>
				<Text style={[styles.summaryValue, { color: colors.foreground }]}>
					{bannerCount}
				</Text>
			</View>
		</View>
	) : null;

	// Banner placeholder while the collection metadata loads
	const summarySkeleton = (
		<View style={styles.summaryRow}>
			<View>
				<SkeletonBlock width={110} height={13} color={colors.border} />
				<SkeletonBlock
					width={90}
					height={22}
					color={colors.border}
					style={{ marginTop: 4 }}
				/>
			</View>
			<View style={styles.summaryRight}>
				<SkeletonBlock width={44} height={13} color={colors.border} />
				<SkeletonBlock
					width={36}
					height={22}
					color={colors.border}
					style={{ marginTop: 4 }}
				/>
			</View>
		</View>
	);

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
		({ item, index }: { item: CollectionCard; index: number }) => {
			// Fade-up only on an item's first appearance; recycled cells get no
			// `entering`, so scrolling back never replays the animation — same feel
			// as the set tiles and set-detail cards.
			const firstAppearance = !animatedIdsRef.current.has(item.id);
			if (firstAppearance) animatedIdsRef.current.add(item.id);
			return (
				<Animated.View
					entering={
						firstAppearance
							? FadeInDown.delay(Math.min(index * 22, 200)).duration(240)
							: undefined
					}
				>
				<CardPressable
					onPress={() => {
						Keyboard.dismiss();
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						prefetchDetail(
							item.productType === "sealed" ? "sealed" : "card",
							item.cardId,
						);
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
										item.pricePaid !== undefined ? String(item.pricePaid) : "",
								},
							});
							return;
						}
						router.push({
							pathname: "/(card)/[id]",
							params: {
								id: item.cardId,
								name: item.cardName,
								// Cached thumbnail — shows instantly while the full card
								// loads, and is the only image for non-Pro (catalog card
								// carries no large art).
								...(item.cardImageUrl ? { image: item.cardImageUrl } : {}),
								pricingType: item.pricingType,
								variant: item.variant,
								condition: item.condition,
								gradedCompany: item.gradedCompany ?? "",
								gradedGrade: item.gradedGrade ?? "",
								collectionId: item.collectionId,
								quantity: String(item.quantity),
								pricePaid:
									item.pricePaid !== undefined ? String(item.pricePaid) : "",
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
								style={[styles.infoNumber, { color: colors.primary }]}
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
									style={[styles.infoValue, { color: colors.foreground }]}
									numberOfLines={1}
								>
									{formatCurrency(item.cardValue)}
								</Text>
								<Text
									style={[styles.infoCondition, { color: colors.primary }]}
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
			);
		},
		[colors, prefetchDetail],
	);

	return (
		<>
			<Stack.Screen
				options={{
					// Static title from a route param + no inline headerStyle —
					// matches set-detail's transparent header exactly so content
					// layout is stable on mount (no pop).
					headerTitle: nameParam ?? collection?.name ?? "",
					headerBackButtonDisplayMode: "minimal",
					headerRight: () => (
						<View style={styles.headerRight}>
							<Pressable
								onPress={() => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									router.push("/(search)");
								}}
								style={styles.headerButton}
							>
								<Ionicons name="add" size={26} color={colors.foreground} />
							</Pressable>
						</View>
					),
				}}
			/>

			<Stack.SearchBar
				placeholder="Search cards..."
				onChangeText={(e) => setFilterQuery(e.nativeEvent.text)}
			/>

			<Stack.Toolbar placement="bottom">
				<Stack.Toolbar.SearchBarSlot />
				<Stack.Toolbar.Menu icon="arrow.up.arrow.down">
					{(Object.keys(SORT_LABELS) as SortOption[]).map((o) => (
						<Stack.Toolbar.MenuAction
							key={o}
							isOn={sortBy === o}
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								setSortBy(o);
							}}
						>
							{SORT_LABELS[o]}
						</Stack.Toolbar.MenuAction>
					))}
				</Stack.Toolbar.Menu>
			</Stack.Toolbar>

			<View style={[styles.container, { backgroundColor: colors.background }]}>
				<RefreshingPill visible={refreshPrices.isPending} />

				{/* Card grid or empty state. Banner lives inside the list as its
				    header (matching set-detail) so it shares the list's layout
				    pass and never pops independently. */}
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
						ListHeaderComponent={summaryHeader ?? summarySkeleton}
						contentContainerStyle={[styles.grid, { paddingTop: topPadding }]}
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
				) : cardsLoading ? (
					<FlatList
						data={SKELETON_DATA}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={() => (
							<SkeletonBlock
								width={imageWidth}
								height={imageHeight}
								color={colors.border}
							/>
						)}
						ListHeaderComponent={summaryHeader ?? summarySkeleton}
						contentContainerStyle={[styles.grid, { paddingTop: topPadding }]}
						columnWrapperStyle={styles.row}
						scrollEnabled={false}
					/>
				) : (
					<FlatList
						data={[]}
						keyExtractor={() => "none"}
						renderItem={null}
						ListHeaderComponent={summaryHeader ?? summarySkeleton}
						contentContainerStyle={[styles.grid, { paddingTop: topPadding }]}
						ListEmptyComponent={
							filterQuery.trim().length > 0 ? (
								<View style={styles.emptyStateCentered}>
									<Ionicons
										name="search-outline"
										size={48}
										color={colors.mutedForeground}
									/>
									<Text
										style={[styles.emptyTitle, { color: colors.foreground }]}
									>
										No matching cards
									</Text>
								</View>
							) : (
								<View style={styles.emptyState}>
									<Ionicons
										name="folder-open-outline"
										size={48}
										color={colors.mutedForeground}
									/>
									<Text
										style={[styles.emptyTitle, { color: colors.foreground }]}
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
							)
						}
					/>
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
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingTop: 4,
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
		// Clear the bottom toolbar search bar
		paddingBottom: 140,
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
