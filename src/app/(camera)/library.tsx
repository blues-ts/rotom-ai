import { useCallback, useMemo } from "react";
import {
	ActivityIndicator,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
	FadeOut,
	LinearTransition,
} from "react-native-reanimated";
import ContextMenu from "react-native-context-menu-view";

import { spacing, useRiverTheme } from "@/constants/theme";
import { formatCurrency } from "@/lib/format";
import {
	getCardDisplayName,
	getExpansionDisplayName,
	getCardNumber,
} from "@/lib/scrydex";
import {
	useScanSession,
	type ScanCardConfig,
} from "@/context/ScanSessionContext";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import {
	defaultScanConfig,
	scanConfigPrice,
	scanConfigSummary,
	useScanReviewBatch,
} from "@/hooks/useScanReviewBatch";
import CardPressable from "@/components/CardPressable";
import ErrorState from "@/components/ErrorState";
import HeaderIconButton from "@/components/HeaderIconButton";

const MAX_QUANTITY = 99;

// Small thumb — the row is about the config, not the art.
const THUMB_WIDTH = 44;
const THUMB_HEIGHT = THUMB_WIDTH * (88 / 63);

export default function ScanLibraryScreen() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const { isPro } = useRevenueCat();
	const { scans, count, removeScan, setScanConfig } = useScanSession();

	const ids = useMemo(() => scans.map((s) => s.id), [scans]);
	const scanById = useMemo(
		() => new Map(scans.map((s) => [s.id, s])),
		[scans],
	);

	const { data: cards, isLoading, isError, refetch } = useScanReviewBatch(ids);
	const cardById = useMemo(
		() => new Map((cards ?? []).map((c) => [c.id, c])),
		[cards],
	);

	// Every row's effective config — the stored one, else the card's defaults
	// (exactly what the blind batch add would have used).
	const configFor = useCallback(
		(id: string): ScanCardConfig | undefined => {
			const stored = scanById.get(id)?.config;
			if (stored) return stored;
			const card = cardById.get(id);
			return card ? defaultScanConfig(card) : undefined;
		},
		[scanById, cardById],
	);

	const totalValue = useMemo(() => {
		let total = 0;
		for (const id of ids) {
			const card = cardById.get(id);
			const config = configFor(id);
			if (!card || !config) continue;
			total += (scanConfigPrice(card, config) ?? 0) * config.quantity;
		}
		return total;
	}, [ids, cardById, configFor]);

	const setQuantity = useCallback(
		(id: string, delta: number) => {
			const config = configFor(id);
			if (!config) return;
			const next = Math.min(
				MAX_QUANTITY,
				Math.max(1, config.quantity + delta),
			);
			if (next === config.quantity) return;
			Haptics.selectionAsync();
			setScanConfig(id, { ...config, quantity: next });
		},
		[configFor, setScanConfig],
	);

	const openConfigure = useCallback(
		(id: string) => {
			const config = configFor(id);
			// No card data yet (still loading / offline) — nothing to configure.
			if (!config || !cardById.get(id)) return;
			// Persist the defaults on open so the sheet and this screen read the
			// same source of truth while options change.
			if (!scanById.get(id)?.config) setScanConfig(id, config);
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			router.push({
				pathname: "/(camera)/scan-configure",
				params: { cardId: id, cardIds: ids.join(",") },
			});
		},
		[configFor, cardById, scanById, setScanConfig, ids],
	);

	const handleRemove = useCallback(
		(id: string) => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
			removeScan(id);
		},
		[removeScan],
	);

	const handleContinue = useCallback(() => {
		if (ids.length === 0) return;
		// Collections are Pro — gate before opening the picker, like the
		// long-press quick-add on search (CardContextMenu).
		if (!isPro) {
			void presentProPaywallIfNeeded();
			return;
		}
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		router.push({
			pathname: "/add-to-collection",
			params: {
				cardIds: ids.join(","),
				cardImages: ids
					.map((id) => encodeURIComponent(scanById.get(id)?.image ?? ""))
					.join(","),
				fromReview: "1",
			},
		});
	}, [ids, isPro, scanById]);

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
					headerTitle:
						count > 0
							? `Review ${count} ${count === 1 ? "Card" : "Cards"}`
							: "Your Scans",
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

			{count === 0 ? (
				<View
					style={[
						styles.empty,
						{ paddingTop: insets.top + 52, paddingBottom: insets.bottom + 24 },
					]}
				>
					<SymbolView
						name="viewfinder"
						size={44}
						tintColor={t.text.tertiary}
						weight="regular"
					/>
					<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
						No Scans Yet
					</Text>
					<Text style={[styles.emptySubtitle, { color: t.text.secondary }]}>
						Point the scanner at a card and it&apos;ll land here.
					</Text>
				</View>
			) : isLoading ? (
				<View style={styles.stateWrap}>
					<ActivityIndicator size="small" color={t.text.secondary} />
				</View>
			) : isError ? (
				<View style={[styles.stateWrap, { paddingHorizontal: spacing.screen }]}>
					<ErrorState
						title="Couldn't load prices"
						message="Check your connection and try again."
						onRetry={() => refetch()}
					/>
				</View>
			) : (
				<ScrollView
					contentContainerStyle={[
						styles.list,
						{
							paddingTop: insets.top + 56,
							// Clear the pinned continue button below.
							paddingBottom: insets.bottom + 96,
						},
					]}
					showsVerticalScrollIndicator={false}
				>
					<Text style={[styles.subtitle, { color: t.text.secondary }]}>
						Tap a card to set variant, condition, or grade
					</Text>
					{ids.map((id) => {
						const card = cardById.get(id);
						const scan = scanById.get(id);
						const config = configFor(id);
						const price =
							card && config ? scanConfigPrice(card, config) : undefined;
						return (
							<Animated.View
								key={id}
								// On removal the row fades out and the rest slide up to
								// fill the gap (LinearTransition), like the old grid.
								exiting={FadeOut.duration(150)}
								layout={LinearTransition.duration(220)}
							>
								<ContextMenu
									actions={[
										{ title: "Remove", systemIcon: "trash", destructive: true },
									]}
									onPress={(e) => {
										if (e.nativeEvent.index === 0) handleRemove(id);
									}}
								>
									<CardPressable
										onPress={() => openConfigure(id)}
										pressScale={0.98}
										baseColor={t.glass.elevatedFill}
										pressedColor={t.glass.pressedFill}
										style={[styles.row, { borderColor: t.glass.elevatedBorder }]}
									>
										<Image
											source={{ uri: scan?.image }}
											style={styles.thumb}
											contentFit="contain"
										/>
										<View style={styles.rowInfo}>
											<Text
												style={[styles.rowName, { color: t.text.primary }]}
												numberOfLines={1}
											>
												{card ? getCardDisplayName(card) : "…"}
											</Text>
											{card?.expansion && (
												<Text
													style={[styles.rowSet, { color: t.text.tertiary }]}
													numberOfLines={1}
												>
													{getExpansionDisplayName(card.expansion)}
													{getCardNumber(card) ? ` · ${getCardNumber(card)}` : ""}
												</Text>
											)}
											{config && (
												<Text
													style={[styles.rowConfig, { color: t.text.secondary }]}
													numberOfLines={1}
												>
													{scanConfigSummary(config)}
													{" · "}
													<Text style={{ color: t.text.primary }}>
														{price !== undefined ? formatCurrency(price) : "—"}
													</Text>
												</Text>
											)}
										</View>
										{config && (
											<View
												style={[
													styles.stepper,
													{
														backgroundColor: t.glass.surfaceFill,
														borderColor: t.glass.surfaceBorder,
													},
												]}
											>
												<CardPressable
													hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
													pressScale={1}
													disabled={config.quantity <= 1}
													onPress={() => setQuantity(id, -1)}
													style={styles.stepperButton}
												>
													<SymbolView
														name="minus"
														size={12}
														tintColor={
															config.quantity <= 1
																? t.text.tertiary
																: t.text.primary
														}
														weight="semibold"
													/>
												</CardPressable>
												<Text
													style={[styles.stepperCount, { color: t.text.primary }]}
												>
													{config.quantity}
												</Text>
												<CardPressable
													hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
													pressScale={1}
													disabled={config.quantity >= MAX_QUANTITY}
													onPress={() => setQuantity(id, 1)}
													style={styles.stepperButton}
												>
													<SymbolView
														name="plus"
														size={12}
														tintColor={t.text.primary}
														weight="semibold"
													/>
												</CardPressable>
											</View>
										)}
										<SymbolView
											name="chevron.right"
											size={13}
											tintColor={t.text.tertiary}
											weight="semibold"
										/>
									</CardPressable>
								</ContextMenu>
							</Animated.View>
						);
					})}
				</ScrollView>
			)}

			{/* Primary action — full-width accent pill with glow, pinned above the
			    home indicator. */}
			{count > 0 && !isLoading && !isError && (
				<View
					style={[styles.continueWrap, { paddingBottom: insets.bottom + 12 }]}
					pointerEvents="box-none"
				>
					<CardPressable
						onPress={handleContinue}
						style={[
							styles.continueButton,
							{ backgroundColor: t.accent },
							t.buttonGlow,
						]}
					>
						<Text style={styles.continueText}>
							Add {count} to collection
						</Text>
						{totalValue > 0 && (
							<Text style={styles.continueValue}>
								{formatCurrency(totalValue)}
							</Text>
						)}
					</CardPressable>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	empty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
		gap: 10,
	},
	emptyTitle: { fontSize: 20, fontWeight: "700", marginTop: 8 },
	emptySubtitle: { fontSize: 15, textAlign: "center", lineHeight: 21 },
	stateWrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	subtitle: {
		textAlign: "center",
		fontSize: 12,
		fontWeight: "500",
		// Clear the transparent header above so it doesn't sit in its shadow.
		marginTop: 8,
		marginBottom: 6,
	},
	list: {
		paddingHorizontal: spacing.screen,
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
	rowConfig: { fontSize: 13, fontWeight: "500" },
	stepper: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 999,
		borderWidth: 1,
		paddingHorizontal: 8,
		height: 30,
	},
	stepperButton: {
		paddingHorizontal: 4,
		height: "100%",
		justifyContent: "center",
	},
	stepperCount: {
		fontSize: 13,
		fontWeight: "700",
		minWidth: 20,
		textAlign: "center",
		fontVariant: ["tabular-nums"],
	},
	continueWrap: {
		position: "absolute",
		left: spacing.screen,
		right: spacing.screen,
		bottom: 0,
	},
	continueButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		height: 52,
		borderRadius: 999,
	},
	continueText: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "700",
	},
	continueValue: {
		color: "rgba(255,255,255,0.8)",
		fontSize: 15,
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
	},
});
