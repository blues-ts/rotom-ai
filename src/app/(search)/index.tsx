import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Dimensions,
	FlatList,
	Keyboard,
	Pressable,
	StyleSheet,
	Text,
	View,
	type ViewToken,
} from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	runOnJS,
	runOnUI,
	type ScrollHandlerProcessed,
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { cardWaterfall } from "@/lib/waterfall";
import { SymbolView } from "expo-symbols";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, useRiverTheme } from "@/constants/theme";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import { useApi } from "@/lib/axios";
import { usePrefetchDetail } from "@/hooks/usePrefetchDetail";
import { usePrefetchSetImages } from "@/hooks/usePrefetchSetImages";
import {
	extractSearchLanguage,
	getCardDisplayName,
	getCardImage,
	getCardNumber,
	getConditionOptions,
	getExpansionDisplayName,
	getVariantNames,
} from "@/lib/scrydex";
import CardImage from "@/components/CardImage";
import FloatingSearchBar from "@/components/FloatingSearchBar";
import HeaderFadeScrim from "@/components/HeaderFadeScrim";
import { directionRow, SORT_OPTION_LABELS } from "@/lib/sortLabels";
import type { LegacyMenuAction } from "@/components/LegacyToolbarMenu";
import SegmentedChips from "@/components/SegmentedChips";
import CardPressable from "@/components/CardPressable";
import CardContextMenu from "@/components/CardContextMenu";
import TapHoldHintOverlay from "@/components/TapHoldHintOverlay";
import { useTapHoldHint } from "@/hooks/useTapHoldHint";
import ErrorState from "@/components/ErrorState";
import PokedexBrowser from "@/components/PokedexBrowser";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { CATALOG_SETS_KEY } from "@/hooks/usePrefetchExpansions";
import HeaderIconButton, {
	HeaderButtonGroup,
} from "@/components/HeaderIconButton";
import {
	getCatalogSets,
	searchCatalogCards,
	searchCatalogSealed,
	catalogSetToExpansion,
	catalogCardToScrydex,
	catalogSealedToScrydex,
} from "@/lib/api/catalog";
import type {
	ApiListResponse,
	ScrydexCard,
	ScrydexExpansion,
	ScrydexSealedProduct,
} from "@/types/scrydex";

type SearchMode = "cards" | "sealed";
type SetsLanguage = "EN" | "JA";
type BrowseMode = "sets" | "pokedex";
// Catalog order is newest-release-first; "oldest" walks it backwards and the
// alpha pair re-sorts every set by display name, either direction.
type SetsSort = "newest" | "oldest" | "alpha" | "alphaDesc";
// "grid" = the 2-up logo tiles; "list" = one compact row per set.
type SetsView = "grid" | "list";

// Sets grouped by era (series) — headers + pre-chunked rows of two (grid
// view) or one item per set (list view), same headers-in-items shape as the
// Pokédex's generation grouping.
type SetListItem =
	| { key: string; kind: "header"; title: string }
	| { key: string; kind: "row"; sets: ScrydexExpansion[] }
	| { key: string; kind: "set"; set: ScrydexExpansion };

// JA expansions don't index is_online_only:false (same quirk as JA cards),
// so both use the negation form to drop TCG Pocket sets.

interface CardResult {
	id: string;
	name: string;
	image: string;
	cardNumber: string;
	kind: "card" | "sealed";
	// The card's default variant/condition (what the card-detail screen picks),
	// so a quick-add stores a config that actually matches and shows controls.
	variant: string;
	condition: string;
}

const SKELETON_DATA = Array.from({ length: 15 }, (_, i) => ({
	id: `skeleton-${i}`,
}));

const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
// The visible chip bar (browse/language or search-scope toggles) sits between
// the header and the content; grids pad down past it. The chips themselves
// are ~36pt tall — this is intentionally snug (the first era/generation
// header carries its own 16pt top margin).
const CHIP_BAR_H = 36;
const screenWidth = Dimensions.get("window").width;
const imageWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const imageHeight = imageWidth * 1.4;
const setTileWidth = (screenWidth - PADDING * 2 - GAP) / 2;

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

function SkeletonSetTile({ color }: { color: string }) {
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
		<Animated.View style={[styles.setTileSkeleton, animatedStyle]}>
			<View style={[styles.setLogoSkeleton, { backgroundColor: color }]} />
			<View style={[styles.setNameSkeleton, { backgroundColor: color }]} />
		</Animated.View>
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

	const style1 = useAnimatedStyle(() => ({
		transform: [{ translateY: dot1.value }],
	}));
	const style2 = useAnimatedStyle(() => ({
		transform: [{ translateY: dot2.value }],
	}));
	const style3 = useAnimatedStyle(() => ({
		transform: [{ translateY: dot3.value }],
	}));

	return (
		<View style={styles.spinnerRow}>
			<Animated.View style={[styles.dot, { backgroundColor: color }, style1]} />
			<Animated.View style={[styles.dot, { backgroundColor: color }, style2]} />
			<Animated.View style={[styles.dot, { backgroundColor: color }, style3]} />
		</View>
	);
}

