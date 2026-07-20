import { useCallback, useMemo } from "react";
import {
	Alert,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import ReanimatedSwipeable, {
	type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
	FadeIn,
	FadeOut,
	LinearTransition,
} from "react-native-reanimated";
import { spacing, typeScale, useRiverTheme } from "@/constants/theme";
import { formatCurrency } from "@/lib/format";
import { formatCardConfig } from "@/lib/scrydex";
import {
	useRefreshVendorPrices,
	useVendorItems,
} from "@/hooks/useVendorItems";
import type { VendorItem } from "@/types/vendor";
import CardPressable from "@/components/CardPressable";
import ErrorState from "@/components/ErrorState";
import RefreshingPill from "@/components/RefreshingPill";
import HeaderFadeScrim from "@/components/HeaderFadeScrim";
import VendorRevenueHero from "@/components/VendorRevenueHero";

// Mini stacked thumbs on the shelf rows — card ratio, tightly overlapped.
const MINI_THUMB_WIDTH = 26;
const MINI_THUMB_HEIGHT = MINI_THUMB_WIDTH * (88 / 63);
const MINI_THUMB_OVERLAP = 11;

function soldDateLabel(soldAt?: string): string {
	if (!soldAt) return "";
	const d = new Date(soldAt);
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Top-3 thumbnails for a shelf row, richest first. */
function topImages(items: VendorItem[]): string[] {
	return [...items]
		.sort(
			(a, b) =>
				(b.askingPrice ?? b.marketValue) - (a.askingPrice ?? a.marketValue),
		)
		.slice(0, 3)
		.map((i) => i.cardImageUrl);
}

/**
 * Vending home — dashboard order: revenue chart, then the stats grid, then
 * compact shelf rows per group (+ Ungrouped and Sold). Card management
 * lives one level down on /vendor-shelf.
 */
export default function VendorScreen() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const { listed, sold, groups, deleteGroup, summary, isError, refetch } =
		useVendorItems();
	const refreshPrices = useRefreshVendorPrices();

	const groupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);
	const groupNameById = useMemo(
		() => new Map(groups.map((g) => [g.id, g.name])),
		[groups],
	);

	const shelfRows = useMemo(() => {
		const byGroup = new Map<string, VendorItem[]>();
		const ungrouped: VendorItem[] = [];
		for (const item of listed) {
			if (item.groupId && groupIds.has(item.groupId)) {
				const members = byGroup.get(item.groupId) ?? [];
				members.push(item);
				byGroup.set(item.groupId, members);
			} else {
				ungrouped.push(item);
			}
		}
		const shelfValue = (items: VendorItem[]) =>
			items.reduce(
				(sum, i) => sum + (i.askingPrice ?? i.marketValue) * i.quantity,
				0,
			);
		const cardCount = (items: VendorItem[]) =>
			items.reduce((sum, i) => sum + i.quantity, 0);

		const rows = groups.map((g) => {
			const members = byGroup.get(g.id) ?? [];
			return {
				key: g.id,
				name: g.name,
				count: cardCount(members),
				total: shelfValue(members),
				images: topImages(members),
				groupId: g.id,
			};
		});
		if (ungrouped.length > 0 || groups.length === 0) {
			rows.push({
				// With no groups yet, everything listed lives here — call it
				// "For Sale" until grouping enters the picture.
				key: "__ungrouped__",
				name: groups.length === 0 ? "For Sale" : "Ungrouped",
				count: cardCount(ungrouped),
				total: shelfValue(ungrouped),
				images: topImages(ungrouped),
				groupId: "__ungrouped__",
			});
		}
		return rows;
	}, [listed, groups, groupIds]);

	// The stats grid's six tiles — everything derivable from the summary.
	const stats = useMemo(() => {
		const avgSale =
			summary.soldCount > 0 ? summary.revenue / summary.soldCount : 0;
		return [
			{
				key: "forSale",
				label: "For Sale",
				value: String(summary.listedCount),
			},
			{
				key: "asking",
				label: "Asking Total",
				value: formatCurrency(summary.listedAskingValue),
			},
			{
				key: "market",
				label: "Market Value",
				value: formatCurrency(summary.listedMarketValue),
			},
			{ key: "sold", label: "Sold", value: String(summary.soldCount) },
			{
				key: "vsMarket",
				label: "Sold vs Market",
				value: `${summary.soldVsMarket >= 0 ? "+" : ""}${formatCurrency(summary.soldVsMarket)}`,
				color: summary.soldVsMarket >= 0 ? t.gain : t.loss,
			},
			{
				key: "avgSale",
				label: "Avg Sale",
				value: formatCurrency(avgSale),
			},
		];
	}, [summary, t.gain, t.loss]);

	const openShelf = useCallback((groupId: string, name: string) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		router.push({
			pathname: "/vendor-shelf",
			params: { mode: "group", groupId, name },
		});
	}, []);

	const openSold = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		router.push({ pathname: "/vendor-shelf", params: { mode: "sold" } });
	}, []);

	const isEmpty =
		listed.length === 0 && sold.length === 0 && groups.length === 0;

	// Swipe-left delete on real group rows — same confirm + outcome as the
	// options sheet's delete (cards drop to Ungrouped).
	const confirmDeleteGroup = useCallback(
		(groupId: string, name: string, methods: SwipeableMethods) => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
			Alert.alert(
				`Delete “${name}”?`,
				"Its cards move to Ungrouped — nothing is removed from your table.",
				[
					{
						text: "Cancel",
						style: "cancel",
						onPress: () => methods.close(),
					},
					{
						text: "Delete",
						style: "destructive",
						onPress: () => deleteGroup.mutate({ id: groupId }),
					},
				],
			);
		},
		[deleteGroup],
	);

	const renderShelfRow = ({
		key,
		name,
		count,
		total,
		images,
		groupId,
		onPress,
	}: {
		key: string;
		name: string;
		count: number;
		total: number;
		images: string[];
		groupId: string;
		onPress: () => void;
	}) => {
		const inner = (
			<CardPressable
				onPress={onPress}
				pressScale={0.98}
				baseColor={t.glass.elevatedFill}
				pressedColor={t.glass.pressedFill}
				style={[styles.shelfRow, { borderColor: t.glass.elevatedBorder }]}
			>
				{images.length > 0 ? (
					<View style={styles.thumbStack}>
						{images.map((uri, i) => (
							<Image
								key={`${uri}-${i}`}
								source={{ uri }}
								style={[
									styles.miniThumb,
									{
										left: i * MINI_THUMB_OVERLAP,
										zIndex: images.length - i,
									},
								]}
								contentFit="contain"
							/>
						))}
					</View>
				) : (
					<View
						style={[styles.rowIcon, { backgroundColor: t.accentIconFill }]}
					>
						<SymbolView
							name="folder"
							size={16}
							tintColor={t.accentOn}
							weight="semibold"
						/>
					</View>
				)}
				<View style={styles.shelfInfo}>
					<Text
						style={[styles.shelfName, { color: t.text.primary }]}
						numberOfLines={1}
					>
						{name}
					</Text>
					<Text style={[styles.shelfCount, { color: t.text.tertiary }]}>
						{count} {count === 1 ? "card" : "cards"}
					</Text>
				</View>
				<Text style={[styles.shelfValue, { color: t.text.primary }]}>
					{formatCurrency(total)}
				</Text>
				<SymbolView
					name="chevron.right"
					size={13}
					tintColor={t.text.tertiary}
					weight="semibold"
				/>
			</CardPressable>
		);
		return (
			<Animated.View
				key={key}
				entering={FadeIn.duration(300)}
				exiting={FadeOut.duration(200)}
				layout={LinearTransition.duration(300)}
			>
				{groupId !== "__ungrouped__" ? (
					<ReanimatedSwipeable
						friction={2}
						rightThreshold={36}
						overshootRight={false}
						renderRightActions={(_progress, _translation, methods) => (
							<Pressable
								onPress={() =>
									confirmDeleteGroup(groupId, name, methods)
								}
								style={[
									styles.swipeDelete,
									{ backgroundColor: t.loss },
								]}
							>
								<SymbolView
									name="trash"
									size={18}
									tintColor="#FFFFFF"
									weight="semibold"
								/>
							</Pressable>
						)}
					>
						{inner}
					</ReanimatedSwipeable>
				) : (
					inner
				)}
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
			<RefreshingPill visible={refreshPrices.isPending} topOffset={52 + 8} />
			<ScrollView
				contentContainerStyle={[
					styles.content,
					{
						paddingTop: insets.top + 52,
						paddingBottom: insets.bottom + 40,
					},
				]}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={false}
						onRefresh={() => refreshPrices.mutate()}
						tintColor={t.text.secondary}
						progressViewOffset={insets.top + 52}
					/>
				}
			>
				{isError ? (
					<View style={styles.statePad}>
						<ErrorState
							title="Couldn't load your table"
							message="Something went wrong reading your vending items."
							onRetry={() => refetch()}
						/>
					</View>
				) : (
					<>
						{/* 1 — Revenue hero (chart + range pills). */}
						<VendorRevenueHero sold={sold} summary={summary} />

						{/* 2 — Stats grid: glass tiles, three per row. */}
						<View style={styles.statsGrid}>
							{stats.map((s) => (
								<View
									key={s.key}
									style={[
										styles.statTile,
										{
											backgroundColor: t.glass.surfaceFill,
											borderColor: t.glass.surfaceBorder,
										},
									]}
								>
									<Text
										style={[
											styles.statTileValue,
											{ color: s.color ?? t.text.primary },
										]}
										numberOfLines={1}
										adjustsFontSizeToFit
										minimumFontScale={0.7}
									>
										{s.value}
									</Text>
									<Text
										style={[
											styles.statTileLabel,
											{ color: t.text.tertiary },
										]}
										numberOfLines={1}
										// "TABLE MARKET VALUE" outgrows a third-width
										// tile — shrink rather than truncate.
										adjustsFontSizeToFit
										minimumFontScale={0.75}
									>
										{s.label.toUpperCase()}
									</Text>
								</View>
							))}
						</View>

						{/* 3 — Recent sales: the ledger, right under the stats
						    it explains, with See All into the full list. */}
						{sold.length > 0 && (
							<View style={styles.salesSection}>
								<View style={styles.salesHeader}>
									<Text
										style={[
											styles.salesTitle,
											{ color: t.text.secondary },
										]}
									>
										RECENT SALES
									</Text>
									<CardPressable
										onPress={openSold}
										pressScale={1}
										hitSlop={6}
									>
										<View style={styles.seeAll}>
											<Text
												style={[
													styles.seeAllText,
													{ color: t.accentOn },
												]}
											>
												See All
											</Text>
											<SymbolView
												name="chevron.right"
												size={11}
												tintColor={t.accentOn}
												weight="semibold"
											/>
										</View>
									</CardPressable>
								</View>
								<View style={styles.salesList}>
									{sold.slice(0, 3).map((item) => {
										const diff =
											(item.soldPrice ?? 0) - item.marketValue;
										return (
											<CardPressable
												key={item.id}
												onPress={() => {
													Haptics.impactAsync(
														Haptics.ImpactFeedbackStyle.Light,
													);
													router.push({
														pathname: "/vendor-item-sheet",
														params: {
															id: item.id,
															title: item.cardName,
														},
													});
												}}
												pressScale={0.98}
												baseColor={t.glass.elevatedFill}
												pressedColor={t.glass.pressedFill}
												style={[
													styles.saleRow,
													{
														borderColor:
															t.glass.elevatedBorder,
													},
												]}
											>
												<Image
													source={{ uri: item.cardImageUrl }}
													style={styles.saleThumb}
													contentFit="contain"
												/>
												<View style={styles.saleInfo}>
													<Text
														style={[
															styles.saleName,
															{ color: t.text.primary },
														]}
														numberOfLines={1}
													>
														{item.cardName}
														{item.quantity > 1
															? `  ×${item.quantity}`
															: ""}
													</Text>
													{/* Saved variant + condition/grade — same
													    config subtitle the shelf rows show. */}
													<Text
														style={[
															styles.saleConfig,
															{ color: t.text.secondary },
														]}
														numberOfLines={1}
													>
														{formatCardConfig(item)}
													</Text>
													<Text
														style={[
															styles.saleMeta,
															{ color: t.text.tertiary },
														]}
														numberOfLines={1}
													>
														{soldDateLabel(item.soldAt)}
														{item.groupId &&
														groupNameById.has(item.groupId)
															? ` · ${groupNameById.get(item.groupId)}`
															: ""}
													</Text>
												</View>
												<View style={styles.saleTrailing}>
													<Text
														style={[
															styles.salePrice,
															{ color: t.text.primary },
														]}
													>
														{formatCurrency(
															item.soldPrice ?? 0,
														)}
													</Text>
													<Text
														style={[
															styles.saleDiff,
															{
																color:
																	diff >= 0
																		? t.gain
																		: t.loss,
															},
														]}
													>
														{diff >= 0 ? "+" : ""}
														{formatCurrency(diff)}
													</Text>
												</View>
											</CardPressable>
										);
									})}
								</View>
							</View>
						)}

						{/* 4 — Shelves: compact rows, one per group. */}
						{isEmpty ? (
							<View style={styles.emptyState}>
								<SymbolView
									name="storefront"
									size={44}
									tintColor={t.text.tertiary}
									weight="regular"
								/>
								<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
									Nothing For Sale
								</Text>
								<Text
									style={[styles.emptySubtitle, { color: t.text.secondary }]}
								>
									Scan or search cards and pick Vending to put them on
									your table — or select cards in a collection and move
									them here.
								</Text>
							</View>
						) : (
							<View style={styles.groupsSection}>
								{/* Same section header shape as Recent Sales — titled
								    by what the section IS (the for-sale inventory),
								    grouped or not. */}
								<View style={styles.salesHeader}>
									<Text
										style={[
											styles.salesTitle,
											{ color: t.text.secondary },
										]}
									>
										FOR SALE
									</Text>
								</View>
								<Animated.View
									style={styles.list}
									layout={LinearTransition.duration(300)}
								>
									{shelfRows.map((row) =>
										renderShelfRow({
											...row,
											onPress: () => openShelf(row.groupId, row.name),
										}),
									)}
								</Animated.View>
							</View>
						)}

					</>
				)}
			</ScrollView>
			<HeaderFadeScrim />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	content: {
		flexGrow: 1,
	},
	statePad: {
		flex: 1,
		paddingHorizontal: spacing.screen,
	},
	// Stats grid — three glass tiles per row, the dashboard's headline block.
	statsGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		marginTop: 16,
		paddingHorizontal: spacing.screen,
	},
	statTile: {
		flexBasis: "30%",
		flexGrow: 1,
		borderRadius: 16,
		borderWidth: 1,
		paddingVertical: 12,
		paddingHorizontal: 12,
		gap: 3,
	},
	statTileValue: {
		fontSize: 17,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	statTileLabel: {
		...typeScale.overline,
		fontSize: 10,
	},
	// Compact shelf rows resting on the gradient.
	groupsSection: {
		marginTop: 22,
		paddingHorizontal: spacing.screen,
	},
	list: {
		gap: 8,
	},
	shelfRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 14,
		borderWidth: 1,
	},
	// Overlapping mini card stack — width fits 3 thumbs at the fixed overlap.
	thumbStack: {
		width: MINI_THUMB_WIDTH + 2 * MINI_THUMB_OVERLAP,
		height: MINI_THUMB_HEIGHT,
	},
	miniThumb: {
		position: "absolute",
		top: 0,
		width: MINI_THUMB_WIDTH,
		height: MINI_THUMB_HEIGHT,
		borderRadius: 3,
	},
	rowIcon: {
		width: MINI_THUMB_WIDTH + 2 * MINI_THUMB_OVERLAP,
		height: MINI_THUMB_HEIGHT,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	shelfInfo: {
		flex: 1,
		gap: 2,
	},
	shelfName: {
		fontSize: 15,
		fontWeight: "600",
	},
	shelfCount: {
		fontSize: 12,
		fontWeight: "500",
	},
	shelfValue: {
		fontSize: 15,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	// Swipe-left action behind a group row — solid loss red, iOS-convention
	// destructive swipe.
	swipeDelete: {
		width: 64,
		marginLeft: 8,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	// Recent sales — ledger section under the shelves.
	salesSection: {
		marginTop: 22,
		paddingHorizontal: spacing.screen,
	},
	salesHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
		paddingHorizontal: 2,
	},
	salesTitle: {
		...typeScale.overline,
	},
	seeAll: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
	seeAllText: {
		fontSize: 13,
		fontWeight: "600",
	},
	salesList: {
		gap: 8,
	},
	saleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 14,
		borderWidth: 1,
	},
	saleThumb: {
		width: MINI_THUMB_WIDTH,
		height: MINI_THUMB_HEIGHT,
	},
	saleInfo: {
		flex: 1,
		gap: 1,
	},
	saleName: {
		fontSize: 14,
		fontWeight: "600",
	},
	saleConfig: {
		fontSize: 12,
		fontWeight: "500",
	},
	saleMeta: {
		fontSize: 12,
		fontWeight: "500",
	},
	saleTrailing: {
		alignItems: "flex-end",
		gap: 1,
	},
	salePrice: {
		fontSize: 14,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	saleDiff: {
		fontSize: 12,
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
	},
	emptyState: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
		paddingVertical: 48,
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
});
