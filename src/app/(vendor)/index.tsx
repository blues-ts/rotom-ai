import { useCallback, useMemo, useState } from "react";
import {
	Alert,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
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
import {
	useRefreshVendorPrices,
	useVendorItems,
} from "@/hooks/useVendorItems";
import type { VendorGroup, VendorItem } from "@/types/vendor";
import CardPressable from "@/components/CardPressable";
import ErrorState from "@/components/ErrorState";
import RefreshingPill from "@/components/RefreshingPill";
import HeaderFadeScrim from "@/components/HeaderFadeScrim";
import SegmentedChips from "@/components/SegmentedChips";
import VendorRevenueHero from "@/components/VendorRevenueHero";

// Same compact thumb as the scan review rows — the row is about the prices.
const THUMB_WIDTH = 44;
const THUMB_HEIGHT = THUMB_WIDTH * (88 / 63);

function soldDateLabel(soldAt?: string): string {
	if (!soldAt) return "";
	const d = new Date(soldAt);
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function VendorScreen() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const {
		listed,
		sold,
		groups,
		summary,
		isError,
		refetch,
		markSoldMany,
		unmarkSoldMany,
		removeItems,
	} = useVendorItems();
	const refreshPrices = useRefreshVendorPrices();

	const [tab, setTab] = useState<"listed" | "sold">("listed");

	// Multi-select: long-press a row to enter, then tap rows to toggle — same
	// gestures as the scan library and collection grid. Selection is per-tab
	// (cleared on switch), and only ids still present count, so a batch action
	// can never touch dead rows.
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const rows = tab === "listed" ? listed : sold;
	const inSelect = selectMode && rows.length > 0;

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

	const liveSelected = useMemo(() => {
		const present = new Set(rows.map((r) => r.id));
		return new Set([...selected].filter((id) => present.has(id)));
	}, [selected, rows]);

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
						markSoldMany.mutate(
							{ ids: picked },
							{ onSuccess: exitSelect },
						);
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
			tab === "sold"
				? "These sales will leave your revenue total."
				: "They'll be removed from your for-sale shelf.",
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
	}, [liveSelected, tab, removeItems, exitSelect]);


	// Multi-select → group picker sheet (assigns on pick; selection survives
	// the trip, so the rows glow in their new section on return).
	const handleGroupSelected = useCallback(() => {
		const picked = [...liveSelected];
		if (picked.length === 0) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		router.push({
			pathname: "/vendor-group-sheet",
			params: { ids: picked.join(",") },
		});
	}, [liveSelected]);

	const groupNameById = useMemo(
		() => new Map(groups.map((g) => [g.id, g.name])),
		[groups],
	);

	// Collapsed sections (by section key, "__ungrouped__" for the tail
	// section) — session-only; tapping a header toggles it.
	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
		new Set(),
	);
	const toggleSection = useCallback((key: string) => {
		Haptics.selectionAsync();
		setCollapsedSections((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	// For Sale renders as group sections once any group exists (each group's
	// items, then Ungrouped); Sold stays a flat receipt list. Flattened into
	// one entry array so the whole thing stays a single LinearTransition list.
	type ListEntry =
		| {
				kind: "header";
				key: string;
				sectionKey: string;
				group: VendorGroup | null;
				total: number;
				count: number;
		  }
		| { kind: "item"; item: VendorItem };
	const listEntries = useMemo((): ListEntry[] => {
		if (tab === "sold" || groups.length === 0) {
			return rows.map((item) => ({ kind: "item" as const, item }));
		}
		const shelfValue = (items: VendorItem[]) =>
			items.reduce(
				(sum, i) => sum + (i.askingPrice ?? i.marketValue) * i.quantity,
				0,
			);
		const cardCount = (items: VendorItem[]) =>
			items.reduce((sum, i) => sum + i.quantity, 0);
		const byGroup = new Map<string, VendorItem[]>();
		const ungrouped: VendorItem[] = [];
		for (const item of rows) {
			if (item.groupId && groupNameById.has(item.groupId)) {
				const members = byGroup.get(item.groupId) ?? [];
				members.push(item);
				byGroup.set(item.groupId, members);
			} else {
				ungrouped.push(item);
			}
		}
		const entries: ListEntry[] = [];
		const pushSection = (
			sectionKey: string,
			group: VendorGroup | null,
			members: VendorItem[],
		) => {
			entries.push({
				kind: "header",
				key: `h-${sectionKey}`,
				sectionKey,
				group,
				total: shelfValue(members),
				count: cardCount(members),
			});
			// Collapsed: the header (with total + count) stands in for the rows.
			if (collapsedSections.has(sectionKey)) return;
			for (const m of members) entries.push({ kind: "item", item: m });
		};
		for (const g of groups) {
			const members = byGroup.get(g.id);
			if (members) pushSection(g.id, g, members);
		}
		if (ungrouped.length > 0) {
			pushSection("__ungrouped__", null, ungrouped);
		}
		return entries;
	}, [tab, rows, groups, groupNameById, collapsedSections]);

	// Group management lives in the vendor-group-options formSheet — the
	// header's ellipsis just hands over the group id and name.
	const openGroupOptions = useCallback((group: VendorGroup) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		router.push({
			pathname: "/vendor-group-options",
			params: { id: group.id, title: group.name },
		});
	}, []);

	// Options live in the vendor-item-sheet formSheet (same presentation as
	// menu-sheet) — the row just hands over the item id and its name for the
	// sheet's title.
	const openItemSheet = useCallback((item: VendorItem) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		router.push({
			pathname: "/vendor-item-sheet",
			params: { id: item.id, title: item.cardName },
		});
	}, []);

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
					{ paddingTop: insets.top + 52 },
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
							title="Couldn't load your shelf"
							message="Something went wrong reading your vending items."
							onRetry={() => refetch()}
						/>
					</View>
				) : (
					<>
						{/* Revenue hero — mirrors the collections portfolio hero:
						    bare on the gradient, chart from sale receipts. */}
						<VendorRevenueHero sold={sold} summary={summary} />

						{/* Everything below the hero rides on the sheet — same
						    lifted-lip surface as the card detail screen. */}
						<View
							style={[
								styles.sheet,
								{
									backgroundColor: t.glass.surfaceFill,
									borderColor: t.glass.surfaceBorder,
									// Clear the batch action bar while selecting; a slim
									// margin otherwise (no pinned pill anymore).
									paddingBottom: insets.bottom + (inSelect ? 108 : 24),
								},
							]}
						>
						{/* Stat strip — the sheet's headline row. */}
						<View style={styles.statsRow}>
							<View style={styles.stat}>
								<Text style={[styles.statValue, { color: t.text.primary }]}>
									{summary.soldCount}
								</Text>
								<Text style={[styles.statLabel, { color: t.text.tertiary }]}>
									sold
								</Text>
							</View>
							<View style={styles.stat}>
								<Text
									style={[
										styles.statValue,
										{
											color:
												summary.soldVsMarket >= 0 ? t.gain : t.loss,
										},
									]}
								>
									{summary.soldVsMarket >= 0 ? "+" : ""}
									{formatCurrency(summary.soldVsMarket)}
								</Text>
								<Text style={[styles.statLabel, { color: t.text.tertiary }]}>
									vs market
								</Text>
							</View>
							<View style={styles.stat}>
								<Text style={[styles.statValue, { color: t.text.primary }]}>
									{formatCurrency(summary.listedAskingValue)}
								</Text>
								<Text style={[styles.statLabel, { color: t.text.tertiary }]}>
									on shelf
								</Text>
							</View>
						</View>

						{/* For Sale / Sold toggle — the design system's segmented pill
						    (solid accent = selected, glass track = off). */}
						<View style={styles.tabs}>
							<SegmentedChips
								options={[
									{
										value: "listed" as const,
										label: `For Sale · ${summary.listedCount}`,
									},
									{
										value: "sold" as const,
										label: `Sold · ${summary.soldCount}`,
									},
								]}
								value={tab}
								onChange={(v) => {
									if (v === tab) return;
									// Selection is per-tab — leaving the tab drops it.
									exitSelect();
									setTab(v);
								}}
							/>
						</View>

						{rows.length === 0 ? (
							<View style={styles.emptyState}>
								<SymbolView
									name={tab === "listed" ? "storefront" : "dollarsign.circle"}
									size={44}
									tintColor={t.text.tertiary}
									weight="regular"
								/>
								<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
									{tab === "listed" ? "Nothing For Sale" : "No Sales Yet"}
								</Text>
								<Text
									style={[styles.emptySubtitle, { color: t.text.secondary }]}
								>
									{tab === "listed"
										? "Scan or search cards and pick Vending to put them on the shelf — or select cards in a collection and move them here."
										: "Mark a listed card sold and it'll show up here."}
								</Text>
							</View>
						) : (
							<Animated.View
								style={styles.list}
								layout={LinearTransition.duration(300)}
							>
								{listEntries.map((entry) => {
									if (entry.kind === "header") {
										const isCollapsed = collapsedSections.has(
											entry.sectionKey,
										);
										return (
											<Animated.View
												key={entry.key}
												entering={FadeIn.duration(250)}
												exiting={FadeOut.duration(200)}
												layout={LinearTransition.duration(300)}
											>
												{/* Section header is an overline (design-system
												    rule) with the shelf's asking total. Tap to
												    collapse/expand; the ellipsis opens the group's
												    manage sheet (Ungrouped isn't a real group). */}
												<CardPressable
													onPress={() =>
														toggleSection(entry.sectionKey)
													}
													pressScale={1}
													baseColor="transparent"
													pressedColor={t.glass.pressedFill}
													style={styles.sectionHeader}
												>
													<Text
														style={[
															styles.sectionTitle,
															{ color: t.text.secondary },
														]}
														numberOfLines={1}
													>
														{(
															entry.group?.name ?? "Ungrouped"
														).toUpperCase()}
														{isCollapsed
															? `  ·  ${entry.count}`
															: ""}
													</Text>
													<View style={styles.sectionTrailing}>
														<Text
															style={[
																styles.sectionTotal,
																{ color: t.text.secondary },
															]}
														>
															{formatCurrency(entry.total)}
														</Text>
														{entry.group && (
															<CardPressable
																hitSlop={8}
																pressScale={1}
																onPress={() =>
																	openGroupOptions(
																		entry.group!,
																	)
																}
															>
																<SymbolView
																	name="ellipsis.circle"
																	size={17}
																	tintColor={t.text.tertiary}
																	weight="medium"
																/>
															</CardPressable>
														)}
														<SymbolView
															name={
																isCollapsed
																	? "chevron.right"
																	: "chevron.down"
															}
															size={12}
															tintColor={t.text.tertiary}
															weight="semibold"
														/>
													</View>
												</CardPressable>
											</Animated.View>
										);
									}
									const item = entry.item;
									const soldDiff =
										item.status === "sold"
											? (item.soldPrice ?? 0) - item.marketValue
											: 0;
									return (
										<Animated.View
											key={item.id}
											entering={FadeIn.duration(250)}
											exiting={FadeOut.duration(200)}
											layout={LinearTransition.duration(300)}
										>
											<CardPressable
												onPress={() =>
													inSelect
														? toggle(item.id)
														: openItemSheet(item)
												}
												delayLongPress={300}
												onLongPress={() => onRowLongPress(item.id)}
												pressScale={0.98}
												baseColor={t.glass.elevatedFill}
												pressedColor={t.glass.pressedFill}
												// Selection reads as an accent-glowing border —
												// the row itself doesn't change shape.
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
														style={[
															styles.rowName,
															{ color: t.text.primary },
														]}
														numberOfLines={1}
													>
														{item.cardName}
														{item.quantity > 1
															? `  ×${item.quantity}`
															: ""}
													</Text>
													{(item.setName || item.cardNumber) && (
														<Text
															style={[
																styles.rowSet,
																{ color: t.text.tertiary },
															]}
															numberOfLines={1}
														>
															{item.setName}
															{item.cardNumber
																? `${item.setName ? " · " : ""}${item.cardNumber}`
																: ""}
														</Text>
													)}
													<Text
														style={[
															styles.rowMarket,
															{ color: t.text.secondary },
														]}
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
															style={[
																styles.rowPriceLabel,
																{ color: t.text.tertiary },
															]}
														>
															asking
														</Text>
													</View>
												) : (
													<View style={styles.rowTrailing}>
														<Text
															style={[
																styles.rowPrice,
																{ color: t.text.primary },
															]}
														>
															{formatCurrency(item.soldPrice ?? 0)}
														</Text>
														<Text
															style={[
																styles.rowPriceLabel,
																{
																	color:
																		soldDiff >= 0
																			? t.gain
																			: t.loss,
																},
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
								})}
							</Animated.View>
						)}
						</View>
					</>
				)}
			</ScrollView>

			{/* Pinned batch action bar — select mode only (scanning lives in the
			    header's camera button). */}
			<View
				style={[styles.scanWrap, { paddingBottom: insets.bottom + 12 }]}
				pointerEvents="box-none"
			>
				{inSelect && (
					<Animated.View
						entering={FadeIn.duration(180)}
						exiting={FadeOut.duration(150)}
						style={styles.actionBar}
					>
						<CardPressable
							onPress={
								tab === "listed" ? handleSellSelected : handleUndoSelected
							}
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
									tab === "listed"
										? "dollarsign.circle"
										: "arrow.uturn.backward"
								}
								size={17}
								tintColor="#FFFFFF"
								weight="semibold"
							/>
							<Text style={styles.actionText}>
								{tab === "listed" ? "Sell" : "Undo"}
								{liveSelected.size > 0 ? ` ${liveSelected.size}` : ""}
							</Text>
						</CardPressable>
						{/* Circle buttons on near-opaque glass (sheetFill — no blur
						    behind the floating bar). Destructive is loss-colored
						    content; solid fills stay reserved for the accent. */}
						{tab === "listed" && (
							<CardPressable
								onPress={handleGroupSelected}
								disabled={liveSelected.size === 0}
								style={[
									styles.actionCancel,
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
								styles.actionCancel,
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
								styles.actionCancel,
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
	// Same lifted-lip surface as the card detail sheet: 28pt top radius,
	// hairline lip, shadow up so the hero reads as floating above it.
	sheet: {
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
		marginTop: 16,
		paddingTop: 18,
		paddingHorizontal: spacing.screen,
		flexGrow: 1,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -8 },
		shadowOpacity: 0.22,
		shadowRadius: 18,
		elevation: 12,
	},
	statsRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingHorizontal: 6,
	},
	stat: {
		alignItems: "center",
		gap: 1,
		flex: 1,
	},
	statValue: {
		fontSize: 15,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	statLabel: {
		fontSize: 12,
		fontWeight: "500",
	},
	tabs: {
		alignItems: "center",
		marginTop: 16,
		marginBottom: 12,
	},
	list: {
		gap: 8,
	},
	// Group section header — an overline (design-system rule), with the
	// shelf's asking total on the trailing edge.
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		marginTop: 8,
		paddingVertical: 4,
		paddingHorizontal: 4,
		borderRadius: 8,
	},
	sectionTitle: {
		...typeScale.overline,
		flexShrink: 1,
	},
	sectionTrailing: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	sectionTotal: {
		fontSize: 12,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
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
	scanWrap: {
		position: "absolute",
		left: spacing.screen,
		right: spacing.screen,
		bottom: 0,
	},
	// Select-mode batch bar — pinned above the home indicator.
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
	actionCancel: {
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
