import { useEffect, useMemo, useRef, useState } from "react";
import {
	Alert,
	Dimensions,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import Animated, {
	FadeInDown,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/lib/axios";
import { useCollections } from "@/hooks/useCollections";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import { getSealedProduct } from "@/lib/api/pricing";
import {
	formatVariantLabel,
	getCardImage,
	getExpansionDisplayName,
	getVariantNames,
	toNumber,
} from "@/lib/scrydex";
import { formatCurrency } from "@/lib/format";
import { typeScale, useRiverTheme } from "@/constants/theme";
import { ProGate } from "@/components/ProGate";
import CardImage from "@/components/CardImage";
import ErrorState from "@/components/ErrorState";
import type { ScrydexRawPrice, ScrydexTrends } from "@/types/scrydex";

// Same width as the card detail page; height follows the artwork's natural
// aspect ratio (packs are tall, boxes are wide) so there's no letterboxing.
const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const IMAGE_WIDTH = SCREEN_WIDTH * 0.9;
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 1.4;

const TREND_WINDOWS: { key: keyof ScrydexTrends; label: string }[] = [
	{ key: "days_7", label: "7D" },
	{ key: "days_30", label: "30D" },
	{ key: "days_90", label: "90D" },
];

// Staggered "rise in" for the detail sections — same feel as the set-tile
// entrance. Sections mount once (not recycled), so a plain staggered FadeInDown
// on mount is optimal: no replay, no guard needed.
const sectionEntering = (index: number) =>
	FadeInDown.delay(Math.min(index * 55, 280)).duration(320);

function Skeleton({
	width,
	height,
	color,
	style,
}: {
	width: number | string;
	height: number;
	color: string;
	style?: any;
}) {
	const shimmerOpacity = useSharedValue(0.3);
	useEffect(() => {
		shimmerOpacity.value = withRepeat(
			withSequence(
				withTiming(0.7, { duration: 800 }),
				withTiming(0.3, { duration: 800 }),
			),
			-1,
		);
	}, []);
	const animatedStyle = useAnimatedStyle(() => ({
		opacity: shimmerOpacity.value,
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

export default function SealedDetail() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const { isPro } = useRevenueCat();
	const {
		id,
		name,
		image: initImage,
		variant: initVariant,
		collectionId,
		quantity: initQuantity,
		pricePaid: initPricePaid,
	} = useLocalSearchParams<{
		id: string;
		name?: string;
		/** Thumbnail URL passed from the grid — already cached, shown instantly. */
		image?: string;
		variant?: string;
		collectionId?: string;
		quantity?: string;
		pricePaid?: string;
	}>();
	const api = useApi();
	const isFromCollection = !!collectionId;
	const [quantity, setQuantity] = useState(
		parseInt(initQuantity || "1", 10) || 1,
	);
	const [pricePaid, setPricePaid] = useState<string>(initPricePaid || "");

	const {
		addCardToCollection,
		removeCardFromCollection,
		incrementCardQuantity,
		decrementCardQuantity,
		updateCardPricePaid,
	} = useCollections();

	const {
		data: product,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["sealed", id],
		queryFn: () => getSealedProduct(api, id),
		enabled: !!id,
	});

	// If the user upgrades to Pro while on this screen, refetch so the pricing
	// API fires and real prices replace the "—" placeholders instead of showing
	// stale price-less data.
	const wasPro = useRef(isPro);
	useEffect(() => {
		if (isPro && !wasPro.current) refetch();
		wasPro.current = isPro;
	}, [isPro, refetch]);

	const variantNames = useMemo(
		() => (product ? getVariantNames(product) : []),
		[product],
	);
	const [variant, setVariant] = useState<string>(initVariant || "");

	useEffect(() => {
		if (variantNames.length === 0) return;
		if (!variant || !variantNames.includes(variant)) {
			setVariant(variantNames[0]);
		}
	}, [variantNames]);

	// The unopened ("U") USD price row for the selected variant
	const priceRow = useMemo<ScrydexRawPrice | undefined>(() => {
		const v = product?.variants?.find((x) => x.name === variant);
		return v?.prices?.find(
			(p): p is ScrydexRawPrice =>
				p.type === "raw" &&
				p.condition === "U" &&
				p.currency === "USD" &&
				!p.is_error &&
				!p.is_signed &&
				!p.is_perfect,
		);
	}, [product, variant]);

	const marketPrice =
		toNumber(priceRow?.market) ??
		toNumber(priceRow?.mid) ??
		toNumber(priceRow?.low) ??
		toNumber(priceRow?.high);

	const trendChips = useMemo(
		() =>
			TREND_WINDOWS.map(({ key, label }) => {
				const pct = toNumber(priceRow?.trends?.[key]?.percent_change);
				return pct === undefined ? null : { label, pct };
			}).filter((t): t is { label: string; pct: number } => t !== null),
		[priceRow],
	);

	const productImage = product
		? getCardImage(product, variant || undefined, "large")
		: undefined;
	// The grid thumbnail is already cached, so it paints instantly as the hero
	// placeholder (crossfaded to the hi-res art once it loads) and as the blurred
	// backdrop — same treatment as the card detail screen.
	const productImageSmall =
		(product ? getCardImage(product, variant || undefined, "small") : undefined) ??
		initImage;

	// Frame height tracks the artwork's natural ratio, clamped to sane bounds.
	// We ease the height into place once the image reports its dimensions so the
	// frame doesn't snap from the square placeholder — that snap reads as a flicker.
	// Reserve a tall frame by default (most sealed art is tall, clamped to
	// MAX_ASPECT) so the common case needs no resize once the image loads.
	const imageAspect = useSharedValue(MAX_ASPECT);
	const imageFrameStyle = useAnimatedStyle(() => ({
		height: IMAGE_WIDTH * imageAspect.value,
	}));

	// Same identity rule as collection rows: sealed entries are keyed by variant.
	const configMatches = isFromCollection && variant === (initVariant || "");

	// Debounced cost-basis save while viewing a collection entry
	useEffect(() => {
		if (!isFromCollection || !configMatches) return;
		if (pricePaid === (initPricePaid || "")) return;
		const timer = setTimeout(() => {
			const parsed = pricePaid.trim().length > 0 ? parseFloat(pricePaid) : NaN;
			updateCardPricePaid.mutate({
				collectionId: collectionId!,
				cardId: id,
				pricingType: "Raw",
				variant,
				condition: "U",
				pricePaid: isNaN(parsed) ? null : parsed,
			});
		}, 600);
		return () => clearTimeout(timer);
	}, [
		pricePaid,
		isFromCollection,
		configMatches,
		initPricePaid,
		collectionId,
		id,
		variant,
	]);

	// Pops this modal (and anything under it) back to the home chat screen with
	// a ready-to-send question about this product seeded into the input.
	const openChatAboutProduct = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		const displayName = product?.name ?? name ?? "this product";
		const setName = product?.expansion
			? ` from ${getExpansionDisplayName(product.expansion)}`
			: "";
		router.dismissTo({
			pathname: "/(home)",
			params: { chatPrefill: `Tell me about ${displayName}${setName}` },
		});
	};

	const confirmRemove = () => {
		Alert.alert("Remove Product", "Remove this product from the collection?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Remove",
				style: "destructive",
				onPress: () => {
					Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
					removeCardFromCollection.mutate(
						{ collectionId: collectionId!, cardId: id },
						{ onSuccess: () => router.back() },
					);
				},
			},
		]);
	};

	const handleAdd = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		if (!isPro) {
			void presentProPaywallIfNeeded();
			return;
		}
		const parsedPricePaid =
			pricePaid.trim().length > 0 ? parseFloat(pricePaid) : undefined;
		const config = {
			cardId: id,
			cardName: product?.name ?? name ?? "",
			setName: product?.expansion
				? getExpansionDisplayName(product.expansion)
				: undefined,
			cardImageUrl: productImage ?? "",
			cardValue: marketPrice ?? 0,
			pricingType: "Raw",
			productType: "sealed",
			variant,
			condition: "U",
			pricePaid:
				parsedPricePaid !== undefined && !isNaN(parsedPricePaid)
					? parsedPricePaid
					: undefined,
		};
		if (isFromCollection) {
			addCardToCollection.mutate(
				{ collectionId: collectionId!, ...config },
				{
					onSuccess: () => {
						Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
						Alert.alert(
							"Added!",
							`${formatVariantLabel(variant)} configuration added to collection.`,
						);
					},
				},
			);
		} else {
			router.push({
				pathname: "/add-to-collection",
				params: {
					...config,
					cardValue: String(config.cardValue),
					pricePaid:
						config.pricePaid !== undefined ? String(config.pricePaid) : "",
				},
			});
		}
	};

	return (
		<>
			<Stack.Screen
				options={{
					headerTitle: name ?? "Sealed Product",
					headerRight: () =>
						configMatches ? null : (
							<Pressable
								hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
								onPress={handleAdd}
							>
								<SymbolView
									name="plus"
									size={22}
									tintColor={t.accentOn}
									weight="medium"
								/>
							</Pressable>
						),
				}}
			/>

			{isLoading || product ? (
				<View style={styles.container}>
					{/* Deep-water gradient — the one background every screen shares
					    (replaces the old blurred-art backdrop: never stack a second
					    gradient or image behind content). */}
					<LinearGradient
						colors={t.background.colors}
						locations={t.background.locations}
						pointerEvents="none"
						style={StyleSheet.absoluteFill}
					/>
					<ScrollView
						style={styles.container}
						contentContainerStyle={styles.content}
						contentInsetAdjustmentBehavior="automatic"
						showsVerticalScrollIndicator={false}
					>
						{/* Product Image — persistent across the data load: the cached
						    grid thumbnail shows instantly as the placeholder, then
						    crossfades to the hi-res art. Frame sized to the artwork's
						    natural ratio once it reports dimensions. */}
						<View style={styles.imageContainer}>
							<Animated.View style={[{ width: IMAGE_WIDTH }, imageFrameStyle]}>
								<CardImage
									uri={productImage ?? initImage ?? ""}
									placeholder={productImageSmall}
									style={styles.imageInset}
									backgroundColor="transparent"
									shimmerColor={t.glass.surfaceBorder}
									onImageLoad={({ width, height }) => {
										if (width > 0) {
											const aspect = Math.min(
												Math.max(height / width, MIN_ASPECT),
												MAX_ASPECT,
											);
											// Set instantly — animating the frame size makes the
											// image visibly scale/zoom into place as it fades in.
											imageAspect.value = aspect;
										}
									}}
									fallback={
										<View style={styles.imageFallback}>
											<SymbolView
	name="shippingbox"
	size={28}
	tintColor={t.text.secondary}
	weight="medium"
/>
											<Text
												style={{
													color: t.text.primary,
													fontSize: 12,
													fontWeight: "600",
													textAlign: "center",
													paddingHorizontal: 8,
												}}
												numberOfLines={2}
											>
												{product?.name ?? name}
											</Text>
										</View>
									}
								/>
							</Animated.View>
						</View>

						{!product ? (
							<View
								style={[
									styles.sheet,
									{ backgroundColor: t.glass.surfaceFill, borderColor: t.glass.surfaceBorder },
								]}
							>
								<View style={styles.valueGate}>
									<Skeleton width={120} height={12} color={t.glass.elevatedFill} />
									<Skeleton
										width={180}
										height={44}
										color={t.glass.elevatedFill}
										style={{ marginTop: 8 }}
									/>
								</View>
							</View>
						) : (
						<View
							style={[
								styles.sheet,
								{
									backgroundColor: t.glass.surfaceFill,
									borderColor: t.glass.surfaceBorder,
									// Extend the counter past the scroll view's bottom safe-area
									// inset so it reaches the physical screen edge; pad the
									// content back up so the last row clears the home indicator.
									marginBottom: -insets.bottom,
									paddingBottom: 40 + insets.bottom,
								},
							]}
						>
							{/* Market price — the sheet's headline, on the counter */}
							<Animated.View entering={sectionEntering(1)}>
								<ProGate style={styles.valueGate}>
									<View style={styles.valueTopRow}>
										<View style={styles.valueMain}>
											<Text
												style={[
													styles.estimateLabel,
													{ color: t.text.secondary },
												]}
											>
												Market price · Unopened
											</Text>
											<Text
												// Long values ($100k+) shrink to fit on one line
												// instead of wrapping under the quantity badge.
												numberOfLines={1}
												adjustsFontSizeToFit
												minimumFontScale={0.5}
												style={[
													styles.heroPrice,
													{ color: t.text.primary },
												]}
											>
												{marketPrice !== undefined
													? formatCurrency(marketPrice)
													: "—"}
											</Text>
										</View>

										{/* Quantity owned */}
										{configMatches && (
											<View
												style={[
													styles.quantityBadge,
													styles.quantityBadgeHeader,
													{
														backgroundColor: t.glass.elevatedFill,
														borderColor: t.glass.surfaceBorder,
													},
												]}
											>
												<Pressable
													onPress={() => {
														// At 1, decrementing would leave a 0-quantity
														// row, so confirm removal instead.
														if (quantity <= 1) {
															confirmRemove();
															return;
														}
														Haptics.impactAsync(
															Haptics.ImpactFeedbackStyle.Light,
														);
														decrementCardQuantity.mutate(
															{
																collectionId: collectionId!,
																cardId: id,
																pricingType: "Raw",
																variant: initVariant || "normal",
																condition: "U",
															},
															{ onError: () => setQuantity((q) => q + 1) },
														);
														setQuantity((q) => q - 1);
													}}
													style={[
														styles.qtyButton,
														{ backgroundColor: t.glass.surfaceFill },
													]}
												>
													<SymbolView
	name="minus"
	size={16}
	tintColor={t.text.primary}
	weight="medium"
/>
												</Pressable>
												<SymbolView
	name="square.stack"
	size={16}
	tintColor={t.accent}
	weight="medium"
/>
												<Text
													style={[
														styles.quantityText,
														{ color: t.text.primary },
													]}
												>
													{quantity}
												</Text>
												<Pressable
													onPress={() => {
														Haptics.impactAsync(
															Haptics.ImpactFeedbackStyle.Light,
														);
														incrementCardQuantity.mutate(
															{
																collectionId: collectionId!,
																cardId: id,
																pricingType: "Raw",
																variant: initVariant || "normal",
																condition: "U",
															},
															{ onError: () => setQuantity((q) => q - 1) },
														);
														setQuantity((q) => q + 1);
													}}
													style={[
														styles.qtyButton,
														{ backgroundColor: t.glass.surfaceFill },
													]}
												>
													<SymbolView
	name="plus"
	size={16}
	tintColor={t.text.primary}
	weight="medium"
/>
												</Pressable>
											</View>
										)}
									</View>

								{trendChips.length > 0 && (
									<View style={styles.trendRow}>
										{trendChips.map(({ label, pct }) => {
											const up = pct >= 0;
											const trendColor = up ? t.gain : t.loss;
											return (
												<View
													key={label}
													style={[
														styles.trendChip,
														{
															backgroundColor: trendColor + "1F",
															borderColor: trendColor + "44",
														},
													]}
												>
													<SymbolView
	name={up ? "arrow.up.right" : "arrow.down.right"}
	size={13}
	tintColor={trendColor}
	weight="semibold"
/>
													<Text
														style={[
															styles.trendText,
															{ color: t.text.primary },
														]}
													>
														{label}{" "}
														<Text
															style={{ color: trendColor, fontWeight: "700" }}
														>
															{up ? "+" : ""}
															{pct.toFixed(1)}%
														</Text>
													</Text>
												</View>
											);
										})}
									</View>
								)}
							</ProGate>
						</Animated.View>

						<View
							style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]}
						/>

						{/* Identity — product name, set, type */}
						<Animated.View
							entering={sectionEntering(2)}
							style={styles.metaStrip}
						>
							<View style={{ flex: 1 }}>
								<Text
									style={[styles.productName, { color: t.text.primary }]}
								>
									{product.name}
								</Text>
								{!!product.expansion?.name && (
									<Text
										style={[
											styles.setName,
											{ color: t.text.primary, opacity: 0.7 },
										]}
									>
										{getExpansionDisplayName(product.expansion)}
										{product.expansion.release_date
											? ` · ${product.expansion.release_date.slice(0, 4)}`
											: ""}
									</Text>
								)}
							</View>
							{!!product.type && (
								<View
									style={[
										styles.pill,
										{
											backgroundColor: t.glass.elevatedFill,
											borderColor: t.glass.elevatedBorder,
										},
									]}
								>
									<Text style={[styles.pillText, { color: t.text.primary }]}>
										{product.type}
									</Text>
								</View>
							)}
						</Animated.View>

						{/* Variant picker */}
						{variantNames.length > 1 && (
							<>
								<View
									style={[
										styles.divider,
										{ backgroundColor: t.glass.surfaceBorder },
									]}
								/>
								<Animated.View
									entering={sectionEntering(3)}
									style={styles.sheetSection}
								>
								<Text
									style={[
										styles.toggleLabel,
										{ color: t.text.secondary },
									]}
								>
									Variant
								</Text>
								<View style={styles.toggleRow}>
									{variantNames.map((v) => {
										const active = v === variant;
										return (
											<Pressable
												key={v}
												hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
												style={[
													styles.togglePill,
													{
														backgroundColor: active
															? t.accent
															: t.glass.elevatedFill,
													},
												]}
												onPress={() => {
													Haptics.impactAsync(
														Haptics.ImpactFeedbackStyle.Light,
													);
													setVariant(v);
												}}
											>
												<Text
													style={[
														styles.toggleText,
														{
															color: active
																? "#FFFFFF"
																: t.text.primary,
															opacity: active ? 1 : 0.75,
														},
													]}
												>
													{formatVariantLabel(v)}
												</Text>
											</Pressable>
										);
									})}
								</View>
							</Animated.View>
							</>
						)}

						<View
							style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]}
						/>

						{/* Price Paid */}
						<Animated.View
							entering={sectionEntering(4)}
							style={styles.sheetSection}
						>
							<Text
								style={[styles.toggleLabel, { color: t.text.secondary }]}
							>
								Price Paid
							</Text>
							<View
								style={[
									styles.pricePaidRow,
									{
										backgroundColor: t.glass.elevatedFill,
										borderColor: t.glass.surfaceBorder,
									},
								]}
							>
								<Text
									style={[
										styles.pricePaidSymbol,
										{ color: t.text.secondary },
									]}
								>
									$
								</Text>
								<TextInput
									style={[styles.pricePaidInput, { color: t.text.primary }]}
									value={pricePaid}
									onChangeText={(v) => {
										const cleaned = v
											.replace(/[^0-9.]/g, "")
											.replace(/(\..*)\./g, "$1");
										setPricePaid(cleaned);
									}}
									placeholder="0.00"
									placeholderTextColor={t.text.secondary}
									keyboardType="decimal-pad"
									returnKeyType="done"
								/>
							</View>
						</Animated.View>

						<View
							style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]}
						/>

						{/* Chat about this product — jumps to River with it seeded */}
						<Animated.View entering={sectionEntering(5)}>
							<Pressable
								onPress={openChatAboutProduct}
								style={styles.linkOutRow}
							>
								<SymbolView
	name="bubble.left.and.bubble.right"
	size={18}
	tintColor={t.text.primary}
	weight="medium"
