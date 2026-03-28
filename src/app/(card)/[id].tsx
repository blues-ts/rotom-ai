import { useEffect, useMemo, useRef, useState } from "react";
import {
	Dimensions,
	Image,
	Pressable,
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
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { CartesianChart, Line } from "victory-native";
import { useApi } from "@/lib/axios";
import { useTheme } from "@/context/ThemeContext";

const SCREEN_WIDTH = Dimensions.get("window").width;
const IMAGE_WIDTH = SCREEN_WIDTH * 0.9;
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
		.toLowerCase()
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

function buildGradedTierKey(company: string, grade: string): string {
	return `${company}_${grade.replace(/\./g, "_")}`;
}

// --- Shared UI Components ---

function FadeImage({ uri, name, cardNumber, style, backgroundColor, shimmerColor, foregroundColor, mutedColor }: {
	uri: string;
	name?: string;
	cardNumber?: string;
	style: any;
	backgroundColor: string;
	shimmerColor: string;
	foregroundColor: string;
	mutedColor: string;
}) {
	const opacity = useSharedValue(0);
	const shimmerOpacity = useSharedValue(0.3);
	const [loaded, setLoaded] = useState(false);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		shimmerOpacity.value = withRepeat(
			withSequence(
				withTiming(0.7, { duration: 800 }),
				withTiming(0.3, { duration: 800 }),
			),
			-1,
		);
	}, []);

	const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
	const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmerOpacity.value }));

	if (failed) {
		return (
			<View style={[style, { backgroundColor, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 8 }]}>
				<Ionicons name="image-outline" size={40} color={mutedColor} />
				{name && <Text style={{ color: foregroundColor, fontSize: 16, fontWeight: "600", textAlign: "center", paddingHorizontal: 16 }}>{name}</Text>}
				{cardNumber && <Text style={{ color: mutedColor, fontSize: 13 }}>#{cardNumber}</Text>}
			</View>
		);
	}

	return (
		<View style={[style, { backgroundColor, overflow: "hidden", borderRadius: 12 }]}>
			{!loaded && <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: shimmerColor }, shimmerStyle]} />}
			<Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
				<Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" onLoad={() => { setLoaded(true); opacity.value = withTiming(1, { duration: 200 }); }} onError={() => setFailed(true)} />
			</Animated.View>
		</View>
	);
}

function Skeleton({ width, height, color, style }: { width: number | string; height: number; color: string; style?: any }) {
	const shimmerOpacity = useSharedValue(0.3);
	useEffect(() => {
		shimmerOpacity.value = withRepeat(withSequence(withTiming(0.7, { duration: 800 }), withTiming(0.3, { duration: 800 })), -1);
	}, []);
	const animatedStyle = useAnimatedStyle(() => ({ opacity: shimmerOpacity.value }));
	return <Animated.View style={[{ width, height, backgroundColor: color, borderRadius: 8 }, animatedStyle, style]} />;
}

function InfoPill({ label, color, bgColor }: { label: string; color: string; bgColor: string }) {
	return (
		<View style={[styles.pill, { backgroundColor: bgColor }]}>
			<Text style={[styles.pillText, { color }]}>{label}</Text>
		</View>
	);
}

// --- Ticker Animation ---

function TickerText({ value, style }: { value: string; style: any }) {
	const translateY = useSharedValue(0);
	const opacity = useSharedValue(1);
	const [displayValue, setDisplayValue] = useState(value);
	const isFirst = useRef(true);

	useEffect(() => {
		if (isFirst.current) {
			isFirst.current = false;
			return;
		}
		// Animate out: slide up + fade
		translateY.value = withTiming(-12, { duration: 120 });
		opacity.value = withTiming(0, { duration: 120 });

		const timeout = setTimeout(() => {
			setDisplayValue(value);
			// Reset to below
			translateY.value = 12;
			opacity.value = 0;
			// Animate in: slide up to center + fade in
			translateY.value = withTiming(0, { duration: 180 });
			opacity.value = withTiming(1, { duration: 180 });
		}, 130);

		return () => clearTimeout(timeout);
	}, [value]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
		opacity: opacity.value,
	}));

	return (
		<Animated.Text style={[style, animatedStyle]}>
			{displayValue}
		</Animated.Text>
	);
}

