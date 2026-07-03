import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Dimensions,
	FlatList,
	Keyboard,
	StyleSheet,
	Text,
	View,
	type ViewToken,
} from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	runOnJS,
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
import { HAS_BOTTOM_SEARCH_BAR, legacySearchBarStyle } from "@/lib/platform";
import { LegacyToolbarMenu } from "@/components/LegacyToolbarMenu";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import { useApi } from "@/lib/axios";
import { usePrefetchDetail } from "@/hooks/usePrefetchDetail";
import { usePrefetchSetImages } from "@/hooks/usePrefetchSetImages";
import { searchCards, searchSealed } from "@/lib/api/pricing";
import {
	buildSearchFallbackQ,
	buildSearchQ,
	extractSearchLanguage,
	getCardDisplayName,
	getCardImage,
	getCardNumber,
	getConditionOptions,
	getExpansionDisplayName,
	getVariantNames,
} from "@/lib/scrydex";
import CardImage from "@/components/CardImage";
import CardPressable from "@/components/CardPressable";
import CardContextMenu from "@/components/CardContextMenu";
import TapHoldHintOverlay from "@/components/TapHoldHintOverlay";
import { useTapHoldHint } from "@/hooks/useTapHoldHint";
import ErrorState from "@/components/ErrorState";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { CATALOG_SETS_KEY } from "@/hooks/usePrefetchExpansions";
import {
	getCatalogSets,
	searchCatalogCards,
	catalogSetToExpansion,
	catalogCardToScrydex,
} from "@/lib/api/catalog";
import type {
	ApiListResponse,
	ScrydexCard,
	ScrydexExpansion,
	ScrydexSealedProduct,
} from "@/types/scrydex";

type SearchMode = "cards" | "sealed";
type SetsLanguage = "EN" | "JA";

const MODE_LABELS: Record<SearchMode, string> = {
	cards: "⭐ Cards",
	sealed: "📦 Sealed",
};

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
// Pre-26 iOS has no bottom search slot: the nav bar + pinned header search
// bar occupy ~96pt below the safe area, so content starts below that instead
// of the compact iOS 26 offsets.
const LEGACY_TOP_GRID = 108; // 96 header+search, plus the grid gap
const LEGACY_TOP_TEXT = 116; // 96 header+search, plus the text gap
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

