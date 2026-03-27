import { useEffect, useState } from "react";
import {
	Dimensions,
	Image,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/axios";
import { useTheme } from "@/context/ThemeContext";

const SCREEN_WIDTH = Dimensions.get("window").width;
const IMAGE_WIDTH = SCREEN_WIDTH * 0.75;
const IMAGE_HEIGHT = IMAGE_WIDTH * 1.4;

// --- Helpers ---

function formatPrice(price: number | undefined, currency = "USD"): string {
	if (price === undefined || price === null) return "—";
	const symbol = currency === "EUR" ? "€" : "$";
	return `${symbol}${price.toFixed(2)}`;
}

function formatTierLabel(tier: string): string {
	return tier
		.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseGradedTier(tier: string): { company: string; grade: string } {
	const parts = tier.split("_");
	if (parts.length >= 2) {
		const company = parts[0].toUpperCase();
		const grade = parts.slice(1).join(".");
		return { company, grade };
	}
	return { company: tier, grade: "" };
}

function isGradedTier(tier: string): boolean {
	const rawConditions = [
		"MINT", "NEAR_MINT", "LIGHTLY_PLAYED",
		"MODERATELY_PLAYED", "HEAVILY_PLAYED", "DAMAGED", "AGGREGATED",
	];
	return !rawConditions.includes(tier);
}

// --- Components ---

function FadeImage({ uri, style, backgroundColor, shimmerColor }: {
	uri: string;
	style: any;
	backgroundColor: string;
	shimmerColor: string;
}) {
	const opacity = useSharedValue(0);
	const shimmerOpacity = useSharedValue(0.3);
	const [loaded, setLoaded] = useState(false);

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
		opacity: opacity.value,
	}));

	const shimmerStyle = useAnimatedStyle(() => ({
		opacity: shimmerOpacity.value,
	}));

	return (
		<View style={[style, { backgroundColor, overflow: "hidden", borderRadius: 12 }]}>
			{!loaded && (
				<Animated.View
					style={[StyleSheet.absoluteFill, { backgroundColor: shimmerColor }, shimmerStyle]}
				/>
			)}
			<Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
				<Image
					source={{ uri }}
					style={StyleSheet.absoluteFill}
					resizeMode="contain"
					onLoad={() => {
						setLoaded(true);
						opacity.value = withTiming(1, { duration: 200 });
					}}
				/>
			</Animated.View>
		</View>
	);
}

function Skeleton({ width, height, color, style }: {
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
			style={[{ width, height, backgroundColor: color, borderRadius: 8 }, animatedStyle, style]}
		/>
	);
}

function InfoPill({ label, color, bgColor }: { label: string; color: string; bgColor: string }) {
	return (
		<View style={[styles.pill, { backgroundColor: bgColor }]}>
			<Text style={[styles.pillText, { color }]}>{label}</Text>
		</View>
	);
}

function PriceRow({ label, avg, low, high, saleCount, currency, colors }: {
	label: string;
	avg?: number;
	low?: number;
	high?: number;
	saleCount?: number;
	currency: string;
	colors: any;
}) {
	return (
		<View style={styles.priceRow}>
			<Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>{label}</Text>
			<View style={styles.priceValues}>
				<Text style={[styles.priceAvg, { color: colors.foreground }]}>
					{formatPrice(avg, currency)}
				</Text>
				{low !== undefined && high !== undefined && (
					<Text style={[styles.priceRange, { color: colors.mutedForeground }]}>
						{formatPrice(low, currency)} – {formatPrice(high, currency)}
					</Text>
				)}
				{saleCount !== undefined && saleCount > 0 && (
					<Text style={[styles.saleBadge, { color: colors.mutedForeground }]}>
						{saleCount} sale{saleCount !== 1 ? "s" : ""}
					</Text>
				)}
			</View>
		</View>
	);
}

function PriceSection({ title, tiers, currency, colors }: {
	title: string;
	tiers: Record<string, any>;
	currency: string;
	colors: any;
}) {
	const entries = Object.entries(tiers).filter(([key]) => !isGradedTier(key));
	if (entries.length === 0) return null;

	return (
		<View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
			<Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
			{entries.map(([tier, data]) => (
				<PriceRow
					key={tier}
					label={formatTierLabel(tier)}
					avg={data.avg}
					low={data.low}
					high={data.high}
					saleCount={data.saleCount}
					currency={currency}
					colors={colors}
				/>
			))}
		</View>
	);
}

