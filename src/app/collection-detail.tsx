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
	FadeIn,
	FadeOut,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
	ZoomOut,
} from "react-native-reanimated";
import { cardWaterfall } from "@/lib/waterfall";
import { SymbolView } from "expo-symbols";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, spacing, typeScale, useRiverTheme } from "@/constants/theme";
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
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import { formatCurrency } from "@/lib/format";
import { SORT_OPTION_LABELS } from "@/lib/sortLabels";
import FloatingSearchBar from "@/components/FloatingSearchBar";
import HeaderIconButton, { HeaderButtonGroup } from "@/components/HeaderIconButton";
import HeaderFadeScrim from "@/components/HeaderFadeScrim";
import { CONDITION_LABELS, formatVariantLabel } from "@/lib/scrydex";
import type { CollectionCard } from "@/types/collection";

const COLUMNS = 3;
const GAP = 8;
const PADDING = spacing.screen;
const TILE_PAD = 8;
const screenWidth = Dimensions.get("window").width;
const tileWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const imageWidth = tileWidth - TILE_PAD * 2;
// Card art is always TCG ratio (63:88), never cropped.
const imageHeight = imageWidth * (88 / 63);

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

// Sheet order matches the app-wide convention: recency, name, value.
const SORT_LABELS: Record<SortOption, string> = {
	dateAdded: SORT_OPTION_LABELS.dateAdded,
	nameAsc: SORT_OPTION_LABELS.name,
	valueDesc: SORT_OPTION_LABELS.valueDesc,
	valueAsc: SORT_OPTION_LABELS.valueAsc,
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
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const prefetchDetail = usePrefetchDetail();
	// Explicit header offset: contentInsetAdjustmentBehavior applies its inset
	// a frame after mount, which made the summary jump down on remounts.
	// Same on every iOS version — the search field is the FloatingSearchBar,
	// so no header-attached strip to clear anymore.
	const headerHeight = 52;
	const topPadding = insets.top + headerHeight;
	const { renameCollection, deleteCollection, removeCardRows } =
		useCollections();
	const refreshPrices = useRefreshCollectionPrices();

	// Multi-select (delete) mode.
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const exitSelect = useCallback(() => {
		setSelectMode(false);
		setSelected(new Set());
	}, []);
	const toggleSelected = useCallback((rowId: string) => {
		Haptics.selectionAsync();
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(rowId)) next.delete(rowId);
			else next.add(rowId);
			return next;
		});
	}, []);
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
	// Selection can outlive its rows (a move relocates them) — only ids still
	// present count, so the header count and batch actions never see dead rows.
	// This is what lets the selection survive the move sheet round-trip.
	const liveSelected = useMemo(() => {
		const present = new Set((cards ?? []).map((c) => c.id));
		return new Set([...selected].filter((rowId) => present.has(rowId)));
	}, [selected, cards]);
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

	// Lapsed-Pro honesty: prices freeze when Pro ends (the refresh mutation
	// no-ops for non-Pro), so tell the user how old the numbers are instead of
	// letting frozen values pass as live. Tapping re-opens the paywall.
	const { isPro, refresh: refreshEntitlements } = useRevenueCat();
	const lastPriceUpdate = useMemo(() => {
		if (!cards?.length) return null;
		let latest: string | null = null;
		for (const c of cards) {
			if (c.valueUpdatedAt && (!latest || c.valueUpdatedAt > latest)) {
				latest = c.valueUpdatedAt;
			}
		}
		return latest;
	}, [cards]);
	const staleNotice =
		!isPro && lastPriceUpdate
			? `Prices last updated ${new Date(lastPriceUpdate).toLocaleDateString(
					undefined,
					{ month: "short", day: "numeric" },
				)} — renew Pro to refresh`
			: null;

	const summaryHeader = hasBannerData ? (
		<View>
			<View style={styles.summaryRow}>
				<View>
					<Text style={[styles.summaryLabel, { color: t.text.secondary }]}>
						Collection value
					</Text>
					<Text style={[styles.summaryValue, { color: t.text.primary }]}>
						{formatCurrency(bannerValue!)}
					</Text>
				</View>
				<View style={styles.summaryRight}>
					<Text style={[styles.summaryLabel, { color: t.text.secondary }]}>
						Cards
					</Text>
					<Text style={[styles.summaryValue, { color: t.text.primary }]}>
						{bannerCount}
					</Text>
				</View>
			</View>
			{staleNotice ? (
				<Pressable
					onPress={async () => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						await presentProPaywallIfNeeded();
						await refreshEntitlements();
					}}
					style={styles.staleNotice}
					accessibilityRole="button"
					accessibilityLabel={staleNotice}
				>
					<SymbolView
						name="clock.arrow.circlepath"
						size={13}
						tintColor={t.text.secondary}
						weight="medium"
					/>
					<Text style={[styles.staleNoticeText, { color: t.text.secondary }]}>
						{staleNotice}
					</Text>
				</Pressable>
			) : null}
		</View>
	) : null;

	// Banner placeholder while the collection metadata loads
	const summarySkeleton = (
		<View style={styles.summaryRow}>
			<View>
				<SkeletonBlock width={110} height={13} color={t.glass.elevatedFill} />
				<SkeletonBlock
					width={90}
					height={22}
					color={t.glass.elevatedFill}
					style={{ marginTop: 4 }}
				/>
			</View>
			<View style={styles.summaryRight}>
				<SkeletonBlock width={44} height={13} color={t.glass.elevatedFill} />
				<SkeletonBlock
					width={36}
					height={22}
					color={t.glass.elevatedFill}
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

	const handleDelete = useCallback(() => {
		Alert.alert(
			"Delete Collection",
			`Are you sure you want to delete "${
				collection?.name ?? nameParam ?? "this collection"
			}"? This cannot be undone.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: () => {
						deleteCollection.mutate(id, { onSuccess: () => router.back() });
					},
				},
			],
		);
	}, [collection, nameParam, id, deleteCollection]);

	// Hand the selected rows to the move sheet. The selection SURVIVES the
	// trip: cancelling keeps it, and listing for Vending (which copies) comes
	// back to the same cards still selected. Rows that actually move away are
	// pruned from the set by the effect below, so nothing points at dead ids.
	const handleMoveSelected = useCallback(() => {
		const ids = [...liveSelected];
		if (ids.length === 0) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		router.push({
			pathname: "/add-to-collection",
			params: { moveFromCollectionId: id, moveRowIds: ids.join(",") },
		});
	}, [liveSelected, id]);

	const handleDeleteSelected = useCallback(() => {
		const ids = [...liveSelected];
		if (ids.length === 0) return;
		Alert.alert(
			`Delete ${ids.length} ${ids.length === 1 ? "card" : "cards"}?`,
			"This removes them from this collection.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: () => {
						removeCardRows.mutate({ collectionId: id, ids });
						exitSelect();
					},
				},
			],
		);
	}, [liveSelected, removeCardRows, id, exitSelect]);

	const renderItem = useCallback(
		({ item, index }: { item: CollectionCard; index: number }) => {
			// Fade-up only on an item's first appearance; recycled cells get no
			// `entering`, so scrolling back never replays the animation — same feel
			// as the set tiles and set-detail cards.
			const firstAppearance = !animatedIdsRef.current.has(item.id);
			if (firstAppearance) animatedIdsRef.current.add(item.id);
			const isSelected = liveSelected.has(item.id);
			const isGraded =
				item.productType !== "sealed" &&
				item.pricingType === "Graded" &&
				item.gradedCompany &&
				item.gradedGrade;
			const badgeText =
				item.productType === "sealed"
					? "Sealed"
					: isGraded
						? `${item.gradedCompany} ${item.gradedGrade}`
						: item.condition;
			return (
				<Animated.View
					entering={
						firstAppearance
							? cardWaterfall(index)
							: undefined
					}
					// Deleted cards (removed from the list on delete) shrink + fade out.
					exiting={ZoomOut.duration(200)}
				>
				<CardPressable
					// Long-press = enter select mode with this card already selected
					// (same as the header checkmark.circle button, minus the trip up
					// there). In select mode a long press is just a slow tap.
					delayLongPress={300}
					onLongPress={() => {
						if (selectMode) {
							toggleSelected(item.id);
							return;
						}
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
						setSelectMode(true);
						setSelected(new Set([item.id]));
					}}
					onPress={() => {
						if (selectMode) {
							toggleSelected(item.id);
							return;
						}
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
									// Cached image — shows instantly while the product loads.
									...(item.cardImageUrl ? { image: item.cardImageUrl } : {}),
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
					{/* Glass tile: art on top (radius 8), name, price + condition badge. */}
					<View
						style={[
							styles.tile,
							{
								backgroundColor: t.glass.surfaceFill,
								borderColor: t.glass.surfaceBorder,
							},
							t.glass.shadow,
							// Selection reads as an accent-glowing border, same as the
							// scan review rows.
							isSelected && {
								borderColor: t.accent,
								...t.buttonGlow,
							},
						]}
					>
						{item.cardImageUrl && item.productType === "sealed" ? (
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
									uri={item.cardImageUrl}
									style={styles.sealedImage}
									backgroundColor="transparent"
									shimmerColor={t.glass.elevatedFill}
								/>
							</View>
						) : item.cardImageUrl ? (
							<CardImage
								uri={item.cardImageUrl}
								style={styles.cardImage}
								backgroundColor="transparent"
								shimmerColor={t.glass.elevatedFill}
							/>
						) : (
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
							</View>
						)}

						<Text
							style={[styles.infoName, { color: t.text.primary }]}
							numberOfLines={1}
						>
							{item.cardName}
						</Text>
						<View style={styles.infoValueRow}>
							<Text
								style={[styles.infoValue, { color: t.text.primary }]}
								numberOfLines={1}
							>
								{formatCurrency(item.cardValue)}
								{item.quantity > 1 ? ` ×${item.quantity}` : ""}
							</Text>
							<View
								style={[
									styles.conditionBadge,
									{
										backgroundColor: isGraded
											? t.accentIconFill
											: t.glass.elevatedFill,
									},
								]}
							>
								<Text
									style={[
										styles.conditionText,
										{ color: isGraded ? t.accentOn : t.text.secondary },
									]}
									numberOfLines={1}
								>
									{badgeText}
								</Text>
							</View>
						</View>

						{selectMode && !isSelected && (
							<Animated.View
								entering={FadeIn.duration(180)}
								exiting={FadeOut.duration(150)}
								style={styles.greyOverlay}
							/>
						)}
						{selectMode && (
							<Animated.View
								// Fades with select mode, like the scan review screen.
								entering={FadeIn.duration(180)}
								exiting={FadeOut.duration(150)}
								style={[
									styles.check,
									isSelected
										? { backgroundColor: t.accent, borderColor: t.accent }
										: { backgroundColor: "rgba(0,0,0,0.4)", borderColor: "#fff" },
								]}
							>
								{isSelected && (
									<SymbolView
										name="checkmark"
										size={13}
										tintColor="#FFFFFF"
										weight="bold"
									/>
								)}
							</Animated.View>
						)}
					</View>
				</CardPressable>
			</Animated.View>
			);
		},
		[t, prefetchDetail, selectMode, liveSelected, toggleSelected],
	);

	// One list drives both the iOS 26 toolbar menu and the legacy FAB sheet.
	const sortActions = (Object.keys(SORT_LABELS) as SortOption[]).map((o) => ({
		label: SORT_LABELS[o],
		isOn: sortBy === o,
		onPress: () => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			setSortBy(o);
		},
	}));

	return (
		<>
			<Stack.Screen
				options={{
					// Custom title view: iOS 26 centers short native titles but leads
					// long ones, so a stretched left-aligned Text keeps the name
					// consistently beside the back button. Query name first so a
					// rename shows immediately; the route param covers the first
					// frames before the query resolves (stable mount, no pop).
					headerTitle: () => (
						<Text
							numberOfLines={1}
							style={[styles.headerTitle, { color: t.accentOn }]}
						>
							{selectMode
								? liveSelected.size > 0
									? `${liveSelected.size} Selected`
									: "Select cards"
								: (collection?.name ?? nameParam ?? "")}
						</Text>
					),
					headerBackButtonDisplayMode: "minimal",
					headerRight: () =>
						selectMode ? (
							<HeaderButtonGroup>
								{liveSelected.size > 0 && (
									<>
										<HeaderIconButton onPress={handleMoveSelected}>
											<SymbolView
												name="folder"
												size={19}
												tintColor={t.accentOn}
												weight="medium"
											/>
										</HeaderIconButton>
										<HeaderIconButton onPress={handleDeleteSelected}>
											<SymbolView
												name="trash"
												size={19}
												tintColor={t.loss}
												weight="medium"
											/>
										</HeaderIconButton>
									</>
								)}
								<HeaderIconButton onPress={exitSelect}>
									<SymbolView
										name="checkmark"
										size={20}
										tintColor={t.accentOn}
										weight="semibold"
									/>
								</HeaderIconButton>
							</HeaderButtonGroup>
						) : (
							<HeaderButtonGroup>
								<HeaderIconButton
									onPress={() => {
										Haptics.selectionAsync();
										setSelectMode(true);
									}}
									disabled={(cards?.length ?? 0) === 0}
								>
									<SymbolView
										name="checkmark.circle"
										size={20}
										tintColor={
											(cards?.length ?? 0) === 0
												? t.text.tertiary
												: t.accentOn
										}
										weight="medium"
									/>
								</HeaderIconButton>
								<HeaderIconButton
									onPress={() => {
										Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										handleDelete();
									}}
								>
									<SymbolView
										name="trash"
										size={19}
										tintColor={t.accentOn}
										weight="medium"
									/>
								</HeaderIconButton>
								<HeaderIconButton
									onPress={() => {
										Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										handleRename();
									}}
								>
									<SymbolView
										name="pencil"
										size={19}
										tintColor={t.accentOn}
										weight="medium"
									/>
								</HeaderIconButton>
								<HeaderIconButton
									onPress={() => {
										Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										router.push("/(search)");
									}}
								>
									<SymbolView
										name="plus"
										size={22}
										tintColor={t.accentOn}
										weight="medium"
									/>
								</HeaderIconButton>
							</HeaderButtonGroup>
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
				<RefreshingPill
					visible={refreshPrices.isPending}
					topOffset={headerHeight + 8}
				/>

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
						extraData={selectMode ? liveSelected : null}
						ListHeaderComponent={summaryHeader ?? summarySkeleton}
						contentContainerStyle={[styles.grid, { paddingTop: topPadding }]}
						columnWrapperStyle={styles.row}
						showsVerticalScrollIndicator={false}
						keyboardDismissMode="on-drag"
						keyboardShouldPersistTaps="handled"
						refreshControl={
							<RefreshControl
								// Spinner is only the pull affordance; refreshing stays false
								// so it collapses on release and the pill carries the
								// "updating" state from there. No title — spinner only.
								refreshing={false}
								onRefresh={() => refreshPrices.mutate(id)}
								tintColor={t.text.secondary}
								// Match the collections screen: drop the spinner below the
								// transparent header instead of drawing underneath it.
								progressViewOffset={topPadding}
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
								width={tileWidth}
								height={imageHeight + 44}
								color={t.glass.elevatedFill}
							/>
						)}
						ListHeaderComponent={summaryHeader ?? summarySkeleton}
						contentContainerStyle={[styles.grid, { paddingTop: topPadding }]}
						columnWrapperStyle={styles.row}
						scrollEnabled={false}
					/>
				) : (cards?.length ?? 0) === 0 ? (
					// Truly empty collection — center the empty state to the screen,
					// matching the collections list and the scanner library. (Rendered
					// as a plain view, NOT a FlatList ListEmptyComponent, which would sit
					// below the value banner instead of centering.)
					<View
						style={[
							styles.emptyState,
							// Bottom padding clears the floating search bar.
						{ paddingTop: topPadding, paddingBottom: insets.bottom + 110 },
						]}
					>
						<SymbolView
							name="folder"
							size={44}
							tintColor={t.text.tertiary}
							weight="regular"
						/>
						<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
							No Cards Yet
						</Text>
						<Text
							style={[styles.emptySubtitle, { color: t.text.secondary }]}
						>
							Tap + to search and add cards to this collection
						</Text>
					</View>
				) : (
					// Filter matched nothing (the collection DOES have cards) — keep the
					// banner + in-list message.
					<FlatList
						data={[]}
						keyExtractor={() => "none"}
						numColumns={COLUMNS}
						renderItem={null}
						ListHeaderComponent={summaryHeader ?? summarySkeleton}
						contentContainerStyle={[styles.grid, { paddingTop: topPadding }]}
						ListEmptyComponent={
							<View style={styles.emptyStateCentered}>
								<SymbolView
									name="magnifyingglass"
									size={44}
									tintColor={t.text.tertiary}
									weight="regular"
								/>
								<Text
									style={[styles.emptyTitle, { color: t.text.primary }]}
								>
									No matching cards
								</Text>
							</View>
						}
					/>
				)}
				{/* Our floating search bar — sort menu embedded as the trailing
				    button. One code path for every iOS version. */}
				<FloatingSearchBar
					value={filterQuery}
					onChangeText={setFilterQuery}
					placeholder="Search cards..."
					menuIcon="arrow.up.arrow.down"
					menuActions={sortActions}
				/>
				<HeaderFadeScrim headerHeight={headerHeight} />
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	// Fills the title slot between the bar items so the text pins left
	// instead of centering.
	headerTitle: {
		...typeScale.screenTitle,
		width: "100%",
		textAlign: "left",
	},
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingTop: 4,
		paddingBottom: 14,
	},
	// Lapsed-Pro "prices frozen" line under the summary row.
	staleNotice: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		marginTop: -6,
		paddingBottom: 12,
	},
	staleNoticeText: {
		...typeScale.caption,
	},
	summaryRight: {
		alignItems: "flex-end",
	},
	summaryLabel: {
		...typeScale.overline,
		marginBottom: 4,
	},
	summaryValue: {
		...typeScale.bigNumber,
		fontVariant: ["tabular-nums"],
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
	// Glass grid tile (dense grids get radius 14).
	tile: {
		width: tileWidth,
		borderRadius: 14,
		borderWidth: 1,
		padding: TILE_PAD,
	},
	check: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 24,
		height: 24,
		borderRadius: 12,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 2,
	},
	cardImage: {
		width: imageWidth,
		height: imageHeight,
		borderRadius: radius.thumb,
	},
	greyOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		borderRadius: 14,
		backgroundColor: "rgba(120,120,120,0.5)",
		zIndex: 1,
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
	infoName: {
		fontSize: 12,
		fontWeight: "600",
		marginTop: 7,
	},
	infoValueRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 3,
		gap: 4,
	},
	infoValue: {
		fontSize: 12,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
		flexShrink: 1,
	},
	conditionBadge: {
		borderRadius: 6,
		paddingHorizontal: 5,
		paddingVertical: 2,
		flexShrink: 0,
	},
	conditionText: {
		...typeScale.badge,
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
