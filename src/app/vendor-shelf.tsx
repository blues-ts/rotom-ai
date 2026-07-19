import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
	FadeIn,
	FadeOut,
	LinearTransition,
} from "react-native-reanimated";
import { spacing, useRiverTheme } from "@/constants/theme";
import { formatCurrency } from "@/lib/format";
import { SORT_OPTION_LABELS } from "@/lib/sortLabels";
import { useVendorItems } from "@/hooks/useVendorItems";
import type { VendorItem } from "@/types/vendor";
import CardPressable from "@/components/CardPressable";
import FloatingSearchBar from "@/components/FloatingSearchBar";
import HeaderIconButton, {
	HeaderButtonGroup,
} from "@/components/HeaderIconButton";

// Same compact thumb as the scan review rows — the row is about the prices.
const THUMB_WIDTH = 44;
const THUMB_HEIGHT = THUMB_WIDTH * (88 / 63);

function soldDateLabel(soldAt?: string): string {
	if (!soldAt) return "";
	const d = new Date(soldAt);
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "date" is the query's own order (newest first — added for groups, sold for
// receipts); the rest re-sort in memory.
type ShelfSort = "date" | "nameAsc" | "valueDesc" | "valueAsc";

/**
 * One shelf's card list — a group (or Ungrouped) from the vending home, or
 * the Sold receipts. The vending-home mirror of collection-detail: rows on
 * the gradient, long-press multi-select, batch bar pinned at the bottom.
 * Params: mode "group" | "sold"; groupId (group id or "__ungrouped__") and
 * name for group mode.
 */
export default function VendorShelfScreen() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const { mode, groupId, name } = useLocalSearchParams<{
		mode?: string;
		groupId?: string;
		name?: string;
	}>();
	const isSold = mode === "sold";
	const {
		listed,
		sold,
		groups,
		markSoldMany,
		unmarkSoldMany,
		removeItems,
	} = useVendorItems();

	const group =
		!isSold && groupId !== "__ungrouped__"
			? groups.find((g) => g.id === groupId)
			: undefined;

	// Group deleted from the options sheet while this screen shows it — its
	// cards are Ungrouped now, so this shelf no longer exists. Pop home.
	useEffect(() => {
		if (!isSold && groupId !== "__ungrouped__" && !group) {
			router.back();
		}
	}, [isSold, groupId, group]);

	const groupNameById = useMemo(
		() => new Map(groups.map((g) => [g.id, g.name])),
		[groups],
	);

	const items = useMemo(() => {
		if (isSold) return sold;
		if (groupId === "__ungrouped__") {
			return listed.filter(
				(i) => !i.groupId || !groupNameById.has(i.groupId),
			);
		}
		return listed.filter((i) => i.groupId === groupId);
	}, [isSold, sold, listed, groupId, groupNameById]);

	// Client-side filter over this shelf — name, set, or card number.
	const [query, setQuery] = useState("");
	const filteredItems = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return items;
		return items.filter(
			(i) =>
				i.cardName.toLowerCase().includes(q) ||
				(i.setName?.toLowerCase().includes(q) ?? false) ||
				(i.cardNumber?.toLowerCase().includes(q) ?? false),
		);
	}, [items, query]);

	const [sortBy, setSortBy] = useState<ShelfSort>("date");
	const sortedItems = useMemo(() => {
		if (sortBy === "date") return filteredItems;
		// Sold receipts sort by what they went for; listings by asking
		// (market when unpriced) — same value each row displays.
		const value = (i: VendorItem) =>
			isSold ? (i.soldPrice ?? 0) : (i.askingPrice ?? i.marketValue);
		const arr = [...filteredItems];
		switch (sortBy) {
			case "nameAsc":
				arr.sort((a, b) => a.cardName.localeCompare(b.cardName));
				break;
			case "valueDesc":
				arr.sort((a, b) => value(b) - value(a));
				break;
			case "valueAsc":
				arr.sort((a, b) => value(a) - value(b));
				break;
		}
		return arr;
	}, [filteredItems, sortBy, isSold]);

	// One vocabulary with every other sort sheet (sortLabels).
	const sortLabels: Record<ShelfSort, string> = {
		date: isSold
			? SORT_OPTION_LABELS.dateSold
			: SORT_OPTION_LABELS.dateAdded,
		nameAsc: SORT_OPTION_LABELS.name,
		valueDesc: SORT_OPTION_LABELS.valueDesc,
		valueAsc: SORT_OPTION_LABELS.valueAsc,
	};
	const sortActions = (Object.keys(sortLabels) as ShelfSort[]).map((o) => ({
		label: sortLabels[o],
		isOn: sortBy === o,
		onPress: () => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			setSortBy(o);
		},
	}));

	// Multi-select: long-press a row to enter, then tap rows to toggle — same
	// gestures as the scan library and collection grid.
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const inSelect = selectMode && items.length > 0;

	const exitSelect = useCallback(() => {
		setSelectMode(false);
		setSelected(new Set());
	}, []);

	const toggle = useCallback((id: string) => {
		Haptics.selectionAsync();
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const onRowLongPress = useCallback(
		(id: string) => {
			if (inSelect) {
				toggle(id);
				return;
			}
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
			setSelectMode(true);
			setSelected(new Set([id]));
		},
		[inSelect, toggle],
	);

	// Only VISIBLE rows count — a selection made before typing a filter can't
	// silently drag hidden rows into a batch action.
	const liveSelected = useMemo(() => {
		const present = new Set(filteredItems.map((r) => r.id));
		return new Set([...selected].filter((id) => present.has(id)));
	}, [selected, filteredItems]);

	const handleSellSelected = useCallback(() => {
		const picked = [...liveSelected];
		if (picked.length === 0) return;
		Alert.alert(
			`Mark ${picked.length} sold?`,
			"Each sells at its asking price — market price if none is set.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Sell",
					onPress: () => {
						markSoldMany.mutate({ ids: picked }, { onSuccess: exitSelect });
					},
				},
			],
		);
	}, [liveSelected, markSoldMany, exitSelect]);

	const handleUndoSelected = useCallback(() => {
		const picked = [...liveSelected];
		if (picked.length === 0) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		unmarkSoldMany.mutate({ ids: picked }, { onSuccess: exitSelect });
	}, [liveSelected, unmarkSoldMany, exitSelect]);

	const handleRemoveSelected = useCallback(() => {
		const picked = [...liveSelected];
		if (picked.length === 0) return;
		Alert.alert(
			`Remove ${picked.length} ${picked.length === 1 ? "card" : "cards"}?`,
			isSold
				? "These sales will leave your revenue total."
				: "They'll be removed from your table.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Remove",
					style: "destructive",
					onPress: () => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
						removeItems.mutate({ ids: picked }, { onSuccess: exitSelect });
					},
				},
			],
		);
	}, [liveSelected, isSold, removeItems, exitSelect]);

	// Multi-select → group picker sheet (assigns on pick; moved cards leave
	// this shelf when it lands).
	const handleGroupSelected = useCallback(() => {
		const picked = [...liveSelected];
		if (picked.length === 0) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		router.push({
			pathname: "/vendor-group-sheet",
			params: { ids: picked.join(",") },
		});
	}, [liveSelected]);

	// Options live in the vendor-item-sheet formSheet — the row just hands
	// over the item id and its name for the sheet's title.
	const openItemSheet = useCallback((item: VendorItem) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		router.push({
			pathname: "/vendor-item-sheet",
			params: { id: item.id, title: item.cardName },
		});
	}, []);

	const renderItemRow = (item: VendorItem) => {
		const soldDiff =
			item.status === "sold" ? (item.soldPrice ?? 0) - item.marketValue : 0;
		return (
			<Animated.View
				key={item.id}
				entering={FadeIn.duration(250)}
				exiting={FadeOut.duration(200)}
				layout={LinearTransition.duration(300)}
			>
				<CardPressable
					onPress={() => (inSelect ? toggle(item.id) : openItemSheet(item))}
					delayLongPress={300}
					onLongPress={() => onRowLongPress(item.id)}
					pressScale={0.98}
					baseColor={t.glass.elevatedFill}
					pressedColor={t.glass.pressedFill}
					// Selection reads as an accent-glowing border — the row itself
					// doesn't change shape.
					style={[
						styles.row,
						{ borderColor: t.glass.elevatedBorder },
						inSelect &&
							liveSelected.has(item.id) && {
								borderColor: t.accent,
								...t.buttonGlow,
							},
					]}
				>
					<Image
						source={{ uri: item.cardImageUrl }}
						style={styles.thumb}
						contentFit="contain"
					/>
					<View style={styles.rowInfo}>
						<Text
							style={[styles.rowName, { color: t.text.primary }]}
							numberOfLines={1}
						>
							{item.cardName}
							{item.quantity > 1 ? `  ×${item.quantity}` : ""}
						</Text>
						{(item.setName || item.cardNumber) && (
							<Text
								style={[styles.rowSet, { color: t.text.tertiary }]}
								numberOfLines={1}
							>
								{item.setName}
								{item.cardNumber
									? `${item.setName ? " · " : ""}${item.cardNumber}`
									: ""}
							</Text>
						)}
						<Text
							style={[styles.rowMarket, { color: t.text.secondary }]}
							numberOfLines={1}
						>
							Market {formatCurrency(item.marketValue)}
							{item.status === "sold" &&
							item.groupId &&
							groupNameById.has(item.groupId)
								? ` · ${groupNameById.get(item.groupId)}`
								: ""}
							{item.status === "sold" && item.soldAt
								? ` · ${soldDateLabel(item.soldAt)}`
								: ""}
						</Text>
					</View>
					{item.status === "listed" ? (
						<View style={styles.rowTrailing}>
							<Text
								style={[
									styles.rowPrice,
									{
										color: item.askingPrice
											? t.text.primary
											: t.accentOn,
									},
								]}
							>
								{item.askingPrice !== undefined
									? formatCurrency(item.askingPrice)
									: "Set price"}
							</Text>
							<Text
								style={[styles.rowPriceLabel, { color: t.text.tertiary }]}
							>
								asking
							</Text>
						</View>
					) : (
						<View style={styles.rowTrailing}>
							<Text style={[styles.rowPrice, { color: t.text.primary }]}>
								{formatCurrency(item.soldPrice ?? 0)}
							</Text>
							<Text
								style={[
									styles.rowPriceLabel,
									{ color: soldDiff >= 0 ? t.gain : t.loss },
								]}
							>
								{soldDiff >= 0 ? "+" : ""}
								{formatCurrency(soldDiff)}
							</Text>
						</View>
					)}
					{inSelect && liveSelected.has(item.id) && (
						<Animated.View
							entering={FadeIn.duration(180)}
							exiting={FadeOut.duration(150)}
						>
							<SymbolView
								name="checkmark.circle.fill"
								size={22}
								tintColor={t.accent}
								weight="semibold"
							/>
						</Animated.View>
					)}
				</CardPressable>
			</Animated.View>
		);
	};

	return (
		<View style={styles.container}>
			{/* Deep-water gradient — the one background every screen shares. */}
			<LinearGradient
				colors={t.background.colors}
				locations={t.background.locations}
				pointerEvents="none"
				style={StyleSheet.absoluteFill}
			/>
			<Stack.Screen
				options={{
					// Live group name so a rename shows immediately on return; the
					// ungrouped pseudo-shelf takes whatever the home row was
					// called ("For Sale" until groups exist, then "Ungrouped").
					headerTitle: isSold
						? "Sold"
						: (group?.name ??
							name ??
							(groupId === "__ungrouped__" ? "Ungrouped" : "")),
					headerRight: () => (
						<HeaderButtonGroup>
							{/* Explicit route into multi-select (long-press still
							    works) — hidden while selecting; the bar's ✕ exits. */}
							{items.length > 0 && !inSelect && (
								<HeaderIconButton
									onPress={() => {
										Haptics.selectionAsync();
										setSelectMode(true);
									}}
								>
									<SymbolView
										name="checkmark.circle"
										size={22}
										tintColor={t.accentOn}
										weight="medium"
									/>
								</HeaderIconButton>
							)}
							{group && (
								<HeaderIconButton
									onPress={() => {
										Haptics.impactAsync(
											Haptics.ImpactFeedbackStyle.Light,
										);
										router.push({
											pathname: "/vendor-group-options",
											params: { id: group.id, title: group.name },
										});
									}}
								>
									<SymbolView
										name="ellipsis.circle"
										size={20}
										tintColor={t.accentOn}
										weight="medium"
									/>
								</HeaderIconButton>
							)}
						</HeaderButtonGroup>
					),
				}}
			/>
			<ScrollView
				contentContainerStyle={[
					styles.content,
					{
						paddingTop: insets.top + 52,
						// Clear whichever bar floats at the bottom — the search
						// capsule normally, the batch bar in select mode.
						paddingBottom: insets.bottom + 110,
					},
				]}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
			>
				{items.length === 0 ? (
					<View style={styles.emptyState}>
						<SymbolView
							name={isSold ? "dollarsign.circle" : "storefront"}
							size={44}
							tintColor={t.text.tertiary}
							weight="regular"
						/>
						<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
							{isSold ? "No Sales Yet" : "Nothing Here Yet"}
						</Text>
						<Text style={[styles.emptySubtitle, { color: t.text.secondary }]}>
							{isSold
								? "Mark a listed card sold and it'll show up here."
								: "Scan or search cards and pick Vending, or move cards here from another group."}
						</Text>
					</View>
				) : filteredItems.length === 0 ? (
					<View style={styles.noMatches}>
						<Text style={[styles.noMatchesText, { color: t.text.secondary }]}>
							No cards match “{query.trim()}”
						</Text>
					</View>
				) : (
					<Animated.View
						style={styles.list}
						layout={LinearTransition.duration(300)}
					>
						{sortedItems.map((item) => renderItemRow(item))}
					</Animated.View>
				)}
			</ScrollView>

			{/* The app-standard floating search capsule — hidden in select mode,
			    where the batch bar owns the bottom slot. */}
			{items.length > 0 && !inSelect && (
				<FloatingSearchBar
					value={query}
					onChangeText={setQuery}
					placeholder={isSold ? "Search sales" : "Search cards..."}
					menuIcon="arrow.up.arrow.down"
					menuActions={sortActions}
				/>
			)}

			{/* Pinned batch action bar — select mode only. */}
			<View
				style={[styles.barWrap, { paddingBottom: insets.bottom + 12 }]}
				pointerEvents="box-none"
			>
				{inSelect && (
					<Animated.View
						entering={FadeIn.duration(180)}
						exiting={FadeOut.duration(150)}
						style={styles.actionBar}
					>
						<CardPressable
							onPress={isSold ? handleUndoSelected : handleSellSelected}
							disabled={liveSelected.size === 0}
							style={[
								styles.actionButton,
								{
									backgroundColor: t.accent,
									opacity: liveSelected.size === 0 ? 0.5 : 1,
								},
								liveSelected.size > 0 && t.buttonGlow,
							]}
						>
							<SymbolView
								name={
									isSold ? "arrow.uturn.backward" : "dollarsign.circle"
								}
								size={17}
								tintColor="#FFFFFF"
								weight="semibold"
							/>
							<Text style={styles.actionText}>
								{isSold ? "Undo" : "Sell"}
								{liveSelected.size > 0 ? ` ${liveSelected.size}` : ""}
							</Text>
						</CardPressable>
						{/* Circle buttons on near-opaque glass (sheetFill — no blur
						    behind the floating bar). Destructive is loss-colored
						    content; solid fills stay reserved for the accent. */}
						{!isSold && (
							<CardPressable
								onPress={handleGroupSelected}
								disabled={liveSelected.size === 0}
								style={[
									styles.actionCircle,
									{
										backgroundColor: t.glass.sheetFill,
										borderColor: t.glass.elevatedBorder,
										opacity: liveSelected.size === 0 ? 0.5 : 1,
									},
								]}
							>
								<SymbolView
									name="folder"
									size={17}
									tintColor={t.accentOn}
									weight="semibold"
								/>
							</CardPressable>
						)}
						<CardPressable
							onPress={handleRemoveSelected}
							disabled={liveSelected.size === 0}
							style={[
								styles.actionCircle,
								{
									backgroundColor: t.glass.sheetFill,
									borderColor: t.glass.elevatedBorder,
									opacity: liveSelected.size === 0 ? 0.5 : 1,
								},
							]}
						>
							<SymbolView
								name="trash"
								size={16}
								tintColor={t.loss}
								weight="semibold"
							/>
						</CardPressable>
						<CardPressable
							onPress={() => {
								Haptics.selectionAsync();
								exitSelect();
							}}
							style={[
								styles.actionCircle,
								{
									backgroundColor: t.glass.sheetFill,
									borderColor: t.glass.elevatedBorder,
								},
							]}
						>
							<SymbolView
								name="xmark"
								size={16}
								tintColor={t.text.primary}
								weight="semibold"
							/>
						</CardPressable>
					</Animated.View>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	content: {
		flexGrow: 1,
		paddingHorizontal: spacing.screen,
	},
	noMatches: {
		alignItems: "center",
		paddingVertical: 40,
	},
	noMatchesText: {
		fontSize: 14,
		fontWeight: "500",
	},
	list: {
		gap: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 14,
		borderWidth: 1,
	},
	thumb: { width: THUMB_WIDTH, height: THUMB_HEIGHT },
	rowInfo: { flex: 1, gap: 2 },
	rowName: { fontSize: 15, fontWeight: "600" },
	rowSet: { fontSize: 12 },
	rowMarket: { fontSize: 13, fontWeight: "500" },
	rowTrailing: {
		alignItems: "flex-end",
		gap: 1,
	},
	rowPrice: {
		fontSize: 15,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	rowPriceLabel: {
		fontSize: 12,
		fontWeight: "500",
	},
	emptyState: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 24,
		gap: 10,
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
	barWrap: {
		position: "absolute",
		left: spacing.screen,
		right: spacing.screen,
		bottom: 0,
	},
	actionBar: {
		flexDirection: "row",
		gap: 8,
	},
	actionButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		height: 52,
		borderRadius: 999,
	},
	actionCircle: {
		width: 52,
		height: 52,
		borderRadius: 26,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	actionText: {
		color: "#FFFFFF",
		fontSize: 15,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
});