// memo: the search screen re-renders on every keystroke / chip flip / scroll
// fade — this skips the whole browser pass when its props didn't change.
const SetsBrowser = memo(function SetsBrowser({
	mode,
	language,
	sort,
	view,
	topPadding,
	onScroll,
}: {
	mode: SearchMode;
	language: SetsLanguage;
	sort: SetsSort;
	view: SetsView;
	topPadding: number;
	onScroll?: ScrollHandlerProcessed<Record<string, unknown>>;
}) {
	const t = useRiverTheme();
	const api = useApi();
	const prefetchSetImages = usePrefetchSetImages();

	// Sets come entirely from the local backend catalog (no Scrydex). Shares the
	// query key warmed at launch (usePrefetchExpansions), so the grid is instant.
	const {
		data: allSets,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: CATALOG_SETS_KEY,
		queryFn: () => getCatalogSets(api),
		staleTime: 24 * 60 * 60 * 1000,
	});

	const filtered = useMemo(() => {
		const code = language === "EN" ? "en" : "ja";
		return (allSets ?? [])
			.filter(
				(s) => (s.languageCode ?? "").toLowerCase() === code && !s.isOnlineOnly,
			)
			.map(catalogSetToExpansion);
	}, [allSets, language]);

	// Grouped by ERA (the expansion's series — "Scarlet & Violet", "Sword &
	// Shield", …), same headers-plus-chunked-rows shape as the Pokédex's
	// generations: headers can't be interleaved into a numColumns FlatList,
	// so each list item is a full-width header, one pre-chunked row of two
	// tiles (grid view), or a single compact row (list view). The catalog is
	// newest-first, so eras appear in the order of their newest set — or,
	// sorted oldest-first, in the order of their oldest — and never share a
	// row across eras.
	const listData = useMemo(() => {
		const alphabetical = () => {
			const sorted = [...filtered].sort((a, b) =>
				getExpansionDisplayName(a).localeCompare(getExpansionDisplayName(b)),
			);
			return sort === "alphaDesc" ? sorted.reverse() : sorted;
		};
		const ordered =
			sort === "newest"
				? filtered
				: sort === "oldest"
					? [...filtered].reverse()
					: alphabetical();
		const items: SetListItem[] = [];
		const pushSets = (sets: ScrydexExpansion[]) => {
			if (view === "list") {
				for (const s of sets) {
					items.push({ key: `set-${s.id}`, kind: "set", set: s });
				}
			} else {
				for (let i = 0; i < sets.length; i += 2) {
					items.push({
						key: `row-${sets[i].id}`,
						kind: "row",
						sets: sets.slice(i, i + 2),
					});
				}
			}
		};
		// Name order is one flat run across every set — no era headers. The
		// release sorts group by era, in first-encounter order (the era of
		// its newest/oldest set), with "Other" (sets with no series) always
		// sunk to the bottom.
		if (sort === "alpha" || sort === "alphaDesc") {
			pushSets(ordered);
			return items;
		}
		const groups = new Map<string, ScrydexExpansion[]>();
		for (const s of ordered) {
			const era = s.series || "Other";
			const g = groups.get(era);
			if (g) g.push(s);
			else groups.set(era, [s]);
		}
		const eras = [...groups.keys()].sort((a, b) =>
			a === "Other" ? 1 : b === "Other" ? -1 : 0,
		);
		for (const era of eras) {
			items.push({ key: `era-${era}`, kind: "header", title: era });
			pushSets(groups.get(era)!);
		}
		return items;
	}, [filtered, sort, view]);

	// As set tiles scroll into view, warm that set's card images so opening it is
	// instant. Guarded so each set is prefetched at most once per mount. Refs keep
	// the handler/config stable, which FlatList requires.
	const prefetchedRef = useRef<Set<string>>(new Set());
	const onViewableItemsChanged = useRef(
		({ viewableItems }: { viewableItems: ViewToken[] }) => {
			for (const v of viewableItems) {
				const row = v.item as SetListItem | undefined;
				if (!row || row.kind === "header") continue;
				const sets = row.kind === "row" ? row.sets : [row.set];
				for (const s of sets) {
					if (!prefetchedRef.current.has(s.id)) {
						prefetchedRef.current.add(s.id);
						prefetchSetImages(s.id);
					}
				}
			}
		},
	).current;
	const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

	// Tracks tiles that have already played their entrance animation. FlatList
	// recycles cells while scrolling and `entering` re-fires on every mount, so
	// without this guard the fade-in replays on every scroll-back and janks the
	// grid. The guard is a FRESH set per list context (language/sort/view) —
	// memoized during render, so it's already empty when the remounted list
	// (keyed on the same context) renders its first cells, and every switch
	// replays the waterfall. A single persistent set would remember keys from
	// earlier visits and go quiet on the way back.
	const listKey = `${language}-${view}-${sort}`;
	// eslint-disable-next-line react-hooks/exhaustive-deps -- listKey IS the cache key
	const animatedIds = useMemo(() => new Set<string>(), [listKey]);

	const openSet = useCallback(
		(item: ScrydexExpansion) => {
			Keyboard.dismiss();
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			// Data/images are already warmed when the tile scrolled into view
			// (onViewableItemsChanged). Re-prefetching here would fire
			// Image.prefetch for the whole set right as the screen transitions
			// in, making the navigation choppy — so just navigate.
			router.push({
				pathname: "/set-detail",
				params: {
					id: item.id,
					name: getExpansionDisplayName(item),
					mode,
					releaseDate: item.release_date ?? "",
					total: item.total !== undefined ? String(item.total) : "",
					logo: item.logo ?? "",
				},
			});
		},
		[mode],
	);

	const renderSetTile = useCallback(
		(item: ScrydexExpansion) => (
			<CardPressable key={item.id} onPress={() => openSet(item)}>
				<View
					style={[
						styles.setTile,
						{
							backgroundColor: t.glass.surfaceFill,
							borderColor: t.glass.surfaceBorder,
						},
						t.glass.shadow,
					]}
				>
					<View style={styles.setLogoBox}>
						{item.logo ? (
							<Image
								source={{ uri: item.logo }}
								style={styles.setLogo}
								contentFit="contain"
								transition={150}
								cachePolicy="memory-disk"
							/>
						) : (
							<SymbolView
								name="square.stack"
								size={26}
								tintColor={t.text.tertiary}
								weight="regular"
							/>
						)}
					</View>
					<Text
						style={[styles.setName, { color: t.text.primary }]}
						numberOfLines={1}
					>
						{getExpansionDisplayName(item)}
					</Text>
				</View>
			</CardPressable>
		),
		[t, openSet],
	);

	// Compact list view: one glass row per set — small logo, name, release
	// year — the same tap target as the tile.
	const renderSetListRow = useCallback(
		(item: ScrydexExpansion) => (
			<CardPressable key={item.id} onPress={() => openSet(item)}>
				<View
					style={[
						styles.setListRow,
						{
							backgroundColor: t.glass.surfaceFill,
							borderColor: t.glass.surfaceBorder,
						},
						t.glass.shadow,
					]}
				>
					<View style={styles.setListLogoBox}>
						{item.logo ? (
							<Image
								source={{ uri: item.logo }}
								style={styles.setListLogo}
								contentFit="contain"
								transition={150}
								cachePolicy="memory-disk"
							/>
						) : (
							<SymbolView
								name="square.stack"
								size={16}
								tintColor={t.text.tertiary}
								weight="regular"
							/>
						)}
					</View>
					<Text
						style={[styles.setListName, { color: t.text.primary }]}
						numberOfLines={1}
					>
						{getExpansionDisplayName(item)}
					</Text>
					{!!item.release_date && (
						<Text style={[styles.setListYear, { color: t.text.secondary }]}>
							{item.release_date.slice(0, 4)}
						</Text>
					)}
					<SymbolView
						name="chevron.right"
						size={12}
						tintColor={t.text.tertiary}
						weight="semibold"
					/>
				</View>
			</CardPressable>
		),
		[t, openSet],
	);

	const renderSet = useCallback(
		({ item, index }: { item: SetListItem; index: number }) => {
			const firstAppearance = !animatedIds.has(item.key);
			if (firstAppearance) animatedIds.add(item.key);
			const entering = firstAppearance ? cardWaterfall(index) : undefined;
			if (item.kind === "header") {
				return (
					<Animated.View entering={entering} style={styles.eraHeader}>
						<Text style={[styles.eraTitle, { color: t.text.primary }]}>
							{item.title}
						</Text>
					</Animated.View>
				);
			}
			if (item.kind === "set") {
				return (
					<Animated.View entering={entering} style={styles.setListItem}>
						{renderSetListRow(item.set)}
					</Animated.View>
				);
			}
			return (
				<Animated.View entering={entering} style={styles.setRow}>
					{item.sets.map(renderSetTile)}
				</Animated.View>
			);
		},
		[t, renderSetTile, renderSetListRow, animatedIds],
	);

	if (isError) {
		return <ErrorState title="Couldn't load sets" onRetry={() => refetch()} />;
	}

	if (isLoading) {
		return (
			<FlatList
				data={Array.from({ length: 12 }, (_, i) => ({ id: `s-${i}` }))}
				keyExtractor={(item) => item.id}
				numColumns={2}
				renderItem={() => <SkeletonSetTile color={t.glass.elevatedFill} />}
				contentContainerStyle={[styles.grid, { paddingTop: topPadding }]}
				columnWrapperStyle={styles.row}
				scrollEnabled={false}
			/>
		);
	}

	if (filtered.length === 0) {
		return (
			<View style={styles.emptyState}>
				<SymbolView
					name="magnifyingglass"
					size={44}
					tintColor={t.text.tertiary}
					weight="regular"
				/>
				<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
					No sets found
				</Text>
			</View>
		);
	}

	return (
		<Animated.FlatList
			// Context swaps (language, sort, grid ⇄ list) remount the list —
			// recycled cells never mix row shapes, and `entering` (a mount
			// animation) gets a fresh mount to fire on.
			key={listKey}
			data={listData}
			keyExtractor={(item) => item.key}
			renderItem={renderSet}
			// Animated handler — the chip-bar fade math runs on the UI thread.
			onScroll={onScroll}
			scrollEventThrottle={16}
			onViewableItemsChanged={onViewableItemsChanged}
			viewabilityConfig={viewabilityConfig}
			// Name order has no era headers, so add the 16pt the first header's
			// own top margin normally provides below the chip bar.
			contentContainerStyle={[
				styles.grid,
				{
					paddingTop:
						topPadding + (sort === "alpha" || sort === "alphaDesc" ? 16 : 0),
				},
			]}
			showsVerticalScrollIndicator={false}
			keyboardDismissMode="on-drag"
			keyboardShouldPersistTaps="handled"
			removeClippedSubviews
			initialNumToRender={8}
			maxToRenderPerBatch={6}
			windowSize={7}
		/>
	);
});

