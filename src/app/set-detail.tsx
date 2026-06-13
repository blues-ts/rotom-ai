import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Dimensions,
	FlatList,
	Keyboard,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { useApi } from "@/lib/axios";
import { searchCards, searchSealed } from "@/lib/api/pricing";
import { buildSetCardsQ, getCardDisplayName, getCardImage, getCardNumber, toNumber } from "@/lib/scrydex";
import CardImage from "@/components/CardImage";
import ErrorState from "@/components/ErrorState";
import type {
	ApiListResponse,
	ScrydexCard,
	ScrydexSealedProduct,
} from "@/types/scrydex";

type SetItem = ScrydexCard | ScrydexSealedProduct;

const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
const screenWidth = Dimensions.get("window").width;
const imageWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const imageHeight = imageWidth * 1.4;

const SKELETON_DATA = Array.from({ length: 15 }, (_, i) => ({ id: `skeleton-${i}` }));

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type SortOption = "number" | "numberDesc" | "nameAsc" | "valueDesc" | "valueAsc";

const SORT_LABELS: Record<SortOption, string> = {
	number: "Number (low to high)",
	numberDesc: "Number (high to low)",
	nameAsc: "Name (A–Z)",
	valueDesc: "Value (high to low)",
	valueAsc: "Value (low to high)",
};

// Scrydex order_by silently ignores price fields, and its name ordering uses
// the printed (Japanese) name while we display English translations — so only
// number sorts run server-side. Name and value sorts fetch the whole set and
// sort here.
const SORT_ORDER_BY: Record<string, string> = {
	number: "number",
	numberDesc: "-number",
};

/**
 * The item's market price and which variant it comes from (highest across
 * variants; NM for cards, U/unopened for sealed) — the sort key for value
 * ordering, and the variant the detail page should open on so the price the
 * user tapped is the price they see. USD preferred; when a card has no USD
 * raw rows at all (Japanese search payloads are JPY-only) the JPY market is
 * used so JA sets still rank correctly relative to themselves.
 */
function bestMarketPrice(
	item: SetItem,
	condition: "NM" | "U",
): { value: number; variant?: string } {
	let bestUsd = 0;
	let bestUsdVariant: string | undefined;
	let bestOther = 0;
	let bestOtherVariant: string | undefined;
	for (const v of item.variants ?? []) {
		for (const p of v.prices ?? []) {
			if (p.type !== "raw" || p.condition !== condition) continue;
			if (p.is_signed || p.is_error || p.is_perfect) continue;
			const value = toNumber(p.market) ?? 0;
			if (p.currency === "USD") {
				if (value > bestUsd) {
					bestUsd = value;
					bestUsdVariant = v.name;
				}
			} else if (value > bestOther) {
				bestOther = value;
				bestOtherVariant = v.name;
			}
		}
	}
	return bestUsd > 0
		? { value: bestUsd, variant: bestUsdVariant }
		: { value: bestOther, variant: bestOtherVariant };
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

function LoadingSpinner({ color }: { color: string }) {
	const dot1 = useSharedValue(0);
	const dot2 = useSharedValue(0);
	const dot3 = useSharedValue(0);

	useEffect(() => {
		dot1.value = withRepeat(
			withSequence(
				withTiming(-8, { duration: 300 }),
				withTiming(0, { duration: 300 }),
			),
			-1,
		);
		dot2.value = withRepeat(
			withSequence(
				withTiming(0, { duration: 150 }),
				withTiming(-8, { duration: 300 }),
				withTiming(0, { duration: 300 }),
			),
			-1,
		);
		dot3.value = withRepeat(
			withSequence(
				withTiming(0, { duration: 300 }),
				withTiming(-8, { duration: 300 }),
				withTiming(0, { duration: 300 }),
			),
			-1,
		);
	}, []);

	const style1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
	const style2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
	const style3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

	return (
		<View style={styles.spinnerRow}>
			<Animated.View style={[styles.dot, { backgroundColor: color }, style1]} />
			<Animated.View style={[styles.dot, { backgroundColor: color }, style2]} />
			<Animated.View style={[styles.dot, { backgroundColor: color }, style3]} />
		</View>
	);
}

function SkeletonCard({ color }: { color: string }) {
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
			style={[styles.cardImage, { backgroundColor: color }, animatedStyle]}
		/>
	);
}