/>
								<Text
									style={[styles.linkOutText, { color: t.text.primary }]}
								>
									Chat about this product
								</Text>
								<SymbolView
	name="chevron.right"
	size={16}
	tintColor={t.text.secondary}
	weight="medium"
/>
							</Pressable>
						</Animated.View>

						{/* Description */}
						{!!product.description && (
							<>
								<View
									style={[
										styles.divider,
										{ backgroundColor: t.glass.surfaceBorder },
									]}
								/>
								<Animated.View
									entering={sectionEntering(5)}
									style={styles.sheetSection}
								>
								<Text
									style={[styles.sectionTitle, { color: t.text.primary }]}
								>
									{"What's Inside"}
								</Text>
								<Text
									style={[
										styles.description,
										{ color: t.text.primary, opacity: 0.85 },
									]}
								>
									{product.description}
								</Text>
							</Animated.View>
							</>
						)}

						{/* Remove from collection */}
						{configMatches && quantity <= 1 && (
							<Animated.View entering={sectionEntering(6)}>
								<View
									style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]}
								/>
								<Pressable
									onPress={confirmRemove}
									style={[
										styles.removeButton,
										{
											borderColor: t.loss,
											marginHorizontal: 22,
											marginTop: 18,
										},
									]}
								>
									<SymbolView
	name="trash"
	size={18}
	tintColor={t.loss}
	weight="medium"