// --- Toggle & Dropdown Components ---

function PillToggle({ options, selected, onSelect, colors }: {
	options: string[];
	selected: string;
	onSelect: (val: string) => void;
	colors: any;
}) {
	return (
		<View style={styles.toggleRow}>
			{options.map((opt) => {
				const active = opt === selected;
				return (
					<Pressable
						key={opt}
						style={[styles.togglePill, {
							backgroundColor: active ? colors.foreground : colors.card,
							borderColor: active ? colors.foreground : colors.border,
						}]}
						onPress={() => onSelect(opt)}
					>
						<Text style={[styles.toggleText, { color: active ? colors.background : colors.mutedForeground }]}>
							{opt}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

function Dropdown({ options, selected, onSelect, colors, placeholder }: {
	options: { label: string; value: string }[];
	selected: string | null;
	onSelect: (val: string) => void;
	colors: any;
	placeholder?: string;
}) {
	const [open, setOpen] = useState(false);
	const [showMenu, setShowMenu] = useState(false);
	const menuHeight = useSharedValue(0);
	const menuOpacity = useSharedValue(0);
	const chevronRotation = useSharedValue(0);
	const selectedLabel = options.find((o) => o.value === selected)?.label ?? placeholder ?? "Select";

	const ITEM_HEIGHT = 40;
	const fullHeight = options.length * ITEM_HEIGHT;

	useEffect(() => {
		if (open) {
			setShowMenu(true);
			menuHeight.value = withTiming(fullHeight, { duration: 200 });
			menuOpacity.value = withTiming(1, { duration: 150 });
			chevronRotation.value = withTiming(180, { duration: 200 });
		} else {
			menuHeight.value = withTiming(0, { duration: 200 });
			menuOpacity.value = withTiming(0, { duration: 150 });
			chevronRotation.value = withTiming(0, { duration: 200 });
			const timeout = setTimeout(() => setShowMenu(false), 210);
			return () => clearTimeout(timeout);
		}
	}, [open]);

	const menuAnimatedStyle = useAnimatedStyle(() => ({
		height: menuHeight.value,
		opacity: menuOpacity.value,
	}));

	const chevronStyle = useAnimatedStyle(() => ({
		transform: [{ rotate: `${chevronRotation.value}deg` }],
	}));

	return (
		<View>
			<Pressable
				style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}
				onPress={() => setOpen(!open)}
			>
				<Text style={[styles.dropdownText, { color: colors.foreground }]}>{selectedLabel}</Text>
				<Animated.View style={chevronStyle}>
					<Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
				</Animated.View>
			</Pressable>
			{showMenu && (
				<Animated.View style={[styles.dropdownMenu, { backgroundColor: colors.card, borderColor: colors.border, overflow: "hidden" }, menuAnimatedStyle]}>
					{options.map((opt) => (
						<Pressable
							key={opt.value}
							style={[styles.dropdownItem, { height: ITEM_HEIGHT, justifyContent: "center" }, selected === opt.value && { backgroundColor: `${colors.primary}20` }]}
							onPress={() => { onSelect(opt.value); setOpen(false); }}
						>
							<Text style={[styles.dropdownItemText, {
								color: selected === opt.value ? colors.primary : colors.foreground,
							}]}>
								{opt.label}
							</Text>
						</Pressable>
					))}
				</Animated.View>
			)}
		</View>
	);
}

// --- Period Toggle ---

const PERIODS = ["7d", "30d", "90d", "1y", "all"] as const;

function PeriodToggle({ selected, onSelect, colors }: {
	selected: string;
	onSelect: (val: string) => void;
	colors: any;
}) {
	return (
		<View style={styles.toggleRow}>
			{PERIODS.map((p) => {
				const active = p === selected;
				return (
					<Pressable
						key={p}
						style={[styles.periodPill, {
							backgroundColor: active ? colors.foreground : "transparent",
						}]}
						onPress={() => onSelect(p)}
					>
						<Text style={[styles.periodText, {
							color: active ? colors.background : colors.mutedForeground,
						}]}>
							{p.toUpperCase()}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

// --- Loading Skeleton ---

function LoadingSkeleton({ colors }: { colors: any }) {
	return (
		<>
			<View style={styles.imageContainer}>
				<Skeleton width={IMAGE_WIDTH} height={IMAGE_HEIGHT} color={colors.border} style={{ borderRadius: 12 }} />
			</View>
			<View style={{ gap: 8, paddingHorizontal: 20, marginBottom: 16 }}>
				<Skeleton width="60%" height={24} color={colors.border} />
				<Skeleton width="40%" height={18} color={colors.border} />
				<View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
					<Skeleton width={70} height={28} color={colors.border} />
					<Skeleton width={90} height={28} color={colors.border} />
				</View>
			</View>
			{/* Price row skeleton */}
			<View style={[styles.priceRow, { borderColor: colors.border }]}>
				<View style={[styles.priceTag, { flex: 1 }]}>
					<Skeleton width={100} height={12} color={colors.border} />
					<Skeleton width={80} height={22} color={colors.border} style={{ marginTop: 6 }} />
				</View>
				<View style={[styles.priceTag, { flex: 1 }]}>
					<Skeleton width={60} height={12} color={colors.border} />
					<Skeleton width={90} height={22} color={colors.border} style={{ marginTop: 6 }} />
				</View>
			</View>
			{/* Section skeletons */}
			<View style={{ gap: 8, paddingHorizontal: 20 }}>
				<Skeleton width="100%" height={120} color={colors.border} />
				<Skeleton width="100%" height={120} color={colors.border} />
			</View>
		</>
	);
}

// --- Main ---

export default function CardDetail() {
	const { colors } = useTheme();
	const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
	const api = useApi();

	// Raw state
	const [rawSource, setRawSource] = useState<string>("TCGPlayer");
	const [rawCondition, setRawCondition] = useState("NEAR_MINT");

	// Graded state
	const [gradedCompany, setGradedCompany] = useState<string | null>(null);
	const [gradedGrade, setGradedGrade] = useState<string | null>(null);

	// History
	const [historyPeriod, setHistoryPeriod] = useState("30d");

	// Card data
	const { data: card, isLoading } = useQuery({
		queryKey: ["card", id],
		queryFn: async () => {
			const res = await api.get(`/api/pricing/cards/${id}`);
			return res.data.data;
		},
		enabled: !!id,
	});

	// Derived: available grading companies and grades
	const gradedCompanies = useMemo(() => {
		if (!card?.gradedOptions) return [];
		const companies = new Set<string>();
		for (const tier of card.gradedOptions) {
			const { company } = parseGradedTier(tier);
			companies.add(company);
		}
		const arr = Array.from(companies);
		// Put PSA first
		arr.sort((a, b) => (a === "PSA" ? -1 : b === "PSA" ? 1 : 0));
		return arr;
	}, [card?.gradedOptions]);

	const gradedGrades = useMemo(() => {
		if (!card?.gradedOptions || !gradedCompany) return [];
		return card.gradedOptions
			.map((tier: string) => parseGradedTier(tier))
			.filter((p: any) => p.company === gradedCompany)
			.map((p: any) => p.grade)
			.sort((a: string, b: string) => parseFloat(b) - parseFloat(a));
	}, [card?.gradedOptions, gradedCompany]);

	// Auto-select first company and highest grade
	useEffect(() => {
		if (gradedCompanies.length > 0 && !gradedCompany) {
			setGradedCompany(gradedCompanies[0]);
		}
	}, [gradedCompanies]);

	useEffect(() => {
		if (gradedGrades.length > 0) {
			setGradedGrade(gradedGrades[0]);
		}
	}, [gradedGrades]);

	// Condition options
	const conditionOptions = useMemo(() => {
		if (!card?.conditionOptions) return [{ label: "Near Mint", value: "NEAR_MINT" }];
		return card.conditionOptions.map((c: string) => ({
			label: formatTierLabel(c),
			value: c,
		}));
	}, [card?.conditionOptions]);

	// Get current prices
	const rawSourceKey = rawSource === "eBay" ? "ebay" : "tcgplayer";
	const rawPrice = card?.prices?.[rawSourceKey]?.[rawCondition]?.avg;

	const gradedTierKey = gradedCompany && gradedGrade ? buildGradedTierKey(gradedCompany, gradedGrade) : null;
	const gradedPrice = gradedTierKey ? (card?.prices?.ebay?.[gradedTierKey]?.avg ?? card?.prices?.tcgplayer?.[gradedTierKey]?.avg) : undefined;

	// History queries
	const { data: rawHistory, isLoading: rawHistoryLoading } = useQuery({
		queryKey: ["history", id, rawCondition, historyPeriod],
		queryFn: async () => {
			const res = await api.get(`/api/pricing/cards/${id}/history/${rawCondition}`, {
				params: { period: historyPeriod, limit: 365 },
			});
			return res.data.data ?? [];
		},
		enabled: !!id && !!rawCondition,
	});

	const { data: gradedHistory, isLoading: gradedHistoryLoading } = useQuery({
		queryKey: ["history", id, gradedTierKey, historyPeriod],
		queryFn: async () => {
			const res = await api.get(`/api/pricing/cards/${id}/history/${gradedTierKey}`, {
				params: { period: historyPeriod, limit: 365 },
			});
			return res.data.data ?? [];
		},
		enabled: !!id && !!gradedTierKey,
	});

	// Filter history by selected source
	const filteredRawHistory = useMemo(() => {
		if (!rawHistory) return [];
		return rawHistory
			.filter((e: any) => e.source === rawSourceKey)
			.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
	}, [rawHistory, rawSourceKey]);

	const filteredGradedHistory = useMemo(() => {
		if (!gradedHistory) return [];
		return gradedHistory
			.filter((e: any) => e.source === "ebay")
			.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
	}, [gradedHistory]);

	// Chart data
	const chartData = useMemo(() => {
		const map = new Map<string, { date: string; raw?: number; graded?: number }>();
		for (const e of filteredRawHistory) {
			const key = e.date;
			if (!map.has(key)) map.set(key, { date: key });
			map.get(key)!.raw = e.avg;
		}
		for (const e of filteredGradedHistory) {
			const key = e.date;
			if (!map.has(key)) map.set(key, { date: key });
			map.get(key)!.graded = e.avg;
		}
		return Array.from(map.values())
			.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
			.map((d, i) => ({ ...d, index: i }));
	}, [filteredRawHistory, filteredGradedHistory]);

	// Combined history list (most recent first)
	const historyList = useMemo(() => {
		const items: { date: string; source: string; type: string; avg: number; saleCount?: number }[] = [];
		for (const e of filteredRawHistory) {
			items.push({ date: e.date, source: rawSource, type: "Raw", avg: e.avg, saleCount: e.saleCount });
		}
		for (const e of filteredGradedHistory) {
			items.push({ date: e.date, source: "eBay", type: gradedCompany ? `${gradedCompany} ${gradedGrade}` : "Graded", avg: e.avg, saleCount: e.saleCount });
		}
		return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	}, [filteredRawHistory, filteredGradedHistory, rawSource, gradedCompany, gradedGrade]);

	return (
		<>
			<Stack.Screen options={{ headerTitle: name ?? "Card" }} />

			{isLoading ? (
				<ScrollView
					style={[styles.container, { backgroundColor: colors.background }]}
					contentContainerStyle={styles.content}
					contentInsetAdjustmentBehavior="automatic"
					scrollEnabled={false}
				>
					<LoadingSkeleton colors={colors} />
				</ScrollView>
			) : card ? (
				<ScrollView
					style={[styles.container, { backgroundColor: colors.background }]}
					contentContainerStyle={styles.content}
					contentInsetAdjustmentBehavior="automatic"
					showsVerticalScrollIndicator={false}
				>
					{/* Card Image */}
					<View style={styles.imageContainer}>
						<FadeImage
							uri={card.image ?? ""}
							name={card.name}
							cardNumber={card.cardNumber}
							style={{ width: IMAGE_WIDTH, height: IMAGE_HEIGHT }}
							backgroundColor={colors.card}
							shimmerColor={colors.border}
							foregroundColor={colors.foreground}
							mutedColor={colors.mutedForeground}
						/>
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
							{card.rarity && <InfoPill label={card.rarity} color={colors.foreground} bgColor={colors.border} />}
							{card.variant && <InfoPill label={card.variant.replace(/_/g, " ")} color={colors.primary} bgColor={`${colors.primary}20`} />}
						</View>
					</View>

					{/* Prices */}
					<View style={[styles.priceRow, { borderColor: colors.border }]}>
						<View style={[styles.priceTag, { overflow: "hidden", flex: 1 }]}>
							<TickerText
								value={`${rawSource} ${formatTierLabel(rawCondition)}`}
								style={[styles.priceTagLabel, { color: colors.mutedForeground }]}
							/>
							<TickerText
								value={formatPrice(rawPrice, card.currency)}
								style={[styles.priceTagValue, { color: colors.foreground }]}
							/>
						</View>
						{gradedPrice !== undefined && (
							<View style={[styles.priceTag, { overflow: "hidden", flex: 1 }]}>
								<TickerText
									value={`${gradedCompany} ${gradedGrade}`}
									style={[styles.priceTagLabel, { color: colors.mutedForeground }]}
								/>
								<TickerText
									value={formatPrice(gradedPrice, card.currency)}
									style={[styles.priceTagValue, { color: colors.primary }]}
								/>
							</View>
						)}
					</View>

					{/* Raw Section */}
					<View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
						<Text style={[styles.sectionTitle, { color: colors.foreground }]}>Raw</Text>
						<PillToggle
							options={["TCGPlayer", "eBay"]}
							selected={rawSource}
							onSelect={setRawSource}
							colors={colors}
						/>
						<View style={{ marginTop: 10 }}>
							<Dropdown
								options={conditionOptions}
								selected={rawCondition}
								onSelect={setRawCondition}
								colors={colors}
								placeholder="Condition"
							/>
						</View>
					</View>

					{/* Graded Section */}
					{gradedCompanies.length > 0 && (
						<View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
							<Text style={[styles.sectionTitle, { color: colors.foreground }]}>Graded</Text>
							<PillToggle
								options={gradedCompanies}
								selected={gradedCompany ?? ""}
								onSelect={(val) => {
									setGradedCompany(val);
									// Immediately pick highest grade for new company
									const grades = (card.gradedOptions ?? [])
										.map((t: string) => parseGradedTier(t))
										.filter((p: any) => p.company === val)
										.map((p: any) => p.grade)
										.sort((a: string, b: string) => parseFloat(b) - parseFloat(a));
									setGradedGrade(grades[0] ?? null);
								}}
								colors={colors}
							/>
							{gradedGrades.length > 0 && (
								<View style={{ marginTop: 10 }}>
									<Dropdown
										options={gradedGrades.map((g: string) => ({ label: g, value: g }))}
										selected={gradedGrade}
										onSelect={setGradedGrade}
										colors={colors}
										placeholder="Grade"
									/>
								</View>
							)}
						</View>
					)}

					{/* Price History Chart */}
					<View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
						<Text style={[styles.sectionTitle, { color: colors.foreground }]}>Price History</Text>
						<PeriodToggle selected={historyPeriod} onSelect={setHistoryPeriod} colors={colors} />

						{(rawHistoryLoading || gradedHistoryLoading) ? (
							<View style={styles.chartPlaceholder}>
								<Skeleton width="100%" height={200} color={colors.border} />
							</View>
						) : chartData.length > 0 ? (
							<View style={styles.chartContainer}>
								<CartesianChart
									data={chartData}
									xKey="index"
									yKeys={["raw", "graded"]}
									domainPadding={{ top: 20, bottom: 10 }}
								>
									{({ points }) => (
										<>
											{points.raw && (
												<Line
													points={points.raw.filter((p: any) => p.y !== undefined)}
													color={colors.foreground}
													strokeWidth={2}
													curveType="natural"
												/>
											)}
											{points.graded && (
												<Line
													points={points.graded.filter((p: any) => p.y !== undefined)}
													color={colors.primary}
													strokeWidth={2}
													curveType="natural"
												/>
											)}
										</>
									)}
								</CartesianChart>
							</View>
						) : (
							<View style={styles.chartPlaceholder}>
								<Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No history data available</Text>
							</View>
						)}

						{/* Legend */}
						<View style={styles.legendRow}>
							<View style={styles.legendItem}>
								<View style={[styles.legendDot, { backgroundColor: colors.foreground }]} />
								<Text style={[styles.legendText, { color: colors.mutedForeground }]}>
									{rawSource} · {formatTierLabel(rawCondition)}
								</Text>
							</View>
							{gradedTierKey && (
								<View style={styles.legendItem}>
									<View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
									<Text style={[styles.legendText, { color: colors.mutedForeground }]}>
										{gradedCompany} {gradedGrade}
									</Text>
								</View>
							)}
						</View>
					</View>

					{/* History List */}
					{historyList.length > 0 && (
						<View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
							<Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Sales</Text>
							{historyList.slice(0, 20).map((item, i) => (
								<View key={`${item.date}-${item.type}-${i}`} style={styles.historyRow}>
									<View style={{ flex: 1 }}>
										<Text style={[styles.historyDate, { color: colors.foreground }]}>
											{new Date(item.date).toLocaleDateString()}
										</Text>
										<Text style={[styles.historyMeta, { color: colors.mutedForeground }]}>
											{item.type} · {item.source}
										</Text>
									</View>
									<View style={{ alignItems: "flex-end" }}>
										<Text style={[styles.historyPrice, { color: colors.foreground }]}>
											{formatPrice(item.avg, card.currency)}
										</Text>
										{item.saleCount !== undefined && item.saleCount > 0 && (
											<Text style={[styles.historyMeta, { color: colors.mutedForeground }]}>
												{item.saleCount} sale{item.saleCount !== 1 ? "s" : ""}
											</Text>
										)}
									</View>
								</View>
							))}
						</View>
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
	imageContainer: {
		alignItems: "center",
		marginBottom: 20,
	},
	infoContainer: {
		paddingHorizontal: 20,
		marginBottom: 12,
	},
	priceRow: {
		flexDirection: "row",
		paddingHorizontal: 20,
		paddingVertical: 14,
		marginBottom: 12,
		borderTopWidth: 1,
		borderBottomWidth: 1,
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
	priceColumn: {
		alignItems: "flex-end",
		justifyContent: "center",
		gap: 6,
	},
	priceTag: {
		alignItems: "center",
	},
	priceTagLabel: {
		fontSize: 11,
		fontWeight: "500",
	},
	priceTagValue: {
		fontSize: 20,
		fontWeight: "700",
	},
	section: {
		marginHorizontal: 20,
		marginBottom: 12,
		borderRadius: 12,
		borderWidth: 1,
		padding: 16,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "700",
		marginBottom: 12,
	},
	toggleRow: {
		flexDirection: "row",
		gap: 8,
		flexWrap: "wrap",
	},
	togglePill: {
		paddingHorizontal: 14,
		paddingVertical: 7,
		borderRadius: 8,
		borderWidth: 1,
	},
	toggleText: {
		fontSize: 13,
		fontWeight: "600",
	},
	dropdown: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 8,
		borderWidth: 1,
	},
	dropdownText: {
		fontSize: 14,
		fontWeight: "500",
	},
	dropdownMenu: {
		marginTop: 4,
		borderRadius: 8,
		borderWidth: 1,
		overflow: "hidden",
	},
	dropdownItem: {
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	dropdownItemText: {
		fontSize: 14,
	},
	periodPill: {
		paddingHorizontal: 12,
		paddingVertical: 5,
		borderRadius: 6,
	},
	periodText: {
		fontSize: 12,
		fontWeight: "600",
	},
	chartContainer: {
		height: 200,
		marginTop: 12,
	},
	chartPlaceholder: {
		height: 200,
		marginTop: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	legendRow: {
		flexDirection: "row",
		gap: 16,
		marginTop: 12,
	},
	legendItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	legendDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	legendText: {
		fontSize: 12,
	},
	historyRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 10,
	},
	historyDate: {
		fontSize: 14,
		fontWeight: "500",
	},
	historyMeta: {
		fontSize: 12,
		marginTop: 2,
	},
	historyPrice: {
		fontSize: 15,
		fontWeight: "600",
	},
	lastUpdated: {
		fontSize: 12,
		textAlign: "center",
		marginTop: 16,
	},
});
