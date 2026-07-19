import { useCallback, useMemo } from "react";
import {
	Alert,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { spacing, useRiverTheme } from "@/constants/theme";
import { formatCurrency } from "@/lib/format";
import {
	useRefreshVendorPrices,
	useVendorItems,
} from "@/hooks/useVendorItems";
import type { VendorItem } from "@/types/vendor";
import CardPressable from "@/components/CardPressable";
import CollectionCard from "@/components/CollectionCard";
import ErrorState from "@/components/ErrorState";
import RefreshingPill from "@/components/RefreshingPill";
import HeaderFadeScrim from "@/components/HeaderFadeScrim";
import VendorRevenueHero from "@/components/VendorRevenueHero";

/** Top-4 thumbnails for a shelf card, richest first — same idea as the
 *  collections list (which orders by card_value). */
function topImages(items: VendorItem[]): string[] {
	return [...items]
		.sort(
			(a, b) =>
				(b.askingPrice ?? b.marketValue) - (a.askingPrice ?? a.marketValue),
		)
		.slice(0, 4)
		.map((i) => i.cardImageUrl);
}

/**
 * Vending home — the collections-index mirror: revenue hero + stat strip on
 * the stage, then each group as a tappable shelf card (plus Ungrouped and
 * Sold). Card management lives one level down on /vendor-shelf.
 */
export default function VendorScreen() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const { listed, sold, groups, createGroup, summary, isError, refetch } =
		useVendorItems();
	const refreshPrices = useRefreshVendorPrices();

	const groupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);

	const shelfCards = useMemo(() => {
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

		const cards = groups.map((g) => {
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
			cards.push({
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
		return cards;
	}, [listed, groups, groupIds]);

	const openShelf = useCallback(
		(groupId: string, name: string) => {
			router.push({
				pathname: "/vendor-shelf",
				params: { mode: "group", groupId, name },
			});
		},
		[],
	);

	const openSold = useCallback(() => {
		router.push({ pathname: "/vendor-shelf", params: { mode: "sold" } });
	}, []);

	const promptCreateGroup = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		Alert.prompt(
			"New group",
			"Give your group a name.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Create",
					onPress: (name?: string) => {
						const trimmed = name?.trim();
						if (!trimmed) return;
						createGroup.mutate(trimmed);
					},
				},
			],
			"plain-text",
		);
	}, [createGroup]);

	const isEmpty =
		listed.length === 0 && sold.length === 0 && groups.length === 0;

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

						{/* Stat strip — under the range pills, on the stage. */}
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
									the shelf — or select cards in a collection and move
									them here.
								</Text>
							</View>
						) : (
							<Animated.View
								style={styles.list}
								layout={LinearTransition.duration(300)}
							>
								{shelfCards.map((c) => (
									<Animated.View
										key={c.key}
										entering={FadeIn.duration(300)}
										exiting={FadeOut.duration(200)}
										layout={LinearTransition.duration(300)}
									>
										<CollectionCard
											name={c.name}
											cardCount={c.count}
											totalValue={c.total}
											cardImages={c.images}
											onPress={() => openShelf(c.groupId, c.name)}
										/>
									</Animated.View>
								))}
								{sold.length > 0 && (
									<Animated.View
										entering={FadeIn.duration(300)}
										layout={LinearTransition.duration(300)}
									>
										<CollectionCard
											name="Sold"
											cardCount={summary.soldCount}
											totalValue={summary.revenue}
											cardImages={[...sold]
												.sort(
													(a, b) =>
														(b.soldPrice ?? 0) - (a.soldPrice ?? 0),
												)
												.slice(0, 4)
												.map((i) => i.cardImageUrl)}
											onPress={openSold}
										/>
									</Animated.View>
								)}
								{/* Create a shelf up front — same prompt the group
								    picker's "New group…" row uses. */}
								<CardPressable
									onPress={promptCreateGroup}
									pressScale={0.98}
									baseColor={t.glass.surfaceFill}
									pressedColor={t.glass.pressedFill}
									style={[
										styles.createGroupRow,
										{ borderColor: t.glass.surfaceBorder },
									]}
								>
									<SymbolView
										name="plus"
										size={15}
										tintColor={t.accentOn}
										weight="semibold"
									/>
									<Text
										style={[
											styles.createGroupText,
											{ color: t.accentOn },
										]}
									>
										New Group
									</Text>
								</CardPressable>
							</Animated.View>
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
	statsRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 14,
		paddingHorizontal: spacing.screen + 6,
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
	// Shelf cards rest directly on the gradient, like the collections list.
	list: {
		gap: 14,
		marginTop: 18,
		paddingHorizontal: spacing.screen,
	},
	createGroupRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 13,
		borderRadius: 14,
		borderWidth: 1,
	},
	createGroupText: {
		fontSize: 15,
		fontWeight: "600",
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