/>
									<Text
										style={[
											styles.removeButtonText,
											{ color: t.loss },
										]}
									>
										Remove from Collection
									</Text>
								</Pressable>
							</Animated.View>
						)}
						</View>
						)}
					</ScrollView>
				</View>
			) : (
				<View style={[styles.container, styles.centered]}>
					<LinearGradient
						colors={t.background.colors}
						locations={t.background.locations}
						pointerEvents="none"
						style={StyleSheet.absoluteFill}
					/>
					{isError ? (
						<ErrorState
							title="Couldn't load product"
							onRetry={() => refetch()}
						/>
					) : (
						<Text style={{ color: t.text.secondary }}>
							Product not found
						</Text>
					)}
				</View>
			)}
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	centered: {
		alignItems: "center",
		justifyContent: "center",
	},
	content: {
		paddingTop: 4,
		// Grow the content to at least the viewport so the sheet can stretch to
		// the bottom edge — no blurred backdrop peeking below the counter.
		flexGrow: 1,
	},

	// The counter — one solid surface that rises beneath the floating product
	// and holds every detail as divided rows (replaces the old floating cards).
	sheet: {
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 10,
		paddingBottom: 40,
		// Fill the remaining height below the product when content is short.
		flexGrow: 1,
		minHeight: SCREEN_HEIGHT * 0.5,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -8 },
		shadowOpacity: 0.22,
		shadowRadius: 18,
		elevation: 12,
	},
	sheetSection: {
		paddingHorizontal: 22,
		paddingVertical: 18,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginHorizontal: 22,
	},
	// Link-out — a slim tappable row between sheet sections.
	linkOutRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 22,
		paddingVertical: 16,
	},
	linkOutText: {
		flex: 1,
		fontSize: 15,
		fontWeight: "600",
	},

	// Value header — the headline price + owned quantity, on the counter lip
	valueGate: {
		paddingHorizontal: 22,
		paddingTop: 12,
		paddingBottom: 18,
	},
	valueTopRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
	},
	valueMain: {
		flex: 1,
	},

	imageContainer: {
		alignItems: "center",
		marginBottom: 20,
		borderRadius: 23,
		overflow: "hidden",
		alignSelf: "center",
		width: IMAGE_WIDTH,
	},
	imageInset: {
		flex: 1,
		borderRadius: 6,
	},
	imageFallback: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	estimateLabel: {
		...typeScale.overline,
		marginBottom: 8,
	},
	heroPrice: {
		fontSize: 38,
		fontWeight: "800",
		letterSpacing: -1,
		marginTop: 2,
	},
	trendRow: {
		flexDirection: "row",
		gap: 6,
		marginTop: 14,
		flexWrap: "wrap",
		justifyContent: "flex-start",
	},
	trendChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 20,
		borderWidth: 1,
	},
	trendText: {
		fontSize: 12,
		fontWeight: "600",
	},
	metaStrip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 22,
		paddingVertical: 18,
	},
	productName: {
		fontSize: 17,
		fontWeight: "700",
	},
	setName: {
		fontSize: 13,
		marginTop: 2,
	},
	pill: {
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 20,
		borderWidth: 1,
	},
	pillText: {
		fontSize: 12,
		fontWeight: "600",
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "700",
		lineHeight: 20,
		marginBottom: 12,
	},
	toggleLabel: {
		...typeScale.overline,
		marginBottom: 10,
	},
	toggleRow: {
		flexDirection: "row",
		gap: 8,
		flexWrap: "wrap",
	},
	togglePill: {
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 10,
		minHeight: 36,
		justifyContent: "center",
	},
	toggleText: {
		fontSize: 13,
		fontWeight: "600",
	},
	description: {
		fontSize: 14,
		lineHeight: 21,
	},
	quantityBadge: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "center",
		gap: 10,
		paddingHorizontal: 8,
		paddingVertical: 6,
		borderRadius: 20,
		borderWidth: 1,
		marginBottom: 12,
	},
	// In the value header the badge sits top-right beside the price, not centered.
	quantityBadgeHeader: {
		alignSelf: "flex-start",
		marginBottom: 0,
		marginTop: 4,
	},
	quantityText: {
		fontSize: 14,
		fontWeight: "600",
		minWidth: 20,
		textAlign: "center",
	},
	qtyButton: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	pricePaidRow: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 10,
		borderWidth: 1,
		paddingHorizontal: 12,
	},
	pricePaidSymbol: {
		fontSize: 16,
		fontWeight: "600",
		marginRight: 4,
	},
	pricePaidInput: {
		flex: 1,
		fontSize: 16,
		fontWeight: "600",
		paddingVertical: 12,
	},
	removeButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 14,
		borderRadius: 10,
		borderWidth: 1,
		marginHorizontal: 20,
		marginTop: 4,
	},
	removeButtonText: {
		fontSize: 16,
		fontWeight: "600",
	},
});
