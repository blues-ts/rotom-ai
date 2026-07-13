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
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing, useRiverTheme } from "@/constants/theme";
import { useApi } from "@/lib/axios";
import { SORT_OPTION_LABELS } from "@/lib/sortLabels";
import FloatingSearchBar from "@/components/FloatingSearchBar";
import HeaderFadeScrim from "@/components/HeaderFadeScrim";
import { cardWaterfall } from "@/lib/waterfall";
import { usePrefetchDetail } from "@/hooks/usePrefetchDetail";
import { useOwnedCardIds } from "@/hooks/useOwnedCardIds";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import {
	fetchPokemonCards,
	pokemonCardsQueryKey,
} from "@/lib/pokemonCards";
import {
	getCardDisplayName,
	getCardImage,
	getCardNumber,
	getConditionOptions,
	getExpansionDisplayName,
	getVariantNames,
	toNumber,
} from "@/lib/scrydex";
import CardImage from "@/components/CardImage";
import CardContextMenu from "@/components/CardContextMenu";
import ErrorState from "@/components/ErrorState";
import type { ScrydexCard } from "@/types/scrydex";
import HeaderIconButton from "@/components/HeaderIconButton";

// Every print of one Pokémon — where a Pokédex tile lands. Deliberately the
// same architecture as set-detail: the WHOLE card list is fetched once
// (concurrent pages, ~2 round trips) and the search bar filters it
// client-side — so filtering is instant and can never surface another
// Pokémon's cards (a server-side filter's fieldless fallback could). Grid
// metrics/styles mirror set-detail exactly.

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

