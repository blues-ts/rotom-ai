import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
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
	FadeIn,
	FadeOut,
	LinearTransition,
} from "react-native-reanimated";
import { spacing, useRiverTheme } from "@/constants/theme";
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
import HeaderIconButton, {
	HeaderButtonGroup,
} from "@/components/HeaderIconButton";
import TickerPrice from "@/components/TickerPrice";

const MAX_QUANTITY = 99;

// Small thumb — the row is about the config, not the art.
const THUMB_WIDTH = 44;
const THUMB_HEIGHT = THUMB_WIDTH * (88 / 63);

export default function ScanLibraryScreen() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const { isPro } = useRevenueCat();
	const { scans, count, removeScans, setScanConfig } = useScanSession();

	// Multi-select: long-press a row (or the header check button) to enter,
	// then remove or add-to-collection just the selection — same gestures as
	// the collection grid.
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	// Removing the last card leaves nothing to select — derived, so the header
	// drops back to normal in the same render (no state-sync effect).
	const inSelect = selectMode && count > 0;

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

	const ids = useMemo(() => scans.map((s) => s.id), [scans]);
	const scanById = useMemo(
		() => new Map(scans.map((s) => [s.id, s])),
		[scans],
	);

	// Selected ids can leave the session while this screen is covered (the
	// add-to-collection sheet files them away on success) — only the ones
	// still present count, so the header never offers actions on dead ids.
	const liveSelected = useMemo(
		() => new Set([...selected].filter((id) => scanById.has(id))),
		[selected, scanById],
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

	const handleRemoveSelected = useCallback(() => {
		const picked = [...liveSelected];
		if (picked.length === 0) return;
		Alert.alert(
			`Remove ${picked.length} ${picked.length === 1 ? "card" : "cards"}?`,
			"They'll be removed from this scanning session.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Remove",
					style: "destructive",
					onPress: () => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
						removeScans(picked);
						exitSelect();
					},
				},
			],
		);
	}, [liveSelected, removeScans, exitSelect]);

	const pushAddToCollection = useCallback(
		(picked: string[]) => {
			if (picked.length === 0) return;
			// Collections are Pro — gate before opening the picker, like the
			// long-press quick-add on search (CardContextMenu).
			if (!isPro) {
				void presentProPaywallIfNeeded();
				return;
			}
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
			// The selection survives the trip into the picker — scans stay in the
			// session, so coming back finds the same cards still selected.
			router.push({
				pathname: "/add-to-collection",
				params: {
					cardIds: picked.join(","),
					cardImages: picked
						.map((id) => encodeURIComponent(scanById.get(id)?.image ?? ""))
						.join(","),
					fromReview: "1",
				},
			});
		},
		[isPro, scanById],
	);

	// The screen's primary action: add the whole session at once.
	const handleContinue = useCallback(() => {
		pushAddToCollection(ids);
	}, [pushAddToCollection, ids]);

	const handleAddSelected = useCallback(() => {
		pushAddToCollection([...liveSelected]);
	}, [pushAddToCollection, liveSelected]);

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
					headerTitle: inSelect
						? liveSelected.size > 0
							? `${liveSelected.size} Selected`
							: "Select Cards"
						: count > 0
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
					headerRight: () => {
						if (count === 0 || isLoading || isError) return null;
						if (!inSelect) {
							return (
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
							);
						}
						return (
							<HeaderButtonGroup>
								{liveSelected.size > 0 && (
									<>
										<HeaderIconButton onPress={handleAddSelected}>
											<SymbolView
												name="plus"
												size={20}
												tintColor={t.accentOn}
												weight="medium"
											/>
										</HeaderIconButton>
										<HeaderIconButton onPress={handleRemoveSelected}>
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
										size={21}
										tintColor={t.accentOn}
										weight="semibold"
									/>
								</HeaderIconButton>
							</HeaderButtonGroup>
						);
					},
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
						{inSelect
							? "Tap cards to select them"
							: "Tap a card to set variant, condition, or grade"}
					</Text>
					{ids.map((id) => {
						const card = cardById.get(id);
						const scan = scanById.get(id);
						const config = configFor(id);
						const price =
							card && config ? scanConfigPrice(card, config) : undefined;
						const isSelected = liveSelected.has(id);
						return (
							<Animated.View
								key={id}
								// On removal the row fades out and the rest slide up to
								// fill the gap (LinearTransition), like the old grid.
								exiting={FadeOut.duration(150)}
								layout={LinearTransition.duration(220)}
							>
								<CardPressable
									onPress={() =>
										inSelect ? toggle(id) : openConfigure(id)
									}
									delayLongPress={300}
									onLongPress={() => onRowLongPress(id)}
									pressScale={0.98}
									baseColor={t.glass.elevatedFill}
									pressedColor={t.glass.pressedFill}
									// Selection reads as an accent-glowing border — the row
									// itself doesn't change shape.
									style={[
										styles.row,
										{ borderColor: t.glass.elevatedBorder },
										isSelected && {
											borderColor: t.accent,
											...t.buttonGlow,
										},
									]}
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
											<View style={styles.rowConfigLine}>
												<Text
													style={[
														styles.rowConfig,
														styles.rowConfigSummary,
														{ color: t.text.secondary },
													]}
													numberOfLines={1}
												>
													{scanConfigSummary(config)}
													{" · "}
												</Text>
												{price !== undefined ? (
													<TickerPrice
														value={price}
														fontSize={13}
														style={[
															styles.rowConfig,
															{ color: t.text.primary },
														]}
													/>
												) : (
													<Text
														style={[
															styles.rowConfig,
															{ color: t.text.primary },
														]}
													>
														—
													</Text>
												)}
											</View>
										)}
									</View>
									{config && !inSelect && (
										<Animated.View
											// Fades away in select mode instead of popping out.
											entering={FadeIn.duration(180)}
											exiting={FadeOut.duration(150)}
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
										</Animated.View>
									)}
									{!inSelect && (
										<Animated.View
											entering={FadeIn.duration(180)}
											exiting={FadeOut.duration(150)}
										>
											<SymbolView
												name="chevron.right"
												size={13}
												tintColor={t.text.tertiary}
												weight="semibold"
											/>
										</Animated.View>
									)}
									{/* Selected: an accent check takes the trailing slot the
									    stepper + chevron vacated. */}
									{inSelect && isSelected && (
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
				</ScrollView>
			)}

			{/* Primary action — full-width accent pill with glow, pinned above the
			    home indicator. */}
			{count > 0 && !isLoading && !isError && !inSelect && (
				<Animated.View
					// Fades with select mode, like the row steppers.
					entering={FadeIn.duration(180)}
					exiting={FadeOut.duration(150)}
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
							<TickerPrice
								value={totalValue}
								fontSize={15}
								textAlign="center"
								style={styles.continueValue}
							/>
						)}
					</CardPressable>
				</Animated.View>
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
	// The price is a ticker (TextInput), which can't nest inside Text — the
	// summary and price sit side by side in a row instead.
	rowConfigLine: { flexDirection: "row", alignItems: "center" },
	rowConfig: { fontSize: 13, fontWeight: "500" },
	rowConfigSummary: { flexShrink: 1 },
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
