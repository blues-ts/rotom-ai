import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Dimensions,
	FlatList,
	InteractionManager,
	Keyboard,
	Pressable,
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
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { useApi } from "@/lib/axios";
import { usePrefetchDetail } from "@/hooks/usePrefetchDetail";
import { searchCards, searchSealed } from "@/lib/api/pricing";
import { getCatalogSet, catalogCardToScrydex } from "@/lib/api/catalog";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import {
	buildSetCardsQ,
	getCardDisplayName,
	getCardImage,
	getCardNumber,
	getConditionOptions,
	getVariantNames,
	toNumber,
} from "@/lib/scrydex";
import CardImage from "@/components/CardImage";
import CardContextMenu from "@/components/CardContextMenu";
import TapHoldHintOverlay from "@/components/TapHoldHintOverlay";
import { useTapHoldHint } from "@/hooks/useTapHoldHint";
import ErrorState from "@/components/ErrorState";
import type { ScrydexCard, ScrydexSealedProduct } from "@/types/scrydex";

type SetItem = ScrydexCard | ScrydexSealedProduct;

const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
const screenWidth = Dimensions.get("window").width;
const imageWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const imageHeight = imageWidth * 1.4;

const SKELETON_DATA = Array.from({ length: 15 }, (_, i) => ({
	id: `skeleton-${i}`,
}));

type SortOption =
	| "number"
	| "numberDesc"
	| "nameAsc"
	| "valueDesc"
	| "valueAsc";