const spriteUrl = (id: string) =>
	`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

// Sorts mirror set-detail's, except collector number (meaningless across
// sets) becomes release date — and no name sort (every card here shares the
// Pokémon's name).
type SortOption = "newest" | "oldest" | "valueDesc" | "valueAsc";

const SORT_LABELS: Record<SortOption, string> = {
	newest: SORT_OPTION_LABELS.newest,
	oldest: SORT_OPTION_LABELS.oldest,
	valueDesc: SORT_OPTION_LABELS.valueDesc,
	valueAsc: SORT_OPTION_LABELS.valueAsc,
};

/**
 * The card's NM market price and which variant it comes from (highest across
 * variants) — set-detail's value-sort key, cards only. USD preferred; JPY
 * markets rank JA prints relative to themselves.
 */
function bestMarketPrice(item: ScrydexCard): {
	value: number;
	variant?: string;
} {
	let bestUsd = 0;
	let bestUsdVariant: string | undefined;
	let bestOther = 0;
	let bestOtherVariant: string | undefined;
	for (const v of item.variants ?? []) {
		for (const p of v.prices ?? []) {
			if (p.type !== "raw" || p.condition !== "NM") continue;
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

const releaseKey = (c: ScrydexCard) => c.expansion?.release_date ?? "";

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

export default function PokemonCards() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const api = useApi();
	const { isPro } = useRevenueCat();
	const prefetchDetail = usePrefetchDetail();
	const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
	const [filterQuery, setFilterQuery] = useState("");
	const [debouncedFilter, setDebouncedFilter] = useState("");
	const [sortBy, setSortBy] = useState<SortOption>("newest");
	const isValueSort = sortBy === "valueDesc" || sortBy === "valueAsc";

	const { name, dexId, language, owned } = useLocalSearchParams<{
		name: string;
		dexId: string;
		language?: string;
		owned?: string;
	}>();
	const langCode = language === "JA" ? "ja" : "en";
	// "Collected" view: same screen, grid filtered to cards the user owns.
	const ownedOnly = owned === "1";

	// Same explicit header offset as set-detail (the FloatingSearchBar means
	// no header-attached strip to clear on any iOS version).
	const topPadding = insets.top + 20;

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedFilter(filterQuery);
		}, 350);
		return () => clearTimeout(timer);
	}, [filterQuery]);

	// Defer the heavy card grid until the navigation transition finishes, so
	// pushing this screen is instant (same trick as set-detail).
	const [transitionDone, setTransitionDone] = useState(false);
	useEffect(() => {
		const handle = InteractionManager.runAfterInteractions(() => {
			setTransitionDone(true);
		});
		return () => handle.cancel();
	}, []);

	// Waterfall entrance once per card — recycled cells don't replay it. The
	// guard is a FRESH set per sort/filter context, memoized during render so
	// it's already empty when the remounted (sort-keyed) list draws its first
	// cells — every sort switch replays the waterfall. A persistent set with
	// prefixed keys went quiet on return visits to a sort.
	// eslint-disable-next-line react-hooks/exhaustive-deps -- these ARE the cache key
	const animatedIds = useMemo(() => new Set<string>(), [sortBy, debouncedFilter]);

	// The Pokémon's whole card list in one cached query (~2 round trips via
	// concurrent pages). Drives the grid, the client-side filter, AND the
	// master-set completion header — one fetch, 24h fresh, MMKV-persisted.
	// Shares its key + fetch with the Pokédex tile's press-in prefetch, so a
	// tap usually lands on an already-warming cache entry.
	const {
		data: dex,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: pokemonCardsQueryKey(name ?? "", langCode, isPro),
		queryFn: () =>
			fetchPokemonCards(api, { name: name ?? "", langCode, isPro }),
		enabled: !!name,
		staleTime: 24 * 60 * 60 * 1000,
	});

	// Value sorts need the PRICED list — fetched only when selected (Pro-only;
	// the menu paywalls the option for free users before it can be picked).
	const { data: pricedDex } = useQuery({
		queryKey: ["pokemonCardsPriced", name, langCode],
		queryFn: () =>
			fetchPokemonCards(api, {
				name: name ?? "",
				langCode,
				isPro: true,
				includePrices: true,
			}),
		enabled: isPro && isValueSort && !!name,
		staleTime: 30 * 60 * 1000,
	});
	const waitingForPriceSort = isValueSort && !pricedDex;

	// Distinct owned card ids across all collections — feeds both the
	// Collected view's filter and the master-set header below. Collections
	// are Pro, so all of this is Pro-only.
	const { data: ownedCardIds } = useOwnedCardIds(isPro);
	const ownedIdSet = useMemo(
		() => new Set(ownedCardIds ?? []),
		[ownedCardIds],
	);

	// Client-side filter + sort — identical semantics to set-detail's. The
	// Collected view applies ownership as the final step so every sort/filter
	// path is covered.
	const cards = useMemo(() => {
		const f = debouncedFilter.trim().toLowerCase();
		const applyFilter = (items: ScrydexCard[]) => {
			const matched = f
				? items.filter(
						(c) =>
							getCardDisplayName(c).toLowerCase().includes(f) ||
							c.name.toLowerCase().includes(f) ||
							getCardNumber(c).toLowerCase().includes(f) ||
							// Unlike a set page, these cards span many sets — let
							// "evolving skies" or "151" narrow by expansion too.
							(c.expansion !== undefined &&
								(getExpansionDisplayName(c.expansion)
									.toLowerCase()
									.includes(f) ||
									c.expansion.name.toLowerCase().includes(f))),
					)
				: items;
			return ownedOnly
				? matched.filter((c) => ownedIdSet.has(c.id))
				: matched;
		};
		if (isValueSort) {
			// While prices load the skeleton is shown (waitingForPriceSort).
			const priced = pricedDex?.items;
			if (!priced) return applyFilter(dex?.items ?? []);
			// Unpriced cards sink to the end in BOTH directions (set-detail's
			// rule) so "low to high" doesn't lead with a wall of $0 cards.
			const keyed = applyFilter(priced).map((item) => ({
				item,
				key: bestMarketPrice(item).value,
			}));
			const withPrice = keyed.filter((k) => k.key > 0);
			const unpriced = keyed.filter((k) => k.key === 0);
			withPrice.sort((a, b) => b.key - a.key);
			if (sortBy === "valueAsc") withPrice.reverse();
			return [...withPrice, ...unpriced].map((k) => k.item);
		}
		const base = applyFilter(dex?.items ?? []);
		// Release-date ordering; cards without a date sink to the end.
		const sorted = base.slice().sort((a, b) => {
			const ka = releaseKey(a);
			const kb = releaseKey(b);
			if (!ka && !kb) return 0;
			if (!ka) return 1;
			if (!kb) return -1;
			return sortBy === "oldest" ? ka.localeCompare(kb) : kb.localeCompare(ka);
		});
		return sorted;
	}, [dex, pricedDex, debouncedFilter, sortBy, isValueSort, ownedOnly, ownedIdSet]);

	// ── Master set: how many of this Pokémon's prints the user owns —
	// intersection of the full print list with owned ids. The shell renders
	// from the first frame (sprite is local) with — placeholders, so the
	// skeleton grid and the loaded grid share the same layout.
	const ownedOfDex = useMemo(
		() => (dex?.items ?? []).filter((c) => ownedIdSet.has(c.id)).length,
		[dex, ownedIdSet],
	);
	const dexTotal = dex?.total ?? 0;
	const completionReady = !!dex && !!ownedCardIds && dexTotal > 0;
	const showCompletion = isPro;
	const padWidth = Math.max(3, String(dexTotal).length);
	const completionPct =
		dexTotal > 0 ? Math.round((ownedOfDex / dexTotal) * 100) : 0;

	const completionHeader = showCompletion ? (
		<Pressable
			disabled={ownedOnly}
			onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				router.push({
					pathname: "/pokemon-cards",
					params: {
						name: name ?? "",
						dexId: dexId ?? "",
						owned: "1",
						...(language ? { language } : {}),
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
						{completionReady ? String(ownedOfDex).padStart(padWidth, "0") : "—"}{" "}
						/ {dexTotal > 0 ? String(dexTotal).padStart(padWidth, "0") : "—"}
					</Text>
				</View>
				{!!dexId && (
					<Image
						source={{ uri: spriteUrl(dexId) }}
						style={styles.summarySprite}
						contentFit="contain"
						cachePolicy="memory-disk"
					/>
				)}
				<View style={styles.completionRight}>
					<View style={styles.summaryRight}>
						<Text style={[styles.summaryLabel, { color: t.text.secondary }]}>
							Progress
						</Text>
						<Text
							style={[
								styles.summaryValue,
								styles.completionCount,
								{ color: t.text.primary },
							]}
						>
							{completionReady ? `${completionPct}%` : "—"}
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
							width: `${completionReady ? Math.min(completionPct, 100) : 0}%`,
						},
					]}
				/>
			</View>
		</Pressable>
	) : null;

	const renderItem = useCallback(
		({ item, index }: { item: ScrydexCard; index: number }) => {
			const image = getCardImage(item, undefined, "small") ?? "";
			const cardNumber = getCardNumber(item);
			const displayName = getCardDisplayName(item);
			const showPlaceholder = !image || failedImages.has(item.id);
			// In value mode, open the item on the variant that drove its sort
			// position so the hero price matches the ranking (set-detail's rule).
			const priceInfo = bestMarketPrice(item);
			const bestVariant = isValueSort ? priceInfo.variant : undefined;
			const variant = priceInfo.variant ?? getVariantNames(item)[0] ?? "normal";
			const condition = getConditionOptions(item, variant)[0] ?? "NM";
			const firstAppearance = !animatedIds.has(item.id);
			if (firstAppearance) animatedIds.add(item.id);
			return (
				<Animated.View
					entering={firstAppearance ? cardWaterfall(index) : undefined}
				>
					<CardContextMenu
						card={{
							cardId: item.id,
							cardName: displayName,
							cardNumber: cardNumber || undefined,
							cardImageUrl: image || undefined,
							cardValue: priceInfo.value,
							productType: "card",
							variant,
							condition,
						}}
						onPress={() => {
							Keyboard.dismiss();
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							prefetchDetail("card", item.id);
							router.push({
								pathname: "/(card)/[id]",
								params: {
									id: item.id,
									name: displayName,
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
									name="photo"
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
						{/* Footer: name left, collector number right — set-detail's. */}
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
				</Animated.View>
			);
		},
		[t, failedImages, prefetchDetail, isValueSort, animatedIds],
	);

	const showSkeleton = isLoading || !transitionDone || waitingForPriceSort;

	const handleSortChange = useCallback(
		(o: SortOption) => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			// Value sorts need prices — a Pro feature.
			if ((o === "valueDesc" || o === "valueAsc") && !isPro) {
				void presentProPaywallIfNeeded();
				return;
			}
			setSortBy(o);
		},
		[isPro],
	);

	// One list drives the sort form sheet.
	const sortActions = (Object.keys(SORT_LABELS) as SortOption[]).map((o) => ({
		label: SORT_LABELS[o],
		isOn: sortBy === o,
		onPress: () => handleSortChange(o),
	}));

	return (
		<>
			<Stack.Screen
				options={{
					headerTitle: ownedOnly
						? `Collected ${name ?? ""}`.trim()
						: (name ?? "Pokédex"),
					headerLeft: () => (
						<HeaderIconButton
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
						</HeaderIconButton>
					),
				}}
			/>

			<View
				style={styles.container}
				onTouchStart={() => Keyboard.dismiss()}
			>
				<LinearGradient
					colors={t.background.colors}
					locations={t.background.locations}
					pointerEvents="none"
					style={StyleSheet.absoluteFill}
				/>
				{isError ? (
					<ErrorState title="Couldn't load cards" onRetry={() => refetch()} />
				) : showSkeleton ? (
					<FlatList
						data={SKELETON_DATA}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={() => <SkeletonCard color={t.glass.elevatedFill} />}
						ListHeaderComponent={completionHeader}
						contentContainerStyle={[styles.grid, { paddingTop: topPadding }]}
						columnWrapperStyle={styles.row}
						scrollEnabled={false}
					/>
				) : cards.length === 0 ? (
					<View style={styles.emptyState}>
						{debouncedFilter ? (
							<SymbolView
								name="magnifyingglass"
								size={44}
								tintColor={t.text.tertiary}
								weight="regular"
							/>
						) : ownedOnly ? (
							<SymbolView
								name="square.stack.3d.up.slash"
								size={44}
								tintColor={t.text.tertiary}
								weight="regular"
							/>
						) : (
							!!dexId && (
								<Image
									source={{ uri: spriteUrl(dexId) }}
									style={styles.emptySprite}
									contentFit="contain"
									cachePolicy="memory-disk"
								/>
							)
						)}
						<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
							{debouncedFilter
								? "No matching cards"
								: ownedOnly
									? `No ${name ?? ""} collected yet`.replace("  ", " ")
									: `No ${language === "JA" ? "Japanese" : "English"} cards found`}
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
						ListHeaderComponent={completionHeader}
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
				{/* Our floating search bar — sort menu embedded as the trailing
				    button. One code path for every iOS version. */}
				<FloatingSearchBar
					value={filterQuery}
					onChangeText={setFilterQuery}
					placeholder={name ? `Search ${name}s...` : "Search these cards..."}
					menuIcon="arrow.up.arrow.down"
					menuActions={sortActions}
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
	placeholderName: {
		fontSize: 11,
		fontWeight: "600",
		textAlign: "center",
	},
	placeholderNumber: {
		fontSize: 10,
	},
	// Master-set card — set-detail's completion card, sprite in the middle.
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
	summarySide: {
		flex: 1,
	},
	summarySprite: {
		width: 56,
		height: 56,
	},
	summaryRight: {
		alignItems: "flex-end",
	},
	// Right side flexes so the centered sprite balances; chevron marks the
	// card as a tappable route into the Collected view.
	completionRight: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: 8,
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
	emptyState: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
		gap: 10,
		paddingBottom: 120,
	},
	emptySprite: {
		width: 96,
		height: 96,
		opacity: 0.7,
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: "700",
		marginTop: 8,
	},
});
