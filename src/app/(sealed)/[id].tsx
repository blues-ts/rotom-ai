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
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
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
import { useTheme } from "@/context/ThemeContext";
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
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const { isPro } = useRevenueCat();
	const {
		id,
		name,
		variant: initVariant,
		collectionId,
		quantity: initQuantity,
		pricePaid: initPricePaid,
	} = useLocalSearchParams<{
		id: string;
		name?: string;
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
								<Ionicons name="add" size={26} color={colors.foreground} />
							</Pressable>
						),
				}}
			/>

			{isLoading ? (
				<ScrollView
					style={[styles.container, { backgroundColor: colors.background }]}
					contentContainerStyle={styles.content}
					contentInsetAdjustmentBehavior="automatic"
					scrollEnabled={false}
				>
					<View style={styles.imageContainer}>
						<Skeleton
							width={IMAGE_WIDTH}
							height={IMAGE_WIDTH * MAX_ASPECT}
							color={colors.muted}
							style={{ borderRadius: 19 }}
						/>
					</View>
					<View
						style={[
							styles.sheet,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}
					>
						<View
							style={[
								styles.grabber,
								{ backgroundColor: colors.mutedForeground + "66" },
							]}
						/>
						<View style={styles.valueGate}>
							<Skeleton width={120} height={12} color={colors.muted} />
							<Skeleton
								width={180}
								height={44}
								color={colors.muted}
								style={{ marginTop: 8 }}
							/>
						</View>
					</View>
				</ScrollView>
			) : product ? (
				<View
					style={[styles.container, { backgroundColor: colors.background }]}
				>
					{productImage && (
						<Image
							source={{ uri: productImage }}
							style={StyleSheet.absoluteFill}
							contentFit="cover"
							blurRadius={30}
							cachePolicy="memory-disk"
						/>
					)}
					<View
						style={[
							StyleSheet.absoluteFill,
							{ backgroundColor: `${colors.background}B3` },
						]}
					/>
					<ScrollView
						style={styles.container}
						contentContainerStyle={styles.content}
						contentInsetAdjustmentBehavior="automatic"
						showsVerticalScrollIndicator={false}
					>
						{/* Product Image — art floating on the blurred backdrop,
						    frame sized to the artwork's natural ratio */}
						<View style={styles.imageContainer}>
							<Animated.View style={[{ width: IMAGE_WIDTH }, imageFrameStyle]}>
								<CardImage
									uri={productImage ?? ""}
									style={styles.imageInset}
									backgroundColor="transparent"
									shimmerColor={colors.border}
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
											<Ionicons
												name="cube-outline"
												size={28}
												color={colors.mutedForeground}
											/>
											<Text
												style={{
													color: colors.foreground,
													fontSize: 12,
													fontWeight: "600",
													textAlign: "center",
													paddingHorizontal: 8,
												}}
												numberOfLines={2}
											>
												{product.name}
											</Text>
										</View>
									}
								/>
							</Animated.View>
						</View>

						<View
							style={[
								styles.sheet,
								{
									backgroundColor: colors.card,
									borderColor: colors.border,
									// Extend the counter past the scroll view's bottom safe-area
									// inset so it reaches the physical screen edge; pad the
									// content back up so the last row clears the home indicator.
									marginBottom: -insets.bottom,
									paddingBottom: 40 + insets.bottom,
								},
							]}
						>
							<View
								style={[
									styles.grabber,
									{ backgroundColor: colors.mutedForeground + "66" },
								]}
							/>

							{/* Market price — the sheet's headline, on the counter */}
							<Animated.View entering={sectionEntering(1)}>
								<ProGate style={styles.valueGate}>
									<View style={styles.valueTopRow}>
										<View style={styles.valueMain}>
											<Text
												style={[
													styles.estimateLabel,
													{ color: colors.foreground, opacity: 0.75 },
												]}
											>
												MARKET PRICE · UNOPENED
											</Text>
											<Text
												style={[
													styles.heroPrice,
													{ color: colors.foreground },
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
														backgroundColor: colors.muted,
														borderColor: colors.border,
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
														{ backgroundColor: colors.card },
													]}
												>
													<Ionicons
														name="remove"
														size={16}
														color={colors.foreground}
													/>
												</Pressable>
												<Ionicons
													name="layers-outline"
													size={16}
													color={colors.primary}
												/>
												<Text
													style={[
														styles.quantityText,
														{ color: colors.foreground },
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
														{ backgroundColor: colors.card },
													]}
												>
													<Ionicons
														name="add"
														size={16}
														color={colors.foreground}
													/>
												</Pressable>
											</View>
										)}
									</View>

								{trendChips.length > 0 && (
									<View style={styles.trendRow}>
										{trendChips.map(({ label, pct }) => {
											const up = pct >= 0;
											const trendColor = up ? "#22c55e" : "#ef4444";
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
													<Ionicons
														name={up ? "trending-up" : "trending-down"}
														size={13}
														color={trendColor}
													/>
													<Text
														style={[
															styles.trendText,
															{ color: colors.foreground },
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
							style={[styles.divider, { backgroundColor: colors.border }]}
						/>

						{/* Identity — product name, set, type */}
						<Animated.View
							entering={sectionEntering(2)}
							style={styles.metaStrip}
						>
							<View style={{ flex: 1 }}>
								<Text
									style={[styles.productName, { color: colors.foreground }]}
								>
									{product.name}
								</Text>
								{!!product.expansion?.name && (
									<Text
										style={[
											styles.setName,
											{ color: colors.foreground, opacity: 0.7 },
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
											backgroundColor: colors.primary + "33",
											borderColor: colors.primary + "55",
										},
									]}
								>
									<Text style={[styles.pillText, { color: colors.foreground }]}>
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
										{ backgroundColor: colors.border },
									]}
								/>
								<Animated.View
									entering={sectionEntering(3)}
									style={styles.sheetSection}
								>
								<Text
									style={[
										styles.toggleLabel,
										{ color: colors.mutedForeground },
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
															? colors.primary
															: colors.muted,
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
																? colors.primaryForeground
																: colors.foreground,
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
							style={[styles.divider, { backgroundColor: colors.border }]}
						/>

						{/* Price Paid */}
						<Animated.View
							entering={sectionEntering(4)}
							style={styles.sheetSection}
						>
							<Text
								style={[styles.toggleLabel, { color: colors.mutedForeground }]}
							>
								Price Paid
							</Text>
							<View
								style={[
									styles.pricePaidRow,
									{
										backgroundColor: colors.input,
										borderColor: colors.border,
									},
								]}
							>
								<Text
									style={[
										styles.pricePaidSymbol,
										{ color: colors.mutedForeground },
									]}
								>
									$
								</Text>
								<TextInput
									style={[styles.pricePaidInput, { color: colors.foreground }]}
									value={pricePaid}
									onChangeText={(v) => {
										const cleaned = v
											.replace(/[^0-9.]/g, "")
											.replace(/(\..*)\./g, "$1");
										setPricePaid(cleaned);
									}}
									placeholder="0.00"
									placeholderTextColor={colors.mutedForeground}
									keyboardType="decimal-pad"
									returnKeyType="done"
								/>
							</View>
						</Animated.View>

						{/* Description */}
						{!!product.description && (
							<>
								<View
									style={[
										styles.divider,
										{ backgroundColor: colors.border },
									]}
								/>
								<Animated.View
									entering={sectionEntering(5)}
									style={styles.sheetSection}
								>
								<Text
									style={[styles.sectionTitle, { color: colors.foreground }]}
								>
									{"What's Inside"}
								</Text>
								<Text
									style={[
										styles.description,
										{ color: colors.foreground, opacity: 0.85 },
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
									style={[styles.divider, { backgroundColor: colors.border }]}
								/>
								<Pressable
									onPress={confirmRemove}
									style={[
										styles.removeButton,
										{
											borderColor: colors.destructive ?? "#ef4444",
											marginHorizontal: 22,
											marginTop: 18,
										},
									]}
								>
									<Ionicons
										name="trash-outline"
										size={18}
										color={colors.destructive ?? "#ef4444"}
									/>
									<Text
										style={[
											styles.removeButtonText,
											{ color: colors.destructive ?? "#ef4444" },
										]}
									>
										Remove from Collection
									</Text>
								</Pressable>
							</Animated.View>
						)}
						</View>
					</ScrollView>
				</View>
			) : (
				<View
					style={[
						styles.container,
						styles.centered,
						{ backgroundColor: colors.background },
					]}
				>
					{isError ? (
						<ErrorState
							title="Couldn't load product"
							onRetry={() => refetch()}
						/>
					) : (
						<Text style={{ color: colors.mutedForeground }}>
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
	grabber: {
		width: 38,
		height: 5,
		borderRadius: 3,
		alignSelf: "center",
		marginBottom: 6,
	},
	sheetSection: {
		paddingHorizontal: 22,
		paddingVertical: 18,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginHorizontal: 22,
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
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 2,
		marginBottom: 8,
	},
	heroPrice: {
		fontSize: 44,
		fontWeight: "800",
		letterSpacing: -1.5,
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
		fontSize: 11,
		fontWeight: "600",
		letterSpacing: 0.5,
		textTransform: "uppercase",
		marginBottom: 8,
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