const SORT_LABELS: Record<SortOption, string> = {
	number: "Number (low to high)",
	numberDesc: "Number (high to low)",
	nameAsc: "Name (A–Z)",
	valueDesc: "Value (high to low)",
	valueAsc: "Value (low to high)",
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
	const { isPro } = useRevenueCat();
	const insets = useSafeAreaInsets();
	const api = useApi();
	const prefetchDetail = usePrefetchDetail();
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

	// Tracks cards that have already played their entrance animation. FlatList
	// recycles cells (unmount/remount) constantly while scrolling, and an
	// `entering` animation re-fires on every mount — so without this guard the
	// fade-in would replay on every scroll-back and jank the list. We let each
	// card animate exactly once, on its genuine first appearance. Cleared when
	// the dataset changes (sort/filter) so a fresh list animates in again.
	const animatedIdsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		animatedIdsRef.current = new Set();
	}, [sortBy, debouncedFilter, isSealedMode]);

	// Defer the heavy card grid (animated image cells) until the navigation
	// transition finishes, so pushing this screen is instant instead of waiting
	// on the grid's first render. The light skeleton shows during the slide-in.
	const [transitionDone, setTransitionDone] = useState(false);
	useEffect(() => {
		const handle = InteractionManager.runAfterInteractions(() => {
			setTransitionDone(true);
		});
		return () => handle.cancel();
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedFilter(filterQuery);
		}, 350);
		return () => clearTimeout(timer);
	}, [filterQuery]);

	const isValueSort = sortBy === "valueDesc" || sortBy === "valueAsc";

	// Whole-set fetch, paginated *concurrently* so wall-clock load is ~2 round
	// trips regardless of set size. Prices are optional (see below).
	const fetchWholeSet = useCallback(
		async (
			includePrices: boolean,
		): Promise<{ items: SetItem[]; totalCount: number }> => {
			const q = buildSetCardsQ(id, debouncedFilter);
			const search = isSealedMode ? searchSealed : searchCards;
			const orderBy = isSealedMode ? undefined : "number";
			const first = await search(api, {
				q,
				pageSize: 100,
				orderBy,
				includePrices,
			});
			const items: SetItem[] = [...first.data];
			const pageSize = first.page_size || 100;
			const totalPages = Math.min(Math.ceil(first.total_count / pageSize), 6);
			if (totalPages > 1) {
				const rest = await Promise.all(
					Array.from({ length: totalPages - 1 }, (_, i) =>
						search(api, {
							q,
							page: i + 2,
							pageSize: 100,
							orderBy,
							includePrices,
						}),
					),
				);
				// Promise.all preserves order, so number ordering is kept.
				for (const r of rest) items.push(...r.data);
			}
			return { items, totalCount: first.total_count };
		},
		[api, id, isSealedMode, debouncedFilter],
	);

	// Card list comes from the LOCAL catalog — no Scrydex call. It's the same
	// query the sets list warms on scroll/tap, so opening a set is instant (and
	// offline-capable). The grid only needs art/number/name, all of which the
	// catalog carries.
	const {
		data: catalogSet,
		isLoading: catalogLoading,
		isError: catalogError,
		refetch: refetchCatalog,
	} = useQuery({
		queryKey: ["catalog-set", id],
		queryFn: () => getCatalogSet(api, id),
		enabled: !!id && !isSealedMode,
		staleTime: 24 * 60 * 60 * 1000,
	});

	// Sealed products aren't in the catalog, so sealed mode still loads live.
	const {
		data: sealedSet,
		isLoading: sealedLoading,
		isError: sealedError,
		refetch: refetchSealed,
	} = useQuery({
		queryKey: ["setSealed", id, debouncedFilter],
		queryFn: () => fetchWholeSet(false),
		enabled: !!id && isSealedMode,
		staleTime: 5 * 60 * 1000,
	});

	const isLoading = isSealedMode ? sealedLoading : catalogLoading;
	const isError = isSealedMode ? sealedError : catalogError;
	const refetch = isSealedMode ? refetchSealed : refetchCatalog;

	// Prices are needed ONLY to sort by value — fetched on demand from the live
	// pricing path the first time the user picks a value sort, then cached.
	const { data: pricedCards } = useQuery({
		queryKey: ["setCardsPriced", id, isSealedMode, debouncedFilter],
		queryFn: () => fetchWholeSet(true),
		enabled: !!id && isValueSort && isPro,
		staleTime: 5 * 60 * 1000,
	});

	// A value sort is meaningless until prices arrive — show the skeleton while
	// fetching rather than briefly displaying the default (number) order. Cached
	// prices (staleTime) make this instant on repeat selections.
	const waitingForPriceSort = isValueSort && isPro && !pricedCards;

	// Skeleton during a cold load OR until the push transition settles (so the
	// heavy grid mounts after the slide-in, not during it), OR while a value
	// sort waits on its pricing fetch.
	const showSkeleton = isLoading || !transitionDone || waitingForPriceSort;

	const sortCondition = isSealedMode ? "U" : "NM";

	const cards = useMemo(() => {
		// Card mode: map the local catalog cards and filter client-side (the whole
		// set is already local). Sealed mode: items come pre-filtered from the API.
		let base: SetItem[];
		if (isSealedMode) {
			base = sealedSet?.items ?? [];
		} else {
			const all = (catalogSet?.cards ?? []).map(catalogCardToScrydex);
			const f = debouncedFilter.trim().toLowerCase();
			base = f
				? all.filter(
						(c) =>
							getCardDisplayName(c).toLowerCase().includes(f) ||
							c.name.toLowerCase().includes(f) ||
							getCardNumber(c).toLowerCase().includes(f),
					)
				: all;
		}

		if (isValueSort) {
			// While prices load the skeleton is shown (see `waitingForPriceSort`),
			// so this number-order fallback only ever renders for non-pro users.
			const priced = pricedCards?.items;
			if (!priced) return base;
			const sorted = priced
				.slice()
				.sort(
					(a, b) =>
						bestMarketPrice(b, sortCondition).value -
						bestMarketPrice(a, sortCondition).value,
				);
			return sortBy === "valueAsc" ? sorted.reverse() : sorted;
		}
		if (sortBy === "nameAsc") {
			return base.slice().sort((a, b) => {
				const nameA = "number" in a ? getCardDisplayName(a) : a.name;
				const nameB = "number" in b ? getCardDisplayName(b) : b.name;
				return nameA.localeCompare(nameB);
			});
		}
		// Catalog/API already return ascending number order; reverse for descending.
		return sortBy === "numberDesc" ? base.slice().reverse() : base;
	}, [
		isSealedMode,
		sealedSet,
		catalogSet,
		debouncedFilter,
		pricedCards,
		isValueSort,
		sortBy,
		sortCondition,
	]);

	// The expansion's `total` is its card count; in sealed mode the product
	// count comes from the first unfiltered response instead.
	const [sealedTotal, setSealedTotal] = useState<number | null>(null);
	useEffect(() => {
		if (!isSealedMode || debouncedFilter !== "") return;
		const t = sealedSet?.totalCount;
		if (t !== undefined) setSealedTotal(t);
	}, [isSealedMode, debouncedFilter, sealedSet]);

	const releaseYear = releaseDate ? releaseDate.slice(0, 4) : "—";
	const countValue = isSealedMode ? (sealedTotal ?? "—") : total || "—";

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

	// One-time "Tap and hold me!" nudge on the first card.
	const { show: showHint, dismiss: dismissHint } = useTapHoldHint(
		cards.length > 0,
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
			const priceInfo = bestMarketPrice(item, sortCondition);
			const bestVariant = isValueSort ? priceInfo.variant : undefined;

			// Quick-add must store a REAL variant/condition (what the card-detail
			// screen would default to), else its config won't match and the
			// in-collection controls won't show. Prefer the priced variant, fall
			// back to the card's first variant.
			const quickVariant =
				priceInfo.variant ?? getVariantNames(item)[0] ?? "normal";
			const quickCondition =
				"number" in item
					? (getConditionOptions(item, quickVariant)[0] ?? "NM")
					: "NM";
			// Animate in only on a card's first appearance; recycled cells get no
			// `entering`, so scrolling back never replays the fade (the old jank).
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
					<CardContextMenu
						card={{
							cardId: item.id,
							cardName: displayName,
							cardNumber: cardNumber || undefined,
							setName: name,
							cardImageUrl: image || undefined,
							cardValue: priceInfo.value,
							productType: isSealedMode ? "sealed" : "card",
							variant: quickVariant,
							condition: quickCondition,
						}}
						onPress={() => {
							Keyboard.dismiss();
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							prefetchDetail(isSealedMode ? "sealed" : "card", item.id);
							router.push({
								pathname: isSealedMode ? "/(sealed)/[id]" : "/(card)/[id]",
								params: {
									id: item.id,
									name: displayName,
									// Cached thumbnail — lets the detail show the image
									// instantly instead of behind the data-query skeleton.
									...(image ? { image } : {}),
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
					</CardContextMenu>
					{index === 0 && showHint && (
						<TapHoldHintOverlay
							width={imageWidth}
							height={imageHeight}
							onDismiss={dismissHint}
						/>
					)}
				</Animated.View>
			);
		},
		[
			colors,
			name,
			failedImages,
			isValueSort,
			isSealedMode,
			sortCondition,
			prefetchDetail,
			showHint,
			dismissHint,
		],
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
								// Value sorts need prices — a Pro feature.
								if ((o === "valueDesc" || o === "valueAsc") && !isPro) {
									void presentProPaywallIfNeeded();
									return;
								}
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
				) : showSkeleton ? (
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
						removeClippedSubviews
						initialNumToRender={15}
						maxToRenderPerBatch={9}
						windowSize={7}
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