function SetsBrowser({
	mode,
	language,
}: {
	mode: SearchMode;
	language: SetsLanguage;
}) {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
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

	// As set tiles scroll into view, warm that set's card images so opening it is
	// instant. Guarded so each set is prefetched at most once per mount. Refs keep
	// the handler/config stable, which FlatList requires.
	const prefetchedRef = useRef<Set<string>>(new Set());
	const onViewableItemsChanged = useRef(
		({ viewableItems }: { viewableItems: ViewToken[] }) => {
			for (const v of viewableItems) {
				const setId = (v.item as ScrydexExpansion | undefined)?.id;
				if (setId && !prefetchedRef.current.has(setId)) {
					prefetchedRef.current.add(setId);
					prefetchSetImages(setId);
				}
			}
		},
	).current;
	const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

	// Tracks tiles that have already played their entrance animation. FlatList
	// recycles cells while scrolling and `entering` re-fires on every mount, so
	// without this guard the fade-in replays on every scroll-back and janks the
	// grid. Each tile animates once, on first appearance. Cleared on language
	// change so the freshly-swapped list animates in again.
	const animatedIdsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		animatedIdsRef.current = new Set();
	}, [language]);

	const renderSet = useCallback(
		({ item, index }: { item: ScrydexExpansion; index: number }) => {
			const firstAppearance = !animatedIdsRef.current.has(item.id);
			if (firstAppearance) animatedIdsRef.current.add(item.id);
			return (
				<Animated.View
					entering={
						firstAppearance
							? cardWaterfall(index)
							: undefined
					}
				>
					<CardPressable
						onPress={() => {
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
						}}
					>
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
				</Animated.View>
			);
		},
		[t, mode],
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
				contentContainerStyle={[styles.grid, { paddingTop: insets.top + (HAS_BOTTOM_SEARCH_BAR ? 56 : LEGACY_TOP_GRID) }]}
				columnWrapperStyle={styles.row}
				scrollEnabled={false}
			/>
		);
	}

	if (filtered.length === 0) {
		return (
			<Text
				style={[
					styles.empty,
					{ color: t.text.secondary, marginTop: insets.top + (HAS_BOTTOM_SEARCH_BAR ? 20 : LEGACY_TOP_TEXT) },
				]}
			>
				No sets found
			</Text>
		);
	}

	return (
		<FlatList
			key={language}
			data={filtered}
			keyExtractor={(item) => item.id}
			numColumns={2}
			renderItem={renderSet}
			onViewableItemsChanged={onViewableItemsChanged}
			viewabilityConfig={viewabilityConfig}
			contentContainerStyle={[styles.grid, { paddingTop: insets.top + (HAS_BOTTOM_SEARCH_BAR ? 56 : LEGACY_TOP_GRID) }]}
			columnWrapperStyle={styles.row}
			showsVerticalScrollIndicator={false}
			keyboardDismissMode="on-drag"
			keyboardShouldPersistTaps="handled"
			removeClippedSubviews
			initialNumToRender={10}
			maxToRenderPerBatch={8}
			windowSize={7}
		/>
	);
}

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
		queryKey: ["searchCards", mode, debouncedQuery, isPro],
		queryFn: async ({ pageParam }) => {
			const page = pageParam as number;
			// Non-Pro: search the local catalog (no pricing API). Cards only —
			// sealed search is a Pro feature (the catalog has no sealed products).
			if (!isPro) {
				// A standalone "jp"/"en" tag becomes the catalog language filter.
				const { rest, language } = extractSearchLanguage(debouncedQuery);
				const res = await searchCatalogCards(api, {
					q: rest,
					page,
					pageSize: 30,
					language,
				});
				return {
					data: res.data.map(catalogCardToScrydex),
					page: res.page,
					page_size: res.pageSize,
					total_count: res.total,
				} as ApiListResponse<ScrydexCard | ScrydexSealedProduct>;
			}
			const search = mode === "sealed" ? searchSealed : searchCards;
			const primary = await search(api, {
				q: buildSearchQ(debouncedQuery),
				page,
				pageSize: 30,
			});
			if (primary.total_count > 0) return primary;
			// Prefix search only matches printed names — retry fieldless so
			// English terms can match translations of Japanese cards.
			const fallbackQ = buildSearchFallbackQ(debouncedQuery);
			if (!fallbackQ) return primary;
			return search(api, { q: fallbackQ, page, pageSize: 30 });
		},
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.page * lastPage.page_size < lastPage.total_count
				? lastPage.page + 1
				: undefined,
		enabled: isPro
			? buildSearchQ(debouncedQuery).length > 0
			: debouncedQuery.trim().length > 0,
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
		} else if (!isClearing) {
			setDisplayCards([]);
		}
	}, [cards, searchQuery]);

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
			return (
				<View>
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
				</View>
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

	const isSearching = debouncedQuery.trim().length > 0;
	const showHint =
		!searchQuery.trim() && !isSearching && displayCards.length === 0;
	const showSkeleton = isSearching && isLoading && displayCards.length === 0;
	const showError = isSearching && isError && displayCards.length === 0;
	const showNoResults =
		isSearching &&
		!isLoading &&
		!isError &&
		cards.length === 0 &&
		displayCards.length === 0;

	// One list drives both the iOS 26 toolbar menu and the legacy FAB sheet.
	const filterActions = [
		{
			label: MODE_LABELS.cards,
			isOn: mode === "cards",
			onPress: () => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				setMode("cards");
			},
		},
		{
			label: MODE_LABELS.sealed,
			isOn: mode === "sealed",
			onPress: () => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				// Sealed pricing is a Pro feature (no free catalog data for it).
				if (!isPro) {
					void presentProPaywallIfNeeded();
					return;
				}
				setMode("sealed");
			},
		},
		{
			label: "🇺🇸 English Sets",
			isOn: setsLanguage === "EN",
			onPress: () => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				setSetsLanguage("EN");
			},
		},
		{
			label: "🇯🇵 Japanese Sets",
			isOn: setsLanguage === "JA",
			onPress: () => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				setSetsLanguage("JA");
			},
		},
	];

	return (
		<>
			<Stack.SearchBar
				placeholder="Search cards..."
				onChangeText={(e) => setSearchQuery(e.nativeEvent.text)}
				onCancelButtonPress={() => router.back()}
				// Pre-26 iOS renders this under the header — pin it so the manual
				// content offsets stay correct instead of collapsing on scroll.
				hideWhenScrolling={HAS_BOTTOM_SEARCH_BAR ? undefined : false}
				{...legacySearchBarStyle(t)}
			/>

			{/* Per-button tint: Toolbar-level tintColor is dropped for header
			    placements on iOS in this expo-router version. */}
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon="camera"
					tintColor={t.accentOn}
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						if (!isPro) {
							void presentProPaywallIfNeeded();
							return;
						}
						router.push("/(camera)");
					}}
				/>
			</Stack.Toolbar>

			{/* iOS 26 gets the glass bottom toolbar; earlier iOS renders that
			    toolbar as a bare glyph floating over content, so it gets a
			    frosted FAB + action sheet instead (inside the container below). */}
			{HAS_BOTTOM_SEARCH_BAR && (
				<Stack.Toolbar placement="bottom" tintColor={t.accentOn}>
					<Stack.Toolbar.SearchBarSlot />
					<Stack.Toolbar.Menu
						icon="line.3.horizontal.decrease.circle"
						tintColor={t.accentOn}
					>
						{filterActions.map((a) => (
							<Stack.Toolbar.MenuAction
								key={a.label}
								isOn={a.isOn}
								onPress={a.onPress}
							>
								{a.label}
							</Stack.Toolbar.MenuAction>
						))}
					</Stack.Toolbar.Menu>
				</Stack.Toolbar>
			)}

			<View style={styles.container}>
				{/* Deep-water gradient — the one background every screen shares. */}
				<LinearGradient
					colors={t.background.colors}
					locations={t.background.locations}
					pointerEvents="none"
					style={StyleSheet.absoluteFill}
				/>
				{/* Sets browser is the default content until the user types */}
				{showHint && (
					<Animated.View entering={FadeIn.duration(200)} style={{ flex: 1 }}>
						<SetsBrowser mode={mode} language={setsLanguage} />
					</Animated.View>
				)}
				{showSkeleton && (
					<FlatList
						data={SKELETON_DATA}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={() => <SkeletonCard color={t.glass.elevatedFill} />}
						contentContainerStyle={[
							styles.grid,
							{
								paddingTop:
									insets.top +
									(HAS_BOTTOM_SEARCH_BAR ? PADDING : LEGACY_TOP_GRID),
							},
						]}
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
					<Text
						style={[
							styles.empty,
							{ color: t.text.secondary, marginTop: insets.top + (HAS_BOTTOM_SEARCH_BAR ? 20 : LEGACY_TOP_TEXT) },
						]}
					>
						{mode === "sealed" ? "No products found" : "No cards found"}
					</Text>
				)}
				{displayCards.length > 0 && (
					<Animated.View style={[{ flex: 1 }, clearAnimatedStyle]}>
						<FlatList
							data={displayCards}
							keyExtractor={(item) => item.id}
							numColumns={COLUMNS}
							renderItem={renderItem}
							contentContainerStyle={[
								styles.grid,
								{
								paddingTop:
									insets.top +
									(HAS_BOTTOM_SEARCH_BAR ? PADDING : LEGACY_TOP_GRID),
							},
							]}
							columnWrapperStyle={styles.row}
							showsVerticalScrollIndicator={false}
							keyboardDismissMode="on-drag"
							keyboardShouldPersistTaps="handled"
							removeClippedSubviews
							initialNumToRender={15}
							maxToRenderPerBatch={9}
							windowSize={7}
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
				{!HAS_BOTTOM_SEARCH_BAR && (
					<LegacyToolbarMenu
						icon="line.3.horizontal.decrease.circle"
						actions={filterActions}
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
	empty: {
		textAlign: "center",
		marginTop: 40,
		fontSize: 16,
	},
	grid: {
		padding: PADDING,
		paddingTop: 20,
		paddingBottom: 75,
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