function GradedSection({ prices, gradedOptions, currency, colors }: {
	prices: any;
	gradedOptions: string[];
	currency: string;
	colors: any;
}) {
	// Group graded tiers by company
	const companies: Record<string, { grade: string; data: any }[]> = {};

	for (const tier of gradedOptions) {
		const { company, grade } = parseGradedTier(tier);
		// Find price data from ebay first, then tcgplayer
		const data = prices?.ebay?.[tier] || prices?.tcgplayer?.[tier];
		if (!data) continue;

		if (!companies[company]) companies[company] = [];
		companies[company].push({ grade, data });
	}

	const companyEntries = Object.entries(companies);
	if (companyEntries.length === 0) return null;

	return (
		<>
			{companyEntries.map(([company, grades]) => (
				<View key={company} style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
					<Text style={[styles.sectionTitle, { color: colors.foreground }]}>{company}</Text>
					{grades.map(({ grade, data }) => (
						<PriceRow
							key={grade}
							label={grade}
							avg={data.avg}
							low={data.low}
							high={data.high}
							saleCount={data.saleCount}
							currency={currency}
							colors={colors}
						/>
					))}
				</View>
			))}
		</>
	);
}

// --- Loading Skeleton ---

function LoadingSkeleton({ colors }: { colors: any }) {
	return (
		<View style={styles.skeletonContainer}>
			<Skeleton width={IMAGE_WIDTH} height={IMAGE_HEIGHT} color={colors.border} style={{ alignSelf: "center" }} />
			<View style={{ gap: 8, marginTop: 20, paddingHorizontal: 20 }}>
				<Skeleton width="60%" height={24} color={colors.border} />
				<Skeleton width="40%" height={18} color={colors.border} />
				<View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
					<Skeleton width={70} height={28} color={colors.border} />
					<Skeleton width={90} height={28} color={colors.border} />
				</View>
			</View>
			<View style={{ gap: 8, marginTop: 24, paddingHorizontal: 20 }}>
				<Skeleton width="100%" height={120} color={colors.border} />
				<Skeleton width="100%" height={120} color={colors.border} />
			</View>
		</View>
	);
}

// --- Main ---