export default function Search() {
	const t = useRiverTheme();
	const { isPro } = useRevenueCat();
	const insets = useSafeAreaInsets();
	const api = useApi();
	const prefetchDetail = usePrefetchDetail();
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [mode, setMode] = useState<SearchMode>("cards");
	const [setsLanguage, setSetsLanguage] = useState<SetsLanguage>("EN");
	// What the browse area shows while the search bar is empty: the sets grid
	// or the full Pokédex.
	const [browse, setBrowse] = useState<BrowseMode>("sets");
	const [setsSort, setSetsSort] = useState<SetsSort>("newest");
	const [setsView, setSetsView] = useState<SetsView>("grid");
	// The dex's natural order is ascending dex number — "oldest" first.
	const [dexSort, setDexSort] = useState<SetsSort>("oldest");
	const [dexView, setDexView] = useState<SetsView>("grid");
	const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

	// Debounce search input
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQuery(searchQuery);
		}, 400);
		return () => clearTimeout(timer);
	}, [searchQuery]);

	const {
		data,
		isLoading,
		isError,
		refetch,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useInfiniteQuery<ApiListResponse<ScrydexCard | ScrydexSealedProduct>>({
		queryKey: ["searchCards", mode, debouncedQuery, setsLanguage],
		queryFn: async ({ pageParam }) => {
			const page = pageParam as number;
			const toggleLang = setsLanguage === "JA" ? "ja" : "en";
			// All search metadata comes from the local catalog — Scrydex only
			// serves prices now. A standalone "jp"/"en" typed in the query wins
			// over the chip's language toggle.
			const { rest, language } = extractSearchLanguage(debouncedQuery);
			if (mode === "sealed") {
				// Sealed mode is still Pro-gated in handleModeChange; the query
				// itself is catalog-backed like everything else.
				const res = await searchCatalogSealed(api, {
					q: rest,
					page,
					pageSize: 30,
					language: language ?? toggleLang,
				});
				return {
					data: res.data.map(catalogSealedToScrydex),
					page: res.page,
					page_size: res.pageSize,
					total_count: res.total,
				} as ApiListResponse<ScrydexCard | ScrydexSealedProduct>;
			}
			const res = await searchCatalogCards(api, {
				q: rest,
				page,
				pageSize: 30,
				language: language ?? toggleLang,
			});
			return {
				data: res.data.map(catalogCardToScrydex),
				page: res.page,
				page_size: res.pageSize,
				total_count: res.total,
			} as ApiListResponse<ScrydexCard | ScrydexSealedProduct>;
		},
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.page * lastPage.page_size < lastPage.total_count
				? lastPage.page + 1
				: undefined,
		// In Pokédex mode the search bar filters the dex list instead — no
		// card search fires at all.
		enabled: browse !== "pokedex" && debouncedQuery.trim().length > 0,
	});

	const cards = useMemo<CardResult[]>(
		() =>
			data?.pages.flatMap((p) =>
				p.data.map((item) => {
					const isCard = "number" in item;
					// Default variant/condition the card-detail screen would pick, so a
					// quick-add's stored config matches and the controls appear.
					const variant = getVariantNames(item)[0] ?? "normal";
					const condition = isCard
						? (getConditionOptions(item, variant)[0] ?? "NM")
						: "NM";
					return {
						id: item.id,
						// Japanese cards display their English translation when available
						name: isCard ? getCardDisplayName(item) : item.name,
						image: getCardImage(item, undefined, "small") ?? "",
						// Sealed products have no card number
						cardNumber: isCard ? getCardNumber(item) : "",
						kind: (isCard ? "card" : "sealed") as CardResult["kind"],
						variant,
						condition,
					};
				}),
			) ?? [],
		[data],
	);

	// Keep a snapshot of the last non-empty results so we can fade them out
	const [displayCards, setDisplayCards] = useState<CardResult[]>([]);
	const [isClearing, setIsClearing] = useState(false);
	const clearOpacity = useSharedValue(1);

	// Results waterfall in once per RESULT SET — cleared on a new search or a
	// Cards ⇄ Sealed scope switch so each fresh set cascades in (same feel as
	// the sets/Pokédex/set-detail grids); recycled cells never replay.
	const animatedIdsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		animatedIdsRef.current = new Set();
	}, [debouncedQuery, mode]);

	useEffect(() => {
		if (cards.length > 0) {
			setDisplayCards(cards);
			setIsClearing(false);
			clearOpacity.value = 1;
		} else if (displayCards.length > 0 && !searchQuery.trim()) {
			// Search was cleared — fade out
			setIsClearing(true);
			clearOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
				if (finished) {
					runOnJS(setDisplayCards)([]);
					runOnJS(setIsClearing)(false);
				}
			});
		} else if (!isClearing && !isLoading) {
			// Empty AND settled — a real no-results state. While a scope/mode
			// swap is merely LOADING, the previous results stay on screen and
			// swap in place, instead of unmounting into a skeleton flash.
			setDisplayCards([]);
		}
	}, [cards, searchQuery, isLoading]);

	const clearAnimatedStyle = useAnimatedStyle(() => ({
		opacity: clearOpacity.value,
	}));

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) {
			fetchNextPage();
		}
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	// One-time "Tap and hold me!" nudge on the first card.
	const { show: showTapHint, dismiss: dismissTapHint } = useTapHoldHint(
		displayCards.length > 0,
	);

	const renderItem = useCallback(
		({ item, index }: { item: CardResult; index: number }) => {
			const showPlaceholder = !item.image || failedImages.has(item.id);
			const firstAppearance = !animatedIdsRef.current.has(item.id);
			if (firstAppearance) animatedIdsRef.current.add(item.id);
			return (
				<Animated.View
					entering={firstAppearance ? cardWaterfall(index) : undefined}
				>
					<CardContextMenu
						card={{
							cardId: item.id,
							cardName: item.name,
							cardNumber: item.cardNumber || undefined,
							cardImageUrl: item.image || undefined,
							productType: item.kind === "sealed" ? "sealed" : "card",
							variant: item.variant,
							condition: item.condition,
						}}
						onPress={() => {
							Keyboard.dismiss();
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							prefetchDetail(item.kind, item.id);
							const base = item.kind === "sealed" ? "/(sealed)" : "/(card)";
							// Pass the cached thumbnail so the detail shows the image
							// instantly instead of behind the data-query skeleton.
							const imageParam = item.image
								? `&image=${encodeURIComponent(item.image)}`
								: "";
							router.push(
								`${base}/${item.id}?name=${encodeURIComponent(item.name)}${imageParam}`,
							);
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
									name="photo"
									size={24}
									tintColor={t.text.tertiary}
									weight="regular"
								/>
								<Text
									style={[styles.placeholderName, { color: t.text.primary }]}
									numberOfLines={2}
								>
									{item.name}
								</Text>
								{item.cardNumber && (
									<Text
										style={[
											styles.placeholderNumber,
											{ color: t.text.secondary },
										]}
									>
										#{item.cardNumber}
									</Text>
								)}
							</View>
						) : item.kind === "sealed" ? (
							// Sealed art comes in arbitrary aspect ratios — inset it on the
							// tile background so the tile keeps the same card silhouette.
							<View
								style={[
									styles.cardImage,
									styles.sealedTile,
									{ backgroundColor: t.glass.elevatedFill },
								]}
							>
								<CardImage
									uri={item.image}
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
								uri={item.image}
								style={styles.cardImage}
								backgroundColor={t.glass.elevatedFill}
								shimmerColor={t.glass.elevatedFill}
								onError={() => {
									setFailedImages((prev) => new Set(prev).add(item.id));
								}}
							/>
						)}
					</CardContextMenu>
					{index === 0 && showTapHint && (
						<TapHoldHintOverlay
							width={imageWidth}
							height={imageHeight}
							onDismiss={dismissTapHint}
						/>
					)}
				</Animated.View>
			);
		},
		[
			t,
			failedImages,
			prefetchDetail,
			showTapHint,
			dismissTapHint,
		],
	);

	// Pokédex mode: the browse area stays up while typing (the text filters
	// the dex client-side); every card-search state is suppressed.
	const dexBrowsing = browse === "pokedex";
	// Search-scope chips (Cards|Sealed) replace the browse chips while a card
	// search is active; the header collapses then on iOS 26, so the bar rides
	// up with the content.
	const scopeActive = !dexBrowsing && !!searchQuery.trim();
	// Actively filtering the dex — the Sets|Pokédex toggle fades out until
	// the query clears.
	const dexFiltering = dexBrowsing && !!searchQuery.trim();
	// Both segmented controls stay mounted, stacked, sharing one footprint —
	// these opacities crossfade them into each other (browse ⇄ scope), and
	// fade browse out entirely while filtering the dex. scopeOpacity ALSO
	// drives the bar's position: entering search collapses the header, so the
	// bar glides up in the same motion instead of teleporting (which read as
	// a hard cut over the crossfade).
	const browseOpacity = useSharedValue(1);
	const scopeOpacity = useSharedValue(0);
	const browseVisible = !scopeActive && !dexFiltering;
	useEffect(() => {
		browseOpacity.value = withTiming(browseVisible ? 1 : 0, { duration: 200 });
		scopeOpacity.value = withTiming(scopeActive ? 1 : 0, { duration: 200 });
	}, [browseVisible, scopeActive, browseOpacity, scopeOpacity]);
	const browseChipsStyle = useAnimatedStyle(() => ({
		opacity: browseOpacity.value,
	}));
	const scopeChipsStyle = useAnimatedStyle(() => ({
		opacity: scopeOpacity.value,
	}));
	// Static: the floating X/camera row persists through search (that's the
	// point of it), so the header collapse no longer frees the space the bar
	// used to glide into.
	// Same offset on every iOS version — the search field is the
	// FloatingSearchBar, so there's no header-attached bar to clear.
	const chipBarTop = insets.top + 54;

	// Safari-style: the chip bar fades out on scroll-down and returns on any
	// scroll-up (or near the top), so switching modes is one flick away. The
	// direction math and opacity run entirely on the UI thread (animated
	// scroll handler + shared values); JS only hears about the rare
	// hide ⇄ show flips, for pointerEvents.
	const [chipsScrolledAway, setChipsScrolledAway] = useState(false);
	const lastScrollY = useSharedValue(0);
	const chipsAway = useSharedValue(0);
	const chipsScrollOpacity = useSharedValue(1);
	const browseScrollHandler = useAnimatedScrollHandler((e) => {
		const y = e.contentOffset.y;
		const dy = y - lastScrollY.value;
		lastScrollY.value = y;
		let next: 0 | 1 | null = null;
		if (y <= 20) next = 0;
		else if (dy > 4) next = 1;
		else if (dy < -4) next = 0;
		if (next !== null && next !== chipsAway.value) {
			chipsAway.value = next;
			chipsScrollOpacity.value = withTiming(next === 1 ? 0 : 1, {
				duration: 180,
			});
			runOnJS(setChipsScrolledAway)(next === 1);
		}
	});
	// Fresh list contexts (mode switch, typing) reset the fade. The shared
	// values are UI-thread-owned (the scroll worklet writes them), so the
	// reset happens there too via runOnUI.
	const resetChipsFade = useCallback(() => {
		setChipsScrolledAway(false);
		runOnUI(() => {
			lastScrollY.value = 0;
			chipsAway.value = 0;
			chipsScrollOpacity.value = withTiming(1, { duration: 180 });
		})();
	}, [lastScrollY, chipsAway, chipsScrollOpacity]);
	const chipBarFadeStyle = useAnimatedStyle(() => ({
		opacity: chipsScrollOpacity.value,
	}));
	// One offset for every state now — with the button row persistent, search
	// results sit exactly where the browse grids do.
	const gridTop = insets.top + 56 + CHIP_BAR_H;
	// Results have no section header — add the same 16pt the sets grid's
	// first era header carries, so both start the same distance below the
	// chip bar.
	const resultsTop = gridTop + 16;
	const isSearching = !dexBrowsing && debouncedQuery.trim().length > 0;
	const showHint =
		dexBrowsing ||
		(!searchQuery.trim() && !isSearching && displayCards.length === 0);
	const showSkeleton = isSearching && isLoading && displayCards.length === 0;
	const showError = isSearching && isError && displayCards.length === 0;
	const showNoResults =
		isSearching &&
		!isLoading &&
		!isError &&
		cards.length === 0 &&
		displayCards.length === 0;

	// Sort + layout for the two browsers, in the search bar's trailing menu
	// (collection-detail's sort pattern). One shared option shape; the active
	// browser decides which state the sheet reads and writes. Hidden while
	// card-search results are on screen — they have their own ordering.
	const setsBrowsing = showHint && !dexBrowsing;
	const makeViewActions = (
		sort: SetsSort,
		setSort: (s: SetsSort) => void,
		view: SetsView,
		setView: (v: SetsView) => void,
		// What "newest"/"oldest" orders by here — release date for the sets
		// grid, national dex number for the Pokédex.
		recencyLabel: string,
	): LegacyMenuAction[] => [
		directionRow({
			label: recencyLabel,
			asc: "oldest" as const,
			desc: "newest" as const,
			current: sort,
			onSelect: setSort,
		}),
		directionRow({
			label: SORT_OPTION_LABELS.name,
			asc: "alpha" as const,
			desc: "alphaDesc" as const,
			current: sort,
			onSelect: setSort,
		}),
		{
			label: SORT_OPTION_LABELS.gridView,
			isOn: view === "grid",
			onPress: () => setView("grid"),
		},
		{
			label: SORT_OPTION_LABELS.listView,
			isOn: view === "list",
			onPress: () => setView("list"),
		},
	];
	const browserViewActions = dexBrowsing
		? makeViewActions(
				dexSort,
				setDexSort,
				dexView,
				setDexView,
				SORT_OPTION_LABELS.dexNumber,
			)
		: setsBrowsing
			? makeViewActions(
					setsSort,
					setSetsSort,
					setsView,
					setSetsView,
					SORT_OPTION_LABELS.released,
				)
			: undefined;

	// Chip-bar handlers — the old toolbar menu's actions, now one visible tap.
	// (SegmentedChips fires the tap haptic itself.)
	const handleBrowseChange = useCallback(
		(b: BrowseMode) => {
			setBrowse(b);
			resetChipsFade();
		},
		[resetChipsFade],
	);
	// Language applies to whichever browse is active: it filters the sets
	// grid AND the cards a Pokédex entry opens to.
	const handleLangToggle = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		setSetsLanguage((l) => (l === "EN" ? "JA" : "EN"));
	}, []);
	const handleModeChange = useCallback(
		(m: SearchMode) => {
			// Sealed pricing is a Pro feature (no free catalog data for it).
			if (m === "sealed" && !isPro) {
				void presentProPaywallIfNeeded();
				return;
			}
			setMode(m);
		},
		[isPro],
	);

	return (
		<>
			{/* Custom headerRight (not Stack.Toolbar.Button) so the button gets
			    the same glass underlay as every other header icon on iOS < 26;
			    the iOS 26 bar capsules it natively either way. */}
			<Stack.Screen
				options={{
					headerRight: () => (
						<HeaderButtonGroup>
							{/* Favorites — Pro-gated, like the scanner beside it. */}
							<HeaderIconButton
								onPress={() => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									if (!isPro) {
										void presentProPaywallIfNeeded();
										return;
									}
									router.push("/(favorites)");
								}}
							>
								<SymbolView
									name="star"
									size={20}
									tintColor={t.accentOn}
									weight="medium"
								/>
							</HeaderIconButton>
							<HeaderIconButton
								onPress={() => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									if (!isPro) {
										void presentProPaywallIfNeeded();
										return;
									}
									router.push("/(camera)");
								}}
							>
								<SymbolView
									name="camera.viewfinder"
									size={20}
									tintColor={t.accentOn}
									weight="medium"
								/>
							</HeaderIconButton>
						</HeaderButtonGroup>
					),
				}}
			/>

			{/* The search field is our FloatingSearchBar (no UISearchController).
			    Any touch on the content dismisses the keyboard (no-op when
			    it's already down). */}
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
				{/* Sets browser (or the Pokédex) is the default content until the
				    user types */}
				{showHint && (
					<Animated.View entering={FadeIn.duration(200)} style={{ flex: 1 }}>
						{browse === "pokedex" ? (
							<PokedexBrowser
								topPadding={gridTop}
								filteringTopPadding={gridTop}
								language={setsLanguage}
								filter={searchQuery}
								sort={dexSort}
								view={dexView}
								onScroll={browseScrollHandler}
							/>
						) : (
							<SetsBrowser
								mode={mode}
								language={setsLanguage}
								sort={setsSort}
								view={setsView}
								topPadding={gridTop}
								onScroll={browseScrollHandler}
							/>
						)}
					</Animated.View>
				)}
				{showSkeleton && (
					<FlatList
						data={SKELETON_DATA}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={() => <SkeletonCard color={t.glass.elevatedFill} />}
						contentContainerStyle={[styles.grid, { paddingTop: resultsTop }]}
						columnWrapperStyle={styles.row}
						scrollEnabled={false}
					/>
				)}
				{showError && (
					<Animated.View entering={FadeIn.duration(200)} style={{ flex: 1 }}>
						<ErrorState title="Search failed" onRetry={() => refetch()} />
					</Animated.View>
				)}
				{showNoResults && (
					<View style={styles.emptyState}>
						<SymbolView
							name="magnifyingglass"
							size={44}
							tintColor={t.text.tertiary}
							weight="regular"
						/>
						<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
							{mode === "sealed" ? "No products found" : "No cards found"}
						</Text>
					</View>
				)}
				{!dexBrowsing && displayCards.length > 0 && (
					<Animated.View style={[{ flex: 1 }, clearAnimatedStyle]}>
						<Animated.FlatList
							data={displayCards}
							keyExtractor={(item) => item.id}
							numColumns={COLUMNS}
							renderItem={renderItem}
							contentContainerStyle={[styles.grid, { paddingTop: resultsTop }]}
							columnWrapperStyle={styles.row}
							showsVerticalScrollIndicator={false}
							keyboardDismissMode="on-drag"
							keyboardShouldPersistTaps="handled"
							removeClippedSubviews
							initialNumToRender={15}
							maxToRenderPerBatch={9}
							windowSize={7}
							onScroll={browseScrollHandler}
							scrollEventThrottle={16}
							onEndReached={handleEndReached}
							onEndReachedThreshold={0.5}
							ListFooterComponent={
								isFetchingNextPage ? (
									<Animated.View
										entering={FadeIn.duration(200)}
										exiting={FadeOut.duration(300)}
										style={styles.footer}
									>
										<LoadingSpinner color={t.text.secondary} />
									</Animated.View>
								) : !hasNextPage && cards.length > 0 ? (
									<Text
										style={[styles.endText, { color: t.text.secondary }]}
									>
										No more results
									</Text>
								) : null
							}
						/>
					</Animated.View>
				)}

				{/* Chip bar — the old filter menu, made visible. OUR components,
				    not SwiftUI glass: iOS hides native glass hosts while the
				    bottom search bar is active, which made the controls vanish
				    mid-search. Browsing: Sets|Pokédex + language. Searching:
				    the Cards|Sealed scope + language (chip steps aside while
				    the keyboard is up). Floats over the grids. */}
				<Animated.View
					style={[styles.chipBar, { top: chipBarTop }, chipBarFadeStyle]}
					pointerEvents={chipsScrolledAway ? "none" : "box-none"}
				>
					<View style={styles.chipRow} pointerEvents="box-none">
						{/* Both controls share one footprint (fixed segment width)
						    and crossfade into each other on browse ⇄ search. */}
						<View pointerEvents="box-none">
							<Animated.View
								style={browseChipsStyle}
								pointerEvents={browseVisible ? "auto" : "none"}
							>
								<SegmentedChips
									options={[
										{ value: "sets", label: "Sets" },
										{ value: "pokedex", label: "Pokédex" },
									]}
									value={browse}
									onChange={handleBrowseChange}
									itemWidth={86}
								/>
							</Animated.View>
							<Animated.View
								style={[StyleSheet.absoluteFill, scopeChipsStyle]}
								pointerEvents={scopeActive ? "auto" : "none"}
							>
								<SegmentedChips
									options={[
										{ value: "cards", label: "Cards" },
										{ value: "sealed", label: "Sealed" },
									]}
									value={mode}
									onChange={handleModeChange}
									itemWidth={86}
								/>
							</Animated.View>
						</View>
						{/* Always visible — it drives the language of both browsing
						    AND search results, so it stays put while typing. */}
						<Pressable
							onPress={handleLangToggle}
							style={[
								styles.langChip,
								{
									backgroundColor: t.glass.elevatedFill,
									borderColor: t.glass.elevatedBorder,
								},
							]}
						>
							<Text style={[styles.langText, { color: t.text.primary }]}>
								{setsLanguage === "EN" ? "🇺🇸 EN" : "🇯🇵 JA"}
							</Text>
						</Pressable>
					</View>
				</Animated.View>

				{/* The search bar itself — ours, floating, keyboard-riding. */}
				<FloatingSearchBar
					value={searchQuery}
					onChangeText={(text) => {
						setSearchQuery(text);
						// Typing swaps the list context (results / dex filter) — the
						// chip bar should be visible for the fresh list.
						resetChipsFade();
					}}
					placeholder={dexBrowsing ? "Search Pokémon..." : "Search cards..."}
					menuIcon="arrow.up.arrow.down"
					menuTitle="Sort by"
					menuActions={browserViewActions}
				/>
				<HeaderFadeScrim />
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	chipBar: {
		position: "absolute",
		left: 0,
		right: 0,
		zIndex: 10,
	},
	chipRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: PADDING,
	},
	// Era section headers — same language as the Pokédex generation headers.
	eraHeader: {
		marginTop: 16,
		marginBottom: 10,
		paddingHorizontal: 2,
	},
	eraTitle: {
		fontSize: 17,
		fontWeight: "700",
	},
	setRow: {
		flexDirection: "row",
		gap: GAP,
		marginBottom: GAP,
	},
	// Compact list view — one row per set under the era header.
	setListItem: {
		marginBottom: GAP,
	},
	setListRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 16,
		borderWidth: 1,
		paddingVertical: 10,
		paddingHorizontal: 14,
	},
	setListLogoBox: {
		width: 54,
		height: 28,
		alignItems: "center",
		justifyContent: "center",
	},
	setListLogo: {
		width: 54,
		height: 28,
	},
	setListName: {
		flex: 1,
		fontSize: 15,
		fontWeight: "600",
	},
	setListYear: {
		fontSize: 13,
		fontWeight: "500",
		fontVariant: ["tabular-nums"],
	},
	langChip: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 999,
		borderWidth: 1,
	},
	langText: {
		fontSize: 13,
		fontWeight: "600",
	},
	hint: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
		paddingBottom: 80,
	},
	hintText: {
		fontSize: 16,
		textAlign: "center",
	},
	// Icon + centered title — the same empty-state language as set-detail's
	// "No cards collected yet". (Replaces the old bare-text `empty` style.)
	emptyState: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
		gap: 10,
		// Optical centering between the chip bar and the floating search bar.
		paddingBottom: 120,
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: "700",
		marginTop: 8,
	},
	grid: {
		padding: PADDING,
		paddingTop: 20,
		// Clear the floating search bar (50pt capsule + gap above the home
		// indicator).
		paddingBottom: 120,
	},
	row: {
		gap: GAP,
		marginBottom: GAP,
	},
	skeletonRow: {
		flexDirection: "row",
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
	endText: {
		textAlign: "center",
		marginTop: 20,
		marginBottom: 10,
		fontSize: 14,
	},
	// Glass set tile at ~4:3 (per mock 2e): logo centered, name beneath —
	// square left dead bands around the wide, short set logos.
	setTile: {
		width: setTileWidth,
		height: 116,
		borderRadius: 16,
		borderWidth: 1,
		padding: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	setLogoBox: {
		height: 56,
		alignSelf: "stretch",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 8,
	},
	setLogo: {
		width: "90%",
		height: 56,
	},
	setName: {
		fontSize: 13,
		fontWeight: "600",
		textAlign: "center",
	},
	// Skeleton mirroring the set tile layout: logo box + name line
	setTileSkeleton: {
		width: setTileWidth,
		height: 116,
		borderRadius: 16,
		padding: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	setLogoSkeleton: {
		height: 56,
		alignSelf: "stretch",
		borderRadius: 8,
		marginBottom: 8,
	},
	setNameSkeleton: {
		height: 14,
		width: "70%",
		borderRadius: 4,
	},
});
