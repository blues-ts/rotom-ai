import { useCallback, useState } from "react";
import {
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
import { spacing, useRiverTheme } from "@/constants/theme";
import { formatCurrency } from "@/lib/format";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
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
	const { isPro } = useRevenueCat();
	const { listed, sold, summary, isError, refetch } = useVendorItems();
	const refreshPrices = useRefreshVendorPrices();

	const [tab, setTab] = useState<"listed" | "sold">("listed");

	const openScanner = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		// Scanning is Pro — same gate as every other scanner entry.
		if (!isPro) {
			void presentProPaywallIfNeeded();
			return;
		}
		router.push("/(camera)");
	}, [isPro]);

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

	const rows = tab === "listed" ? listed : sold;

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
									// Clear the pinned scan pill below.
									paddingBottom: insets.bottom + 108,
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

						{/* For Sale / Sold toggle. */}
						<View style={styles.tabs}>
							{(
								[
									["listed", `For Sale · ${summary.listedCount}`],
									["sold", `Sold · ${summary.soldCount}`],
								] as const
							).map(([key, label]) => {
								const active = tab === key;
								return (
									<CardPressable
										key={key}
										onPress={() => {
											if (tab === key) return;
											Haptics.selectionAsync();
											setTab(key);
										}}
										pressScale={0.97}
										style={[
											styles.tab,
											{
												backgroundColor: active
													? t.accentIconFill
													: t.glass.surfaceFill,
												borderColor: active
													? t.accent
													: t.glass.surfaceBorder,
											},
											active && t.buttonGlow,
										]}
									>
										<Text
											style={[
												styles.tabText,
												{
													color: active
														? t.accentOn
														: t.text.secondary,
												},
											]}
										>
											{label}
										</Text>
									</CardPressable>
								);
							})}
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
								{rows.map((item) => {
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
												onPress={() => openItemSheet(item)}
												pressScale={0.98}
												baseColor={t.glass.elevatedFill}
												pressedColor={t.glass.pressedFill}
												style={[
													styles.row,
													{ borderColor: t.glass.elevatedBorder },
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

			{/* Pinned scan pill — the fast path from shelf to scanner. The scan
			    flow itself is untouched; scanned cards land here via the add
			    sheet's Vending destination. */}
			<View
				style={[styles.scanWrap, { paddingBottom: insets.bottom + 12 }]}
				pointerEvents="box-none"
			>
				<CardPressable
					onPress={openScanner}
					style={[
						styles.scanButton,
						{ backgroundColor: t.accent },
						t.buttonGlow,
					]}
				>
					<SymbolView
						name="camera.viewfinder"
						size={18}
						tintColor="#FFFFFF"
						weight="semibold"
					/>
					<Text style={styles.scanText}>Scan cards to sell</Text>
				</CardPressable>
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
		flexDirection: "row",
		gap: 8,
		marginTop: 16,
		marginBottom: 12,
	},
	tab: {
		flex: 1,
		alignItems: "center",
		paddingVertical: 10,
		borderRadius: 999,
		borderWidth: 1,
	},
	tabText: {
		fontSize: 14,
		fontWeight: "600",
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
	scanButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		height: 52,
		borderRadius: 999,
	},
	scanText: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "700",
	},
});