export default function CardDetail() {
	const { colors } = useTheme();
	const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
	const api = useApi();

	const { data: card, isLoading } = useQuery({
		queryKey: ["card", id],
		queryFn: async () => {
			const res = await api.get(`/api/pricing/cards/${id}`);
			return res.data.data;
		},
		enabled: !!id,
	});

	return (
		<>
			<Stack.Screen options={{ headerTitle: name ?? "Card" }} />

			{isLoading ? (
				<View style={[styles.container, { backgroundColor: colors.background }]}>
					<LoadingSkeleton colors={colors} />
				</View>
			) : card ? (
				<ScrollView
					style={[styles.container, { backgroundColor: colors.background }]}
					contentContainerStyle={styles.content}
					contentInsetAdjustmentBehavior="automatic"
					showsVerticalScrollIndicator={false}
				>
					{/* Card Image */}
					<View style={styles.imageContainer}>
						{card.image ? (
							<FadeImage
								uri={card.image}
								style={{ width: IMAGE_WIDTH, height: IMAGE_HEIGHT }}
								backgroundColor={colors.card}
								shimmerColor={colors.border}
							/>
						) : (
							<View style={[styles.imagePlaceholder, { backgroundColor: colors.card, width: IMAGE_WIDTH, height: IMAGE_HEIGHT }]}>
								<Text style={{ color: colors.mutedForeground, fontSize: 16 }}>No image</Text>
							</View>
						)}
					</View>

					{/* Card Info */}
					<View style={styles.infoContainer}>
						<Text style={[styles.cardName, { color: colors.foreground }]}>
							{card.name}
							{card.cardNumber ? (
								<Text style={{ color: colors.mutedForeground }}> · {card.cardNumber}</Text>
							) : null}
						</Text>
						<Text style={[styles.setName, { color: colors.mutedForeground }]}>
							{card.set?.name}
						</Text>
						<View style={styles.pillRow}>
							{card.rarity && (
								<InfoPill label={card.rarity} color={colors.foreground} bgColor={colors.border} />
							)}
							{card.variant && (
								<InfoPill
									label={card.variant.replace(/_/g, " ")}
									color={colors.primary}
									bgColor={`${colors.primary}20`}
								/>
							)}
						</View>
					</View>

					{/* Top Price / Sale Count */}
					{(card.topPrice || card.totalSaleCount) && (
						<View style={[styles.statsRow, { borderColor: colors.border }]}>
							{card.topPrice !== undefined && (
								<View style={styles.statItem}>
									<Text style={[styles.statValue, { color: colors.foreground }]}>
										{formatPrice(card.topPrice, card.currency)}
									</Text>
									<Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
										Top Price
									</Text>
								</View>
							)}
							{card.totalSaleCount !== undefined && (
								<View style={styles.statItem}>
									<Text style={[styles.statValue, { color: colors.foreground }]}>
										{card.totalSaleCount.toLocaleString()}
									</Text>
									<Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
										Total Sales
									</Text>
								</View>
							)}
						</View>
					)}

					{/* eBay Prices */}
					{card.prices?.ebay && (
						<PriceSection
							title="eBay"
							tiers={card.prices.ebay}
							currency={card.currency}
							colors={colors}
						/>
					)}

					{/* TCGPlayer Prices */}
					{card.prices?.tcgplayer && (
						<PriceSection
							title="TCGPlayer"
							tiers={card.prices.tcgplayer}
							currency={card.currency}
							colors={colors}
						/>
					)}

					{/* Graded Prices */}
					{card.gradedOptions && card.gradedOptions.length > 0 && (
						<GradedSection
							prices={card.prices}
							gradedOptions={card.gradedOptions}
							currency={card.currency}
							colors={colors}
						/>
					)}

					{/* Last Updated */}
					{card.lastUpdated && (
						<Text style={[styles.lastUpdated, { color: colors.mutedForeground }]}>
							Last updated {new Date(card.lastUpdated).toLocaleDateString()}
						</Text>
					)}

					<View style={{ height: 40 }} />
				</ScrollView>
			) : (
				<View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
					<Text style={{ color: colors.mutedForeground }}>Card not found</Text>
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
		paddingTop: 16,
		paddingBottom: 40,
	},
	skeletonContainer: {
		paddingTop: 16,
	},
	imageContainer: {
		alignItems: "center",
		marginBottom: 20,
	},
	imagePlaceholder: {
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	infoContainer: {
		paddingHorizontal: 20,
		marginBottom: 16,
	},
	cardName: {
		fontSize: 22,
		fontWeight: "700",
	},
	setName: {
		fontSize: 15,
		marginTop: 4,
	},
	pillRow: {
		flexDirection: "row",
		gap: 8,
		marginTop: 10,
		flexWrap: "wrap",
	},
	pill: {
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 6,
	},
	pillText: {
		fontSize: 12,
		fontWeight: "600",
	},
	statsRow: {
		flexDirection: "row",
		marginHorizontal: 20,
		paddingVertical: 14,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderBottomWidth: StyleSheet.hairlineWidth,
		marginBottom: 16,
		gap: 32,
	},
	statItem: {
		alignItems: "center",
	},
	statValue: {
		fontSize: 18,
		fontWeight: "700",
	},
	statLabel: {
		fontSize: 12,
		marginTop: 2,
	},
	section: {
		marginHorizontal: 20,
		marginBottom: 12,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "700",
		marginBottom: 12,
	},
	priceRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 8,
	},
	priceLabel: {
		fontSize: 13,
		flex: 1,
	},
	priceValues: {
		alignItems: "flex-end",
	},
	priceAvg: {
		fontSize: 15,
		fontWeight: "600",
	},
	priceRange: {
		fontSize: 11,
		marginTop: 2,
	},
	saleBadge: {
		fontSize: 11,
		marginTop: 1,
	},
	lastUpdated: {
		fontSize: 12,
		textAlign: "center",
		marginTop: 16,
	},
});