export default function SetDetail() {
	const { id, name, mode, releaseDate, total, logo } = useLocalSearchParams<{
		id: string;
		name?: string;
		mode?: string;
		releaseDate?: string;
		total?: string;
		logo?: string;
	}>();
	const isSealedMode = mode === "sealed";
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const api = useApi();
	// Explicit header offset: contentInsetAdjustmentBehavior applies its inset
	// a frame after mount, which made the summary jump down on every list
	// remount (initial load, sort changes).
	const topPadding = insets.top + 20;
	const [filterQuery, setFilterQuery] = useState("");
	const [debouncedFilter, setDebouncedFilter] = useState("");
	const [sortBy, setSortBy] = useState<SortOption>(
		isSealedMode ? "nameAsc" : "number",
	);
	const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedFilter(filterQuery);
		}, 350);
		return () => clearTimeout(timer);
	}, [filterQuery]);

	const isValueSort = sortBy === "valueDesc" || sortBy === "valueAsc";
	// Name and value sorts run client-side over the whole set: Scrydex can't
	// order by price, and its name ordering uses printed (Japanese) names
	// while we display English translations.
	const isClientSort = isValueSort || sortBy === "nameAsc";

	const {
		data,
		isLoading: pagedLoading,
		isError: pagedError,
		refetch: refetchPaged,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useInfiniteQuery<ApiListResponse<SetItem>>({
		queryKey: ["setCards", id, isSealedMode, debouncedFilter, sortBy],
		queryFn: ({ pageParam }) => {
			const search = isSealedMode ? searchSealed : searchCards;
			return search(api, {
				q: buildSetCardsQ(id, debouncedFilter),
				page: pageParam as number,
				pageSize: 60,
				orderBy: SORT_ORDER_BY[sortBy],
			});
		},
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.page * lastPage.page_size < lastPage.total_count
				? lastPage.page + 1
				: undefined,
		enabled: !!id && !isClientSort,
	});

	// Whole-set fetch for client-side sorts. Sets top out around ~300 cards;
	// prices are only included when the sort needs them.
	const {
		data: allCards,
		isLoading: allLoading,
		isError: allError,
		refetch: refetchAll,
	} = useQuery({
		queryKey: ["setCardsAll", id, isSealedMode, debouncedFilter, isValueSort],
		queryFn: async (): Promise<SetItem[]> => {
			const q = buildSetCardsQ(id, debouncedFilter);
			const search = isSealedMode ? searchSealed : searchCards;
			const first = await search(api, {
				q,
				pageSize: 100,
				includePrices: isValueSort,
			});
			const all: SetItem[] = [...first.data];
			let page = 2;
			while (all.length < first.total_count && page <= 6) {
				const next = await search(api, {
					q,
					page,
					pageSize: 100,
					includePrices: isValueSort,
				});
				if (next.data.length === 0) break;
				all.push(...next.data);
				page += 1;
			}
			return all;
		},
		enabled: !!id && isClientSort,
		staleTime: 5 * 60 * 1000,
	});

	const isLoading = isClientSort ? allLoading : pagedLoading;
	const isError = isClientSort ? allError : pagedError;
	const refetch = isClientSort ? refetchAll : refetchPaged;

	const sortCondition = isSealedMode ? "U" : "NM";

	const cards = useMemo(() => {
		if (isValueSort) {
			const sorted = (allCards ?? [])
				.slice()
				.sort(
					(a, b) =>
						bestMarketPrice(b, sortCondition).value -
						bestMarketPrice(a, sortCondition).value,
				);
			return sortBy === "valueAsc" ? sorted.reverse() : sorted;
		}
		if (sortBy === "nameAsc") {
			return (allCards ?? [])
				.slice()
				.sort((a, b) => {
					const nameA = "number" in a ? getCardDisplayName(a) : a.name;
					const nameB = "number" in b ? getCardDisplayName(b) : b.name;
					return nameA.localeCompare(nameB);
				});
		}
		return data?.pages.flatMap((p) => p.data) ?? [];
	}, [isValueSort, allCards, sortBy, data, sortCondition]);

	const handleEndReached = useCallback(() => {
		if (!isClientSort && hasNextPage && !isFetchingNextPage) {
			fetchNextPage();
		}
	}, [isClientSort, hasNextPage, isFetchingNextPage, fetchNextPage]);

	// The expansion's `total` is its card count; in sealed mode the product
	// count comes from the first unfiltered response instead.
	const [sealedTotal, setSealedTotal] = useState<number | null>(null);
	useEffect(() => {
		if (!isSealedMode || debouncedFilter !== "") return;
		const t = data?.pages[0]?.total_count ?? allCards?.length;
		if (t !== undefined) setSealedTotal(t);
	}, [isSealedMode, debouncedFilter, data, allCards]);

	const releaseYear = releaseDate ? releaseDate.slice(0, 4) : "—";
	const countValue = isSealedMode ? (sealedTotal ?? "—") : (total || "—");

	// Rendered inside the FlatList so native header insets (translucent header
	// + attached search bar) position it correctly instead of hiding it.
	const summaryHeader = (
		<View style={styles.summaryRow}>
			<View style={styles.summarySide}>
				<Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
					Released
				</Text>
				<Text style={[styles.summaryValue, { color: colors.foreground }]}>
					{releaseYear}
				</Text>
			</View>
			{!!logo && (
				<Image
					source={{ uri: logo }}
					style={styles.summaryLogo}
					contentFit="contain"
					transition={150}
					cachePolicy="memory-disk"
				/>
			)}
			<View style={[styles.summarySide, styles.summaryRight]}>
				<Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
					{isSealedMode ? "Products" : "Cards"}
				</Text>
				<Text style={[styles.summaryValue, { color: colors.foreground }]}>
					{countValue}
				</Text>
			</View>
		</View>
	);

	const renderItem = useCallback(
		({ item, index }: { item: SetItem; index: number }) => {
			const image = getCardImage(item, undefined, "small") ?? "";
			const cardNumber = "number" in item ? getCardNumber(item) : "";
			const displayName =
				"number" in item ? getCardDisplayName(item) : item.name;
			const showPlaceholder = !image || failedImages.has(item.id);
			// In value mode, open the item on the variant that drove its sort
			// position so the hero price matches the ranking.
			const bestVariant = isValueSort
				? bestMarketPrice(item, sortCondition).variant
				: undefined;
			return (
				<Animated.View
					entering={FadeIn.delay(Math.min(index * 20, 240)).duration(200)}
				>
					<CardPressable
						onPress={() => {
							Keyboard.dismiss();
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							router.push({
								pathname: isSealedMode ? "/(sealed)/[id]" : "/(card)/[id]",
								params: {
									id: item.id,
									name: displayName,
									...(bestVariant ? { variant: bestVariant } : {}),
								},
							});
						}}
					>
						{showPlaceholder ? (
							<View
								style={[
									styles.cardImage,
									styles.placeholder,
									{ backgroundColor: colors.card },
								]}
							>
								<Ionicons
									name={isSealedMode ? "cube-outline" : "image-outline"}
									size={24}
									color={colors.mutedForeground}
								/>
								<Text
									style={[styles.placeholderName, { color: colors.foreground }]}
									numberOfLines={2}
								>
									{displayName}
								</Text>
								{!!cardNumber && (
									<Text
										style={[
											styles.placeholderNumber,
											{ color: colors.mutedForeground },
										]}
									>
										#{cardNumber}
									</Text>
								)}
							</View>
						) : isSealedMode ? (
							// Sealed art comes in arbitrary aspect ratios — inset it on
							// the tile background so the tile keeps the card silhouette.
							<View
								style={[
									styles.cardImage,
									styles.sealedTile,
									{ backgroundColor: colors.card },
								]}
							>
								<CardImage
									uri={image}
									style={styles.sealedImage}
									backgroundColor="transparent"
									shimmerColor={colors.border}
									onError={() => {
										setFailedImages((prev) => new Set(prev).add(item.id));
									}}
								/>
							</View>
						) : (
							<CardImage
								uri={image}
								style={styles.cardImage}
								backgroundColor={colors.card}
								shimmerColor={colors.border}
								onError={() => {
									setFailedImages((prev) => new Set(prev).add(item.id));
								}}
							/>
						)}
					</CardPressable>
				</Animated.View>
			);
		},
		[colors, failedImages, isValueSort, isSealedMode, sortCondition],
	);

	return (
		<>
			<Stack.Screen
				options={{
					headerTitle: name ?? "Set",
					headerLeft: () => (
						<Pressable
							hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								router.back();
							}}
						>
							<Ionicons name="close" size={24} color={colors.foreground} />
						</Pressable>
					),
				}}
			/>

			<Stack.SearchBar
				placeholder={isSealedMode ? "Search products..." : "Search this set..."}
				onChangeText={(e) => setFilterQuery(e.nativeEvent.text)}
			/>

			<Stack.Toolbar placement="bottom">
				<Stack.Toolbar.SearchBarSlot />
				<Stack.Toolbar.Menu icon="arrow.up.arrow.down">
					{/* Sealed products have no collector numbers */}
					{(isSealedMode
						? (["nameAsc", "valueDesc", "valueAsc"] as SortOption[])
						: ([
								"number",
								"numberDesc",
								"nameAsc",
								"valueDesc",
								"valueAsc",
							] as SortOption[])
					).map((o) => (
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
				{isError ? (
					<ErrorState title="Couldn't load set" onRetry={() => refetch()} />
				) : isLoading ? (
					<FlatList
						data={SKELETON_DATA}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={() => <SkeletonCard color={colors.border} />}
						ListHeaderComponent={summaryHeader}
						contentContainerStyle={[styles.grid, { paddingTop: topPadding }]}
						columnWrapperStyle={styles.row}
						scrollEnabled={false}
					/>
				) : cards.length === 0 ? (
					<View style={styles.emptyState}>
						<Ionicons
							name="search-outline"
							size={48}
							color={colors.mutedForeground}
						/>
						<Text style={[styles.emptyTitle, { color: colors.foreground }]}>
							No matching cards
						</Text>
					</View>
				) : (
					<FlatList
						// Remount on sort change so the list snaps back to the top —
						// otherwise the reorder happens off-screen and looks broken.
						key={sortBy}
						data={cards}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={renderItem}
						ListHeaderComponent={summaryHeader}
						contentContainerStyle={[styles.grid, { paddingTop: topPadding }]}
						columnWrapperStyle={styles.row}
						showsVerticalScrollIndicator={false}
						keyboardDismissMode="on-drag"
						keyboardShouldPersistTaps="handled"
						onEndReached={handleEndReached}
						onEndReachedThreshold={0.5}
						ListFooterComponent={
							isFetchingNextPage ? (
								<Animated.View
									entering={FadeIn.duration(200)}
									exiting={FadeOut.duration(300)}
									style={styles.footer}
								>
									<LoadingSpinner color={colors.mutedForeground} />
								</Animated.View>
							) : null
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
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		// Inside the grid's contentContainer, which already pads 12
		paddingHorizontal: 4,
		paddingTop: 4,
		paddingBottom: 12,
	},
	summarySide: {
		flex: 1,
	},
	summaryLogo: {
		flex: 1.2,
		height: 52,
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
	footer: {
		alignItems: "center",
		paddingVertical: 20,
	},
	spinnerRow: {
		flexDirection: "row",
		gap: 6,
		alignItems: "center",
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: 4,
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
	cardImage: {
		width: imageWidth,
		height: imageHeight,
		borderRadius: 8,
	},
	placeholder: {
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 8,
		gap: 4,
	},
	sealedTile: {
		padding: 8,
	},
	sealedImage: {
		flex: 1,
		borderRadius: 4,
	},
	placeholderName: {
		fontSize: 11,
		fontWeight: "600",
		textAlign: "center",
	},
	placeholderNumber: {
		fontSize: 10,
	},
	emptyState: {
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
});
