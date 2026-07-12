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
	FadeIn,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { cardWaterfall } from "@/lib/waterfall";
import { SymbolView } from "expo-symbols";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import SegmentedChips from "@/components/SegmentedChips";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, useRiverTheme } from "@/constants/theme";
import { useApi } from "@/lib/axios";
import FloatingSearchBar from "@/components/FloatingSearchBar";
import { usePrefetchDetail } from "@/hooks/usePrefetchDetail";
import { useOwnedCardIds } from "@/hooks/useOwnedCardIds";
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
const PADDING = spacing.screen;
const screenWidth = Dimensions.get("window").width;
const imageWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
// Card art is always TCG ratio (63:88), never cropped.
const imageHeight = imageWidth * (88 / 63);

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

/**
 * Order one mode's items. Value sorts rank the PRICED dataset — unpriced
 * items sink to the end in BOTH directions (reversing them to the top made
 * "low to high" lead with a wall of unpriced cards); while prices load the
 * caller shows a skeleton, so the base-order fallback only ever renders for
 * non-pro users. Number order is the API's natural ascending order.
 */
function sortSetItems(
	base: SetItem[],
	sort: SortOption,
	priced: SetItem[] | undefined,
	condition: "NM" | "U",
): SetItem[] {
	if (sort === "valueDesc" || sort === "valueAsc") {
		if (!priced) return base;
		const keyed = priced.map((item) => ({
			item,
			key: bestMarketPrice(item, condition).value,
		}));
		const withPrice = keyed.filter((k) => k.key > 0);
		const unpriced = keyed.filter((k) => k.key === 0);
		withPrice.sort((a, b) => b.key - a.key);
		if (sort === "valueAsc") withPrice.reverse();
		return [...withPrice, ...unpriced].map((k) => k.item);
	}
	if (sort === "nameAsc") {
		return base.slice().sort((a, b) => {
			const nameA = "number" in a ? getCardDisplayName(a) : a.name;
			const nameB = "number" in b ? getCardDisplayName(b) : b.name;
			return nameA.localeCompare(nameB);
		});
	}
	return sort === "numberDesc" ? base.slice().reverse() : base;
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
	const { id, name, mode, releaseDate, total, logo, owned } =
		useLocalSearchParams<{
			id: string;
			name?: string;
			mode?: string;
			releaseDate?: string;
			total?: string;
			logo?: string;
			owned?: string;
		}>();
	// Cards ⇄ Sealed is a toggle ON the screen (segmented control in the
	// header) — the route param only seeds the initial mode.
	const [productMode, setProductMode] = useState<"cards" | "sealed">(
		mode === "sealed" ? "sealed" : "cards",
	);
	const isSealedMode = productMode === "sealed";
	// "Collected" view: same screen, grid filtered to cards the user owns.
	const ownedOnly = owned === "1" && !isSealedMode;
	const t = useRiverTheme();
	const { isPro } = useRevenueCat();
	const insets = useSafeAreaInsets();
	const api = useApi();
	const prefetchDetail = usePrefetchDetail();
	// Explicit header offset: contentInsetAdjustmentBehavior applies its inset
	// a frame after mount, which made the summary jump down on every list
	// remount (initial load, sort changes). Same on every iOS version — the
	// search field is the FloatingSearchBar, no header-attached strip to clear.
	const topPadding = insets.top + 20;
	const [filterQuery, setFilterQuery] = useState("");
	const [debouncedFilter, setDebouncedFilter] = useState("");
	// DUAL-MOUNTED lists: cards and sealed each keep their own FlatList,
	// sort, and scroll position; the mode toggle is just a visibility flip.
	// Rebuilding the cards grid on every toggle (native context-menu host per
	// cell) is what made Sealed → Cards slow. Each mode's sort persists.
	const [cardSort, setCardSort] = useState<SortOption>("number");
	const [sealedSort, setSealedSort] = useState<SortOption>("nameAsc");
	const sortBy = isSealedMode ? sealedSort : cardSort;
	// The sealed list mounts (and its query fires) on first visit only.
	const [sealedVisited, setSealedVisited] = useState(isSealedMode);
	// Bumped when a mode becomes visible: remounts THAT list so its tiles
	// waterfall in on every toggle (the Sets ⇄ Pokédex feel) — the hidden
	// list is never remounted.
	const [cardGen, setCardGen] = useState(0);
	const [sealedGen, setSealedGen] = useState(0);
	const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

	// Tracks cards that have already played their entrance animation. FlatList
	// recycles cells (unmount/remount) constantly while scrolling, and an
	// `entering` animation re-fires on every mount — so without this guard the
	// fade-in would replay on every scroll-back and jank the list. We let each
	// card animate exactly once per LIST GENERATION: the guard is cleared when
	// the filter changes and on Cards ⇄ Sealed toggles (the mode handler also
	// bumps that list's generation key), so each arrival waterfalls in fresh.
	const animatedIdsRef = useRef<Set<string>>(new Set());

	// (SegmentedChips fires the tap haptic itself.)
	const cardListRef = useRef<FlatList<SetItem>>(null);
	const sealedListRef = useRef<FlatList<SetItem>>(null);
	const handleProductModeChange = useCallback(
		(m: "cards" | "sealed") => {
			// Sealed pricing is a Pro feature (no free catalog data for it).
			if (m === "sealed" && !isPro) {
				void presentProPaywallIfNeeded();
				return;
			}
			if (m === "sealed") setSealedVisited(true);
			setProductMode(m);
			// Replay the waterfall for the incoming mode: bumping the gen
			// remounts that list AND invalidates its entrance-guard keys.
			if (m === "sealed") setSealedGen((g) => g + 1);
			else setCardGen((g) => g + 1);
		},
		[isPro],
	);

	const handleSortChange = useCallback(
		(o: SortOption) => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			// Value sorts need prices — a Pro feature.
			if ((o === "valueDesc" || o === "valueAsc") && !isPro) {
				void presentProPaywallIfNeeded();
				return;
			}
			if (isSealedMode) setSealedSort(o);
			else setCardSort(o);
			// Replay the waterfall for the newly-ordered list, same as a mode
			// toggle: the gen bump remounts it and invalidates its guard keys.
			if (isSealedMode) setSealedGen((g) => g + 1);
			else setCardGen((g) => g + 1);
		},
		[isPro, isSealedMode],
	);

	// The lists are never remounted — a sort change reorders in place, and
	// this snaps that list back to the top so the new order is seen from its
	// beginning. (Mode toggles keep each list's scroll position.)
	useEffect(() => {
		cardListRef.current?.scrollToOffset({ offset: 0, animated: false });
	}, [cardSort]);
	useEffect(() => {
		sealedListRef.current?.scrollToOffset({ offset: 0, animated: false });
	}, [sealedSort]);

	// A filter change is a genuinely new result set — waterfall it in fresh.
	useEffect(() => {
		animatedIdsRef.current = new Set();
	}, [debouncedFilter]);

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
	// trips regardless of set size. Prices are optional (see below). The kind
	// is an explicit parameter — both queries can be live at once now (dual
	// mounted lists), so closing over the active mode would let a background
	// refetch fill the sealed cache with card data.
	const fetchWholeSet = useCallback(
		async (
			includePrices: boolean,
			kind: "cards" | "sealed",
		): Promise<{ items: SetItem[]; totalCount: number }> => {
			const q = buildSetCardsQ(id, debouncedFilter);
			const search = kind === "sealed" ? searchSealed : searchCards;
			const orderBy = kind === "sealed" ? undefined : "number";
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
		[api, id, debouncedFilter],
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
		// Always on: the cards list stays mounted even while sealed is shown.
		enabled: !!id,
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
		queryFn: () => fetchWholeSet(false, "sealed"),
		// Lazily enabled on the first Sealed visit, then stays live so the
		// mounted-but-hidden list keeps its data.
		enabled: !!id && sealedVisited,
		staleTime: 5 * 60 * 1000,
	});

	const isError = isSealedMode ? sealedError : catalogError;
	const refetch = isSealedMode ? refetchSealed : refetchCatalog;

	// Prices are needed ONLY to sort by value — fetched on demand from the live
	// pricing path the first time a value sort is picked, then cached. One
	// query PER KIND (each list keeps its own sort), so neither dataset ever
	// depends on which mode is visible.
	const cardSortIsValue = cardSort === "valueDesc" || cardSort === "valueAsc";
	const sealedSortIsValue =
		sealedSort === "valueDesc" || sealedSort === "valueAsc";
	const { data: pricedCards } = useQuery({
		queryKey: ["setCardsPriced", id, "cards", debouncedFilter],
		queryFn: () => fetchWholeSet(true, "cards"),
		enabled: !!id && cardSortIsValue && isPro,
		staleTime: 5 * 60 * 1000,
	});
	const { data: pricedSealed } = useQuery({
		queryKey: ["setCardsPriced", id, "sealed", debouncedFilter],
		queryFn: () => fetchWholeSet(true, "sealed"),
		enabled: !!id && sealedSortIsValue && isPro,
		staleTime: 5 * 60 * 1000,
	});

	// A value sort is meaningless until prices arrive — show the skeleton while
	// fetching rather than briefly displaying the default (number) order. Cached
	// prices (staleTime) make this instant on repeat selections.
	const waitingForPriceSort =
		isPro &&
		(isSealedMode ? sealedSortIsValue && !pricedSealed : cardSortIsValue && !pricedCards);

	// Per-list skeletons: cold load, the push transition settling (so the
	// heavy grid mounts after the slide-in, not during it), or the active
	// mode's value sort waiting on its pricing fetch.
	const showCardsSkeleton =
		catalogLoading || !transitionDone || (!isSealedMode && waitingForPriceSort);
	const showSealedSkeleton =
		sealedLoading || !transitionDone || (isSealedMode && waitingForPriceSort);

	// Set completion: distinct owned card ids (all collections) intersected
	// with this set's catalog cards. Denominator is the catalog card count so
	// numerator and denominator share the same card universe as the grid.
	const { data: ownedCardIds } = useOwnedCardIds(!isSealedMode);
	const ownedIdSet = useMemo(
		() => new Set(ownedCardIds ?? []),
		[ownedCardIds],
	);
	const ownedInSet = useMemo(
		() =>
			(catalogSet?.cards ?? []).filter((c) => ownedIdSet.has(c.cardId)).length,
		[catalogSet, ownedIdSet],
	);
	const setSize = catalogSet?.cards.length ?? 0;

	// Collected view keeps every sort/filter path; ownership is applied as
	// the final step so the value-sort branch (separate priced dataset) is
	// covered too.
	const applyOwned = useCallback(
		(items: SetItem[]) =>
			ownedOnly ? items.filter((c) => ownedIdSet.has(c.id)) : items,
		[ownedOnly, ownedIdSet],
	);

	// The catalog → Scrydex mapping allocates ~250 objects; hoisted so it runs
	// once per catalog payload, not per filter keystroke or sort change.
	const allCatalogCards = useMemo(
		() => (catalogSet?.cards ?? []).map(catalogCardToScrydex),
		[catalogSet],
	);

	// One dataset per mounted list — each keyed to its OWN sort and its own
	// priced query, so a mode toggle recomputes NOTHING (no dep on the
	// visible mode).
	const cardItems = useMemo(() => {
		const f = debouncedFilter.trim().toLowerCase();
		const base = f
			? allCatalogCards.filter(
					(c) =>
						getCardDisplayName(c).toLowerCase().includes(f) ||
						c.name.toLowerCase().includes(f) ||
						getCardNumber(c).toLowerCase().includes(f),
				)
			: allCatalogCards;
		return applyOwned(
			sortSetItems(base, cardSort, pricedCards?.items, "NM"),
		);
	}, [allCatalogCards, debouncedFilter, cardSort, pricedCards, applyOwned]);

	const sealedItems = useMemo(() => {
		// Sealed items come pre-filtered from the API.
		const base = sealedSet?.items ?? [];
		return applyOwned(
			sortSetItems(base, sealedSort, pricedSealed?.items, "U"),
		);
	}, [sealedSet, sealedSort, pricedSealed, applyOwned]);

	const cards = isSealedMode ? sealedItems : cardItems;

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

	// Completion display: counts zero-padded like collector numbers (087/165),
	// plus a whole-number percent.
	const padWidth = Math.max(3, String(setSize).length);
	const ownedPadded = String(ownedInSet).padStart(padWidth, "0");
	const setSizePadded = String(setSize).padStart(padWidth, "0");
	const completionPct =
		setSize > 0 ? Math.round((ownedInSet / setSize) * 100) : 0;
	// The guard also hides this while the catalog/ownership queries load, so
	// it appears with real numbers instead of flashing "000 / 000".
	const showCompletion = !isSealedMode && !!catalogSet && !!ownedCardIds;

	// Rendered inside the FlatList so native header insets (translucent header
	// + attached search bar) position it correctly instead of hiding it.
	const summaryHeader = (
		<>
			{/* Cards ⇄ Sealed — moved here from the search page's old filter
			    menu: "show this set's sealed products" is a decision that
			    belongs on the set. Our own segmented chips (not SwiftUI glass,
			    which iOS hides while a search bar is active). Hidden in the
			    Collected view, which is cards-only. */}
			{!ownedOnly && (
				<View style={styles.modePickerWrap}>
					<SegmentedChips
						options={[
							{ value: "cards", label: "Cards" },
							{ value: "sealed", label: "Sealed" },
						]}
						value={productMode}
						onChange={handleProductModeChange}
					/>
				</View>
			)}
			{/* Card mode replaces this info bar with the completion card below
			    (which carries the logo); only sealed mode still shows it. The
			    entrance fade covers the Cards ⇄ Sealed remount, so the header
			    arrives with the grid's waterfall instead of hard-cutting. */}
			{isSealedMode && (
				<Animated.View
					entering={FadeIn.duration(250)}
					style={[
						styles.summaryRow,
						{
							backgroundColor: t.glass.surfaceFill,
							borderColor: t.glass.surfaceBorder,
						},
						t.glass.shadow,
					]}
				>
					<View style={styles.summarySide}>
						<Text style={[styles.summaryLabel, { color: t.text.secondary }]}>
							Released
						</Text>
						<Text style={[styles.summaryValue, { color: t.text.primary }]}>
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
						<Text style={[styles.summaryLabel, { color: t.text.secondary }]}>
							{isSealedMode ? "Products" : "Cards"}
						</Text>
						<Text style={[styles.summaryValue, { color: t.text.primary }]}>
							{countValue}
						</Text>
					</View>
				</Animated.View>
			)}
			{showCompletion && (
				<Animated.View entering={FadeIn.duration(250)}>
				<Pressable
					disabled={ownedOnly}
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push({
							pathname: "/set-detail",
							params: {
								id,
								owned: "1",
								...(name ? { name } : {}),
								...(releaseDate ? { releaseDate } : {}),
								...(total ? { total } : {}),
								...(logo ? { logo } : {}),
							},
						});
					}}
					style={[
						styles.completionCard,
						{
							backgroundColor: t.glass.surfaceFill,
							borderColor: t.glass.surfaceBorder,
						},
						t.glass.shadow,
					]}
				>
					<View style={styles.completionTopRow}>
						<View style={styles.summarySide}>
							<Text style={[styles.summaryLabel, { color: t.text.secondary }]}>
								Collected
							</Text>
							<Text
								style={[
									styles.summaryValue,
									styles.completionCount,
									{ color: t.text.primary },
								]}
							>
								{ownedPadded} / {setSizePadded}
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
						<View style={styles.completionRight}>
							<View style={styles.summaryRight}>
								<Text
									style={[styles.summaryLabel, { color: t.text.secondary }]}
								>
									Progress
								</Text>
								<Text
									style={[
										styles.summaryValue,
										styles.completionCount,
										{ color: t.text.primary },
									]}
								>
									{completionPct}%
								</Text>
							</View>
							{!ownedOnly && (
								<SymbolView
									name="chevron.right"
									size={14}
									tintColor={t.text.tertiary}
									weight="semibold"
								/>
							)}
						</View>
					</View>
					<View
						style={[
							styles.completionTrack,
							{ backgroundColor: t.glass.elevatedFill },
						]}
					>
						<View
							style={[
								styles.completionFill,
								{
									backgroundColor: t.accent,
									width: `${
										setSize > 0
											? Math.min((ownedInSet / setSize) * 100, 100)
											: 0
									}%`,
								},
							]}
						/>
					</View>
				</Pressable>
				</Animated.View>
			)}
		</>
	);

	// One-time "Tap and hold me!" nudge on the first card.
	const { show: showHint, dismiss: dismissHint } = useTapHoldHint(
		cards.length > 0,
	);

	const renderItem = useCallback(
		({ item, index }: { item: SetItem; index: number }) => {
			// Item-derived, not mode-derived: both lists stay mounted, so the
			// hidden one renders with a stale mode flag otherwise.
			const isSealedItem = !("number" in item);
			const image = getCardImage(item, undefined, "small") ?? "";
			const cardNumber = isSealedItem ? "" : getCardNumber(item);
			const displayName = isSealedItem ? item.name : getCardDisplayName(item);
			const showPlaceholder = !image || failedImages.has(item.id);
			// In value mode, open the item on the variant that drove its sort
			// position so the hero price matches the ranking.
			const priceInfo = bestMarketPrice(item, isSealedItem ? "U" : "NM");
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
			// Animate in only on a card's first appearance PER GENERATION —
			// recycled cells never replay the fade, while a sort/mode change
			// (gen bump) makes every key fresh so the waterfall replays.
			const guardKey = `${isSealedItem ? sealedGen : cardGen}-${item.id}`;
			const firstAppearance = !animatedIdsRef.current.has(guardKey);
			if (firstAppearance) animatedIdsRef.current.add(guardKey);
			return (
				<Animated.View
					entering={
						firstAppearance
							? cardWaterfall(index)
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
							productType: isSealedItem ? "sealed" : "card",
							variant: quickVariant,
							condition: quickCondition,
						}}
						onPress={() => {
							Keyboard.dismiss();
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							prefetchDetail(isSealedItem ? "sealed" : "card", item.id);
							router.push({
								pathname: isSealedItem ? "/(sealed)/[id]" : "/(card)/[id]",
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
									{ backgroundColor: t.glass.elevatedFill },
								]}
							>
								<SymbolView
									name={isSealedItem ? "shippingbox" : "photo"}
									size={24}
									tintColor={t.text.tertiary}
									weight="regular"
								/>
								<Text
									style={[styles.placeholderName, { color: t.text.primary }]}
									numberOfLines={2}
								>
									{displayName}
								</Text>
								{!!cardNumber && (
									<Text
										style={[
											styles.placeholderNumber,
											{ color: t.text.secondary },
										]}
									>
										#{cardNumber}
									</Text>
								)}
							</View>
						) : isSealedItem ? (
							// Sealed art comes in arbitrary aspect ratios — inset it on
							// the tile background so the tile keeps the card silhouette.
							<View
								style={[
									styles.cardImage,
									styles.sealedTile,
									{ backgroundColor: t.glass.elevatedFill },
								]}
							>
								<CardImage
									uri={image}
									style={styles.sealedImage}
									backgroundColor="transparent"
									shimmerColor={t.glass.elevatedFill}
									onError={() => {
										setFailedImages((prev) => new Set(prev).add(item.id));
									}}
								/>
							</View>
						) : (
							<CardImage
								uri={image}
								style={styles.cardImage}
								backgroundColor={t.glass.elevatedFill}
								shimmerColor={t.glass.elevatedFill}
								onError={() => {
									setFailedImages((prev) => new Set(prev).add(item.id));
								}}
							/>
						)}
						{/* Footer: name left, collector number right. */}
						<View style={styles.cellFooter}>
							<Text
								style={[styles.cellName, { color: t.text.primary }]}
								numberOfLines={1}
							>
								{displayName}
							</Text>
							{!!cardNumber && (
								<Text style={[styles.cellNumber, { color: t.text.primary }]}>
									{cardNumber}
								</Text>
							)}
						</View>
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
			t,
			name,
			failedImages,
			isValueSort,
			cardGen,
			sealedGen,
			prefetchDetail,
			showHint,
			dismissHint,
		],
	);

	// One list drives both the iOS 26 toolbar menu and the legacy FAB sheet.
	// Sealed products have no collector numbers, so those sorts drop out.
	const sortActions = (
		isSealedMode
			? (["nameAsc", "valueDesc", "valueAsc"] as SortOption[])
			: ([
					"number",
					"numberDesc",
					"nameAsc",
					"valueDesc",
					"valueAsc",
				] as SortOption[])
	).map((o) => ({
		label: SORT_LABELS[o],
		isOn: sortBy === o,
		onPress: () => handleSortChange(o),
	}));

	return (
		<>
			<Stack.Screen
				options={{
					headerTitle: ownedOnly ? "Collected" : (name ?? "Set"),
					headerLeft: () => (
						<Pressable
							hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								router.back();
							}}
						>
							<SymbolView
								name="xmark"
								size={20}
								tintColor={t.accentOn}
								weight="medium"
							/>
						</Pressable>
					),
				}}
			/>

			<View
				style={styles.container}
				onTouchStart={() => Keyboard.dismiss()}
			>
				{/* Deep-water gradient — the one background every screen shares. */}
				<LinearGradient
					colors={t.background.colors}
					locations={t.background.locations}
					pointerEvents="none"
					style={StyleSheet.absoluteFill}
				/>
				{isError ? (
					<ErrorState title="Couldn't load set" onRetry={() => refetch()} />
				) : (
					<>
						{/* BOTH lists stay mounted; the mode toggle is a visibility
						    flip. Each list pays its cell-mount cost once (native
						    context-menu host per card cell made rebuild-on-toggle
						    slow) and keeps its own scroll position. */}
						<View
							style={[
								StyleSheet.absoluteFill,
								isSealedMode && styles.layerHidden,
							]}
							pointerEvents={isSealedMode ? "none" : "auto"}
						>
							{showCardsSkeleton ? (
								<FlatList
									data={SKELETON_DATA}
									keyExtractor={(item) => item.id}
									numColumns={COLUMNS}
									renderItem={() => (
										<SkeletonCard color={t.glass.elevatedFill} />
									)}
									ListHeaderComponent={summaryHeader}
									contentContainerStyle={[
										styles.grid,
										{ paddingTop: topPadding },
									]}
									columnWrapperStyle={styles.row}
									scrollEnabled={false}
								/>
							) : cardItems.length === 0 ? (
								// The header (mode picker + summary) must survive the
								// empty state, or a no-match filter strands the user
								// with no way to toggle modes.
								<View style={[styles.grid, styles.emptyContainer, { paddingTop: topPadding }]}>
									{summaryHeader}
									<View style={styles.emptyState}>
										<SymbolView
											name={
												ownedOnly && !debouncedFilter
													? "square.stack.3d.up.slash"
													: "magnifyingglass"
											}
											size={44}
											tintColor={t.text.tertiary}
											weight="regular"
										/>
										<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
											{ownedOnly && !debouncedFilter
												? "No cards collected yet"
												: "No matching cards"}
										</Text>
									</View>
								</View>
							) : (
								<FlatList
									// Remounts when cards becomes the visible mode → waterfall.
									key={`cards-${cardGen}`}
									ref={cardListRef}
									data={cardItems}
									keyExtractor={(item) => item.id}
									numColumns={COLUMNS}
									renderItem={renderItem}
									ListHeaderComponent={summaryHeader}
									contentContainerStyle={[
										styles.grid,
										{ paddingTop: topPadding },
									]}
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
						{/* Sealed layer mounts on first visit and stays. */}
						{sealedVisited && !ownedOnly && (
							<View
								style={[
									StyleSheet.absoluteFill,
									!isSealedMode && styles.layerHidden,
								]}
								pointerEvents={isSealedMode ? "auto" : "none"}
							>
								{showSealedSkeleton ? (
									<FlatList
										data={SKELETON_DATA}
										keyExtractor={(item) => item.id}
										numColumns={COLUMNS}
										renderItem={() => (
											<SkeletonCard color={t.glass.elevatedFill} />
										)}
										ListHeaderComponent={summaryHeader}
										contentContainerStyle={[
											styles.grid,
											{ paddingTop: topPadding },
										]}
										columnWrapperStyle={styles.row}
										scrollEnabled={false}
									/>
								) : sealedItems.length === 0 ? (
									// Header survives the empty state here too — losing the
									// picker in sealed mode stranded the user entirely.
									<View style={[styles.grid, styles.emptyContainer, { paddingTop: topPadding }]}>
										{summaryHeader}
										<View style={styles.emptyState}>
											<SymbolView
												name="magnifyingglass"
												size={44}
												tintColor={t.text.tertiary}
												weight="regular"
											/>
											<Text
												style={[styles.emptyTitle, { color: t.text.primary }]}
											>
												No matching products
											</Text>
										</View>
									</View>
								) : (
									<FlatList
										// Remounts when sealed becomes visible → waterfall.
										key={`sealed-${sealedGen}`}
										ref={sealedListRef}
										data={sealedItems}
										keyExtractor={(item) => item.id}
										numColumns={COLUMNS}
										renderItem={renderItem}
										ListHeaderComponent={summaryHeader}
										contentContainerStyle={[
											styles.grid,
											{ paddingTop: topPadding },
										]}
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
						)}
					</>
				)}
				{/* Our floating search bar — sort menu embedded as the trailing
				    button. One code path for every iOS version. */}
				<FloatingSearchBar
					value={filterQuery}
					onChangeText={setFilterQuery}
					placeholder={
						isSealedMode ? "Search products..." : "Search this set..."
					}
					menuIcon="arrow.up.arrow.down"
					menuActions={sortActions}
				/>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	// Hidden-but-mounted list layer: opacity (not display:none, which gives
	// VirtualizedList a zero viewport and under-renders on reshow).
	layerHidden: {
		opacity: 0,
	},
	modePickerWrap: {
		marginBottom: 10,
	},
	// Set info bar — glass card: RELEASED / logo / CARDS.
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 12,
		marginBottom: 12,
	},
	summarySide: {
		flex: 1,
	},
	summaryLogo: {
		flex: 1.2,
		height: 62,
	},
	summaryRight: {
		alignItems: "flex-end",
	},
	summaryLabel: {
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 1,
		textTransform: "uppercase",
		marginBottom: 3,
	},
	summaryValue: {
		fontSize: 20,
		fontWeight: "800",
	},
	// Set completion — glass card: COLLECTED count / PROGRESS % / fill bar.
	completionCard: {
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 12,
		marginBottom: 20,
		gap: 10,
	},
	completionTopRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	// Sides flex so the centered logo balances, like the info bar this
	// card replaces in card mode.
	completionRight: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: 8,
	},
	completionCount: {
		fontVariant: ["tabular-nums"],
	},
	completionTrack: {
		height: 4,
		borderRadius: 2,
		overflow: "hidden",
	},
	completionFill: {
		height: "100%",
		borderRadius: 2,
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
		borderRadius: 9,
	},
	cellFooter: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 4,
		marginTop: 5,
		paddingHorizontal: 2,
	},
	cellName: {
		flex: 1,
		fontSize: 11,
		fontWeight: "600",
	},
	cellNumber: {
		fontSize: 11,
		fontWeight: "600",
		opacity: 0.5,
		fontVariant: ["tabular-nums"],
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
	// Wraps header + empty state so the mode picker stays reachable.
	emptyContainer: {
		flex: 1,
		paddingBottom: 0,
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
