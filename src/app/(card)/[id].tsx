import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Alert,
	Dimensions,
	Image,
	LayoutChangeEvent,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useQuery } from "@tanstack/react-query";
import { CartesianChart, Line } from "victory-native";
import { useApi } from "@/lib/axios";
import { useTheme } from "@/context/ThemeContext";
import { useCollections } from "@/hooks/useCollections";

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

function FadeImage({
	uri,
	name,
	cardNumber,
	style,
	backgroundColor,
	shimmerColor,
	foregroundColor,
	mutedColor,
}: {
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

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
	}));
	const shimmerStyle = useAnimatedStyle(() => ({
		opacity: shimmerOpacity.value,
	}));

	if (failed) {
		return (
			<View
				style={[
					style,
					{
						backgroundColor,
						borderRadius: 14,
						alignItems: "center",
						justifyContent: "center",
						gap: 6,
					},
				]}
			>
				<Ionicons name="image-outline" size={28} color={mutedColor} />
				{name && (
					<Text
						style={{
							color: foregroundColor,
							fontSize: 12,
							fontWeight: "600",
							textAlign: "center",
							paddingHorizontal: 8,
						}}
						numberOfLines={2}
					>
						{name}
					</Text>
				)}
				{cardNumber && (
					<Text style={{ color: mutedColor, fontSize: 11 }}>
						#{cardNumber}
					</Text>
				)}
			</View>
		);
	}

	return (
		<View style={[style, { overflow: "hidden" }]}>
			{!loaded && (
				<Animated.View
					style={[
						StyleSheet.absoluteFill,
						{ backgroundColor: shimmerColor },
						shimmerStyle,
					]}
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
					onError={() => setFailed(true)}
				/>
			</Animated.View>
		</View>
	);
}

function ZoomableImage({
	children,
	width,
	height,
}: {
	children: React.ReactNode;
	width: number;
	height: number;
}) {
	const scale = useSharedValue(1);
	const savedScale = useSharedValue(1);
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const savedTranslateX = useSharedValue(0);
	const savedTranslateY = useSharedValue(0);

	const clampTranslation = (
		translationVal: number,
		scaleVal: number,
		dimension: number,
	) => {
		"worklet";
		const maxTranslate = ((scaleVal - 1) * dimension) / 2;
		return Math.min(Math.max(translationVal, -maxTranslate), maxTranslate);
	};

	const pinchGesture = Gesture.Pinch()
		.onUpdate((e) => {
			const newScale = savedScale.value * e.scale;
			scale.value = Math.min(Math.max(newScale, 0.5), 4);
		})
		.onEnd(() => {
			if (scale.value < 1) {
				scale.value = withSpring(1, { damping: 20, stiffness: 200 });
				translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
				translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
				savedScale.value = 1;
				savedTranslateX.value = 0;
				savedTranslateY.value = 0;
			} else {
				savedScale.value = scale.value;
				translateX.value = clampTranslation(
					translateX.value,
					scale.value,
					width,
				);
				translateY.value = clampTranslation(
					translateY.value,
					scale.value,
					height,
				);
				savedTranslateX.value = translateX.value;
				savedTranslateY.value = translateY.value;
			}
		});

	const panGesture = Gesture.Pan()
		.minPointers(2)
		.onUpdate((e) => {
			if (savedScale.value > 1) {
				translateX.value = clampTranslation(
					savedTranslateX.value + e.translationX,
					scale.value,
					width,
				);
				translateY.value = clampTranslation(
					savedTranslateY.value + e.translationY,
					scale.value,
					height,
				);
			}
		})
		.onEnd(() => {
			savedTranslateX.value = translateX.value;
			savedTranslateY.value = translateY.value;
		});

	const doubleTapGesture = Gesture.Tap()
		.numberOfTaps(2)
		.onStart(() => {
			if (scale.value > 1.1) {
				scale.value = withSpring(1, { damping: 20, stiffness: 200 });
				translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
				translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
				savedScale.value = 1;
				savedTranslateX.value = 0;
				savedTranslateY.value = 0;
			} else {
				scale.value = withSpring(2, { damping: 20, stiffness: 200 });
				savedScale.value = 2;
			}
		});

	const composed = Gesture.Simultaneous(pinchGesture, panGesture);
	const gesture = Gesture.Exclusive(doubleTapGesture, composed);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ scale: scale.value },
			{ translateX: translateX.value },
			{ translateY: translateY.value },
		],
	}));

	return (
		<GestureDetector gesture={gesture}>
			<Animated.View style={animatedStyle}>{children}</Animated.View>
		</GestureDetector>
	);
}

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

function InfoPill({
	label,
	color,
	bgColor,
}: {
	label: string;
	color: string;
	bgColor: string;
}) {
	return (
		<View style={[styles.pill, { backgroundColor: bgColor }]}>
			<Text style={[styles.pillText, { color }]}>{label}</Text>
		</View>
	);
}

// --- Ticker Animation ---

function TickerText({ value, style }: { value: string; style: any }) {
	const tickerOpacity = useSharedValue(1);
	const [displayValue, setDisplayValue] = useState(value);
	const isFirst = useRef(true);

	useEffect(() => {
		if (isFirst.current) {
			isFirst.current = false;
			return;
		}
		// Quick fade out, swap text, fade in — total ~160ms
		tickerOpacity.value = withTiming(0, { duration: 60 });

		const timeout = setTimeout(() => {
			setDisplayValue(value);
			tickerOpacity.value = withTiming(1, { duration: 100 });
		}, 60);

		return () => clearTimeout(timeout);
	}, [value]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: tickerOpacity.value,
	}));

	return (
		<Animated.Text style={[style, animatedStyle]}>
			{displayValue}
		</Animated.Text>
	);
}

// --- Toggle Components ---

function PillToggle({
	options,
	selected,
	onSelect,
	colors,
}: {
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
						style={[
							styles.togglePill,
							{
								backgroundColor: active
									? colors.foreground
									: colors.card,
								borderColor: active
									? colors.foreground
									: colors.border,
							},
						]}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							onSelect(opt);
						}}
					>
						<Text
							style={[
								styles.toggleText,
								{
									color: active
										? colors.background
										: colors.mutedForeground,
								},
							]}
						>
							{opt}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

function LabeledPillToggle({
	options,
	selected,
	onSelect,
	colors,
}: {
	options: { label: string; value: string }[];
	selected: string | null;
	onSelect: (val: string) => void;
	colors: any;
}) {
	return (
		<View style={[styles.toggleRow, { flexWrap: "wrap" }]}>
			{options.map((opt) => {
				const active = opt.value === selected;
				return (
					<Pressable
						key={opt.value}
						style={[
							styles.togglePill,
							{
								backgroundColor: active
									? colors.foreground
									: colors.card,
								borderColor: active
									? colors.foreground
									: colors.border,
							},
						]}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							onSelect(opt.value);
						}}
					>
						<Text
							style={[
								styles.toggleText,
								{
									color: active
										? colors.background
										: colors.mutedForeground,
								},
							]}
						>
							{opt.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

// --- Period Toggle ---

const PERIODS = ["7d", "30d", "90d", "1y", "all"] as const;

function PeriodToggle({
	selected,
	onSelect,
	colors,
}: {
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
						style={[
							styles.periodPill,
							{
								backgroundColor: active
									? colors.foreground
									: "transparent",
							},
						]}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							onSelect(p);
						}}
					>
						<Text
							style={[
								styles.periodText,
								{
									color: active
										? colors.background
										: colors.mutedForeground,
								},
							]}
						>
							{p.toUpperCase()}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

// --- Tab Bar ---

function TabBar({
	tabs,
	selected,
	onSelect,
	colors,
}: {
	tabs: string[];
	selected: string;
	onSelect: (val: string) => void;
	colors: any;
}) {
	return (
		<View style={styles.tabBar}>
			{tabs.map((tab) => {
				const active = tab === selected;
				return (
					<Pressable
						key={tab}
						style={[
							styles.tab,
							active && {
								borderBottomColor: colors.primary,
								borderBottomWidth: 2,
							},
						]}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
							onSelect(tab);
						}}
					>
						<Text
							style={[
								styles.tabText,
								{
									color: active
										? colors.foreground
										: colors.mutedForeground,
									fontWeight: active ? "700" : "500",
								},
							]}
						>
							{tab}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

// --- Sliding Tabs ---

function SlidingTabs({
	activeTab,
	hasGraded,
	rawSource,
	setRawSource,
	rawCondition,
	setRawCondition,
	conditionOptions,
	gradedCompanies,
	gradedCompany,
	setGradedCompany,
	gradedGrades,
	gradedGrade,
	setGradedGrade,
	colors,
}: {
	activeTab: string;
	hasGraded: boolean;
	rawSource: string;
	setRawSource: (v: string) => void;
	rawCondition: string;
	setRawCondition: (v: string) => void;
	conditionOptions: { label: string; value: string }[];
	gradedCompanies: string[];
	gradedCompany: string | null;
	setGradedCompany: (v: string) => void;
	gradedGrades: string[];
	gradedGrade: string | null;
	setGradedGrade: (v: string) => void;
	colors: any;
}) {
	const slideAnim = useSharedValue(0);
	const rawHeight = useSharedValue(0);
	const gradedHeight = useSharedValue(0);

	useEffect(() => {
		slideAnim.value = withTiming(activeTab === "Graded" ? 1 : 0, {
			duration: 250,
		});
	}, [activeTab]);

	const containerStyle = useAnimatedStyle(() => {
		const height = interpolate(
			slideAnim.value,
			[0, 1],
			[rawHeight.value, gradedHeight.value],
		);
		return {
			height: height > 0 ? height : undefined,
			overflow: "hidden" as const,
		};
	});

	const rawPanelStyle = useAnimatedStyle(() => ({
		transform: [
			{
				translateX: interpolate(
					slideAnim.value,
					[0, 1],
					[0, -SCREEN_WIDTH],
				),
			},
		],
		opacity: interpolate(slideAnim.value, [0, 0.5], [1, 0]),
	}));

	const gradedPanelStyle = useAnimatedStyle(() => ({
		transform: [
			{
				translateX: interpolate(
					slideAnim.value,
					[0, 1],
					[SCREEN_WIDTH, 0],
				),
			},
		],
		opacity: interpolate(slideAnim.value, [0.5, 1], [0, 1]),
	}));

	return (
		<Animated.View style={[{ marginTop: hasGraded ? 14 : 0 }, containerStyle]}>
			<Animated.View
				style={[{ position: "absolute", width: "100%" }, rawPanelStyle]}
				onLayout={(e) => {
					rawHeight.value = e.nativeEvent.layout.height;
				}}
			>
				<Text
					style={[
						styles.toggleLabel,
						{ color: colors.mutedForeground },
					]}
				>
					Source
				</Text>
				<PillToggle
					options={["TCGPlayer", "eBay"]}
					selected={rawSource}
					onSelect={setRawSource}
					colors={colors}
				/>
				<Text
					style={[
						styles.toggleLabel,
						{
							color: colors.mutedForeground,
							marginTop: 12,
						},
					]}
				>
					Condition
				</Text>
				<LabeledPillToggle
					options={conditionOptions}
					selected={rawCondition}
					onSelect={setRawCondition}
					colors={colors}
				/>
			</Animated.View>

			<Animated.View
				style={[{ position: "absolute", width: "100%" }, gradedPanelStyle]}
				onLayout={(e) => {
					gradedHeight.value = e.nativeEvent.layout.height;
				}}
			>
				<Text
					style={[
						styles.toggleLabel,
						{ color: colors.mutedForeground },
					]}
				>
					Grading Company
				</Text>
				<PillToggle
					options={gradedCompanies}
					selected={gradedCompany ?? ""}
					onSelect={setGradedCompany}
					colors={colors}
				/>
				{gradedGrades.length > 0 && (
					<>
						<Text
							style={[
								styles.toggleLabel,
								{
									color: colors.mutedForeground,
									marginTop: 12,
								},
							]}
						>
							Grade
						</Text>
						<LabeledPillToggle
							options={gradedGrades.map((g: string) => ({
								label: g,
								value: g,
							}))}
							selected={gradedGrade}
							onSelect={setGradedGrade}
							colors={colors}
						/>
					</>
				)}
			</Animated.View>
		</Animated.View>
	);
}

// --- Animated Collapsible ---

function AnimatedCollapsible({
	title,
	expanded,
	onToggle,
	colors,
	children,
}: {
	title: string;
	expanded: boolean;
	onToggle: () => void;
	colors: any;
	children: React.ReactNode;
}) {
	const progress = useSharedValue(0);
	const contentHeight = useSharedValue(0);
	const measured = useRef(false);

	useEffect(() => {
		progress.value = withSpring(expanded ? 1 : 0, {
			damping: 20,
			stiffness: 200,
			mass: 0.8,
		});
	}, [expanded]);

	const onContentLayout = useCallback((e: LayoutChangeEvent) => {
		const h = e.nativeEvent.layout.height;
		if (h > 0) {
			contentHeight.value = h;
			measured.current = true;
		}
	}, []);

	const containerStyle = useAnimatedStyle(() => {
		if (contentHeight.value === 0) {
			return { height: 0, opacity: 0, overflow: "hidden" as const };
		}
		return {
			height: interpolate(progress.value, [0, 1], [0, contentHeight.value]),
			opacity: interpolate(progress.value, [0, 0.3], [0, 1]),
			overflow: "hidden" as const,
		};
	});

	const chevronStyle = useAnimatedStyle(() => ({
		transform: [
			{ rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` },
		],
	}));

	return (
		<View
			style={[
				styles.section,
				{
					backgroundColor: colors.card,
					borderColor: colors.border,
				},
			]}
		>
			<Pressable style={styles.collapsibleHeader} onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				onToggle();
			}}>
				<Text
					style={[
						styles.sectionTitle,
						{ color: colors.foreground, marginBottom: 0 },
					]}
				>
					{title}
				</Text>
				<Animated.View style={chevronStyle}>
					<Ionicons
						name="chevron-down"
						size={18}
						color={colors.mutedForeground}
					/>
				</Animated.View>
			</Pressable>

			<Animated.View style={containerStyle}>
				<View
					style={{ position: "absolute", width: "100%" }}
					onLayout={onContentLayout}
				>
					{children}
				</View>
			</Animated.View>
		</View>
	);
}

// --- Loading Skeleton ---

function LoadingSkeleton({ colors, isFromCollection }: { colors: any; isFromCollection?: boolean }) {
	const skeletonColor = colors.muted;
	return (
		<>
			{/* Card Image */}
			<View style={styles.imageContainer}>
				<Skeleton
					width={IMAGE_WIDTH}
					height={IMAGE_HEIGHT}
					color={skeletonColor}
					style={{ borderRadius: 19 }}
				/>
			</View>

			{/* Quantity Badge */}
			{isFromCollection && (
				<View style={{ alignSelf: "center", marginBottom: 12 }}>
					<Skeleton width={120} height={36} color={skeletonColor} style={{ borderRadius: 20 }} />
				</View>
			)}

			{/* Estimate Block */}
			<View
				style={[
					styles.estimateBlock,
					{ borderColor: colors.border },
				]}
			>
				<Skeleton width={100} height={11} color={skeletonColor} />
				<Skeleton width={180} height={44} color={skeletonColor} style={{ marginTop: 6 }} />
				<View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
					<Skeleton width={70} height={26} color={skeletonColor} style={{ borderRadius: 20 }} />
					<Skeleton width={90} height={26} color={skeletonColor} style={{ borderRadius: 20 }} />
				</View>
			</View>

			{/* Meta Strip */}
			<View style={styles.metaStrip}>
				<View style={{ flex: 1, gap: 4 }}>
					<Skeleton width="65%" height={17} color={skeletonColor} />
					<Skeleton width="45%" height={13} color={skeletonColor} />
					<View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
						<Skeleton width={60} height={22} color={skeletonColor} style={{ borderRadius: 6 }} />
						<Skeleton width={80} height={22} color={skeletonColor} style={{ borderRadius: 6 }} />
					</View>
				</View>
			</View>

			{/* Pricing Options Section */}
			<View
				style={[
					styles.section,
					{ backgroundColor: colors.card, borderColor: colors.border },
				]}
			>
				<Skeleton width={130} height={16} color={skeletonColor} style={{ marginBottom: 12 }} />
				<Skeleton width="100%" height={36} color={skeletonColor} style={{ borderRadius: 8 }} />
				<Skeleton width={60} height={11} color={skeletonColor} style={{ marginTop: 14 }} />
				<View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
					<Skeleton width={80} height={32} color={skeletonColor} style={{ borderRadius: 8 }} />
					<Skeleton width={80} height={32} color={skeletonColor} style={{ borderRadius: 8 }} />
				</View>
			</View>

			{/* Price History Section */}
			<View
				style={[
					styles.section,
					{ backgroundColor: colors.card, borderColor: colors.border },
				]}
			>
				<Skeleton width={110} height={16} color={skeletonColor} style={{ marginBottom: 12 }} />
				<Skeleton width="100%" height={180} color={skeletonColor} style={{ borderRadius: 8 }} />
			</View>
		</>
	);
}

// --- Main ---

export default function CardDetail() {
	const { colors } = useTheme();
	const { id, name, pricingType, source, condition, gradedCompany: initGradedCompany, gradedGrade: initGradedGrade, collectionId, quantity: initQuantity } = useLocalSearchParams<{
		id: string;
		name: string;
		pricingType?: string;
		source?: string;
		condition?: string;
		gradedCompany?: string;
		gradedGrade?: string;
		collectionId?: string;
		quantity?: string;
	}>();
	const isFromCollection = !!collectionId;
	const [quantity, setQuantity] = useState(parseInt(initQuantity || "1", 10) || 1);
	const api = useApi();

	// Tab state
	const [pricingTab, setPricingTab] = useState(pricingType || "Raw");

	// Raw state
	const [rawSource, setRawSource] = useState<string>(source || "TCGPlayer");
	const [rawCondition, setRawCondition] = useState(condition || "NEAR_MINT");

	// Graded state
	const [gradedCompany, setGradedCompany] = useState<string | null>(initGradedCompany || null);
	const [gradedGrade, setGradedGrade] = useState<string | null>(initGradedGrade || null);

	// Collection context
	const { incrementCardQuantity, addCardToCollection, removeCardFromCollection, decrementCardQuantity } = useCollections();

	// History
	const [historyPeriod, setHistoryPeriod] = useState("all");
	const [salesExpanded, setSalesExpanded] = useState(false);

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
		if (gradedGrades.length > 0 && !gradedGrade) {
			setGradedGrade(gradedGrades[0]);
		}
	}, [gradedGrades]);

	// Condition options
	const conditionOptions = useMemo(() => {
		if (!card?.conditionOptions)
			return [{ label: "Near Mint", value: "NEAR_MINT" }];
		return card.conditionOptions.map((c: string) => ({
			label: formatTierLabel(c),
			value: c,
		}));
	}, [card?.conditionOptions]);

	// Determine if graded tab is available
	const hasGraded = gradedCompanies.length > 0;
	const availableTabs = hasGraded ? ["Raw", "Graded"] : ["Raw"];

	// Get current prices
	const rawSourceKey = rawSource === "eBay" ? "ebay" : "tcgplayer";
	const rawPrice = card?.prices?.[rawSourceKey]?.[rawCondition]?.avg;

	const gradedTierKey =
		gradedCompany && gradedGrade
			? buildGradedTierKey(gradedCompany, gradedGrade)
			: null;
	const gradedPrice = gradedTierKey
		? (card?.prices?.ebay?.[gradedTierKey]?.avg ??
			card?.prices?.tcgplayer?.[gradedTierKey]?.avg)
		: undefined;

	// The hero price: show whichever tab is active
	const heroPrice = pricingTab === "Graded" ? gradedPrice : rawPrice;
	const heroLabel =
		pricingTab === "Graded"
			? `${gradedCompany} ${gradedGrade}`
			: `${rawSource} · ${formatTierLabel(rawCondition)}`;

	// History queries
	const { data: rawHistory, isLoading: rawHistoryLoading } = useQuery({
		queryKey: ["history", id, rawCondition, historyPeriod],
		queryFn: async () => {
			const res = await api.get(
				`/api/pricing/cards/${id}/history/${rawCondition}`,
				{
					params: { period: historyPeriod, limit: 365 },
				},
			);
			return res.data.data ?? [];
		},
		enabled: !!id && !!rawCondition,
	});

	const { data: gradedHistory, isLoading: gradedHistoryLoading } = useQuery({
		queryKey: ["history", id, gradedTierKey, historyPeriod],
		queryFn: async () => {
			const res = await api.get(
				`/api/pricing/cards/${id}/history/${gradedTierKey}`,
				{
					params: { period: historyPeriod, limit: 365 },
				},
			);
			return res.data.data ?? [];
		},
		enabled: !!id && !!gradedTierKey,
	});

	// Filter history by selected source
	const filteredRawHistory = useMemo(() => {
		if (!rawHistory) return [];
		return rawHistory
			.filter((e: any) => e.source === rawSourceKey)
			.sort(
				(a: any, b: any) =>
					new Date(a.date).getTime() - new Date(b.date).getTime(),
			);
	}, [rawHistory, rawSourceKey]);

	const filteredGradedHistory = useMemo(() => {
		if (!gradedHistory) return [];
		return gradedHistory
			.filter((e: any) => e.source === "ebay")
			.sort(
				(a: any, b: any) =>
					new Date(a.date).getTime() - new Date(b.date).getTime(),
			);
	}, [gradedHistory]);

	// Chart data — show data for the active tab
	const chartData = useMemo(() => {
		const source =
			pricingTab === "Graded"
				? filteredGradedHistory
				: filteredRawHistory;
		return source.map((e: any, i: number) => ({
			index: i,
			date: e.date,
			price: e.avg,
		}));
	}, [pricingTab, filteredRawHistory, filteredGradedHistory]);

	// History list for the active tab
	const historyList = useMemo(() => {
		if (pricingTab === "Graded") {
			return filteredGradedHistory
				.map((e: any) => ({
					date: e.date,
					source: "eBay",
					type: gradedCompany
						? `${gradedCompany} ${gradedGrade}`
						: "Graded",
					avg: e.avg,
					saleCount: e.saleCount,
				}))
				.sort(
					(a: any, b: any) =>
						new Date(b.date).getTime() -
						new Date(a.date).getTime(),
				);
		}
		return filteredRawHistory
			.map((e: any) => ({
				date: e.date,
				source: rawSource,
				type: formatTierLabel(rawCondition),
				avg: e.avg,
				saleCount: e.saleCount,
			}))
			.sort(
				(a: any, b: any) =>
					new Date(b.date).getTime() - new Date(a.date).getTime(),
			);
	}, [
		pricingTab,
		filteredRawHistory,
		filteredGradedHistory,
		rawSource,
		rawCondition,
		gradedCompany,
		gradedGrade,
	]);

	const configMatches = isFromCollection &&
		pricingTab === (pricingType || "Raw") &&
		rawSource === (source || "TCGPlayer") &&
		rawCondition === (condition || "NEAR_MINT") &&
		(gradedCompany ?? "") === (initGradedCompany || "") &&
		(gradedGrade ?? "") === (initGradedGrade || "");

	return (
		<>
			<Stack.Screen
				options={{
					headerTitle: name ?? "Card",
					headerRight: () =>
						configMatches ? null : (
						<Pressable
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								if (isFromCollection) {
									addCardToCollection.mutate(
										{
											collectionId: collectionId!,
											cardId: id,
											cardName: name ?? "",
											cardImageUrl: card?.image ?? "",
											cardValue: heroPrice ?? 0,
											pricingType: pricingTab,
											source: rawSource,
											condition: rawCondition,
											gradedCompany: gradedCompany ?? undefined,
											gradedGrade: gradedGrade ?? undefined,
										},
										{
											onSuccess: () => {
												Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
												const configLabel = pricingTab === "Graded"
													? `${gradedCompany} ${gradedGrade}`
													: `${rawSource} · ${rawCondition.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (ch: string) => ch.toUpperCase())}`;
												Alert.alert(
													"Added!",
													`${configLabel} configuration added to collection.`,
												);
											},
										},
									);
								} else {
									router.push({
										pathname: "/add-to-collection",
										params: {
											cardId: id,
											cardName: name ?? "",
											cardImageUrl: card?.image ?? "",
											cardValue: String(heroPrice ?? 0),
											pricingType: pricingTab,
											source: rawSource,
											condition: rawCondition,
											gradedCompany: gradedCompany ?? "",
											gradedGrade: gradedGrade ?? "",
										},
									});
								}
							}}
						>
							<Ionicons
								name="add"
								size={26}
								color={colors.foreground}
							/>
						</Pressable>
					),
				}}
			/>

			{isLoading ? (
				<ScrollView
					style={[
						styles.container,
						{ backgroundColor: colors.background },
					]}
					contentContainerStyle={styles.content}
					contentInsetAdjustmentBehavior="automatic"
					scrollEnabled={false}
				>
					<LoadingSkeleton colors={colors} isFromCollection={isFromCollection} />
				</ScrollView>
			) : card ? (
				<View
					style={[
						styles.container,
						{ backgroundColor: colors.background },
					]}
				>
					{card.image && (
						<Image
							source={{ uri: card.image }}
							style={StyleSheet.absoluteFill}
							resizeMode="cover"
							blurRadius={30}
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
						{/* Card Image */}
						<View style={styles.imageContainer}>
							<ZoomableImage
								width={IMAGE_WIDTH}
								height={IMAGE_HEIGHT}
							>
								<FadeImage
									uri={card.image ?? ""}
									name={card.name}
									cardNumber={card.cardNumber}
									style={{
										width: IMAGE_WIDTH,
										height: IMAGE_HEIGHT,
									}}
									backgroundColor={colors.background}
									shimmerColor={colors.border}
									foregroundColor={colors.foreground}
									mutedColor={colors.mutedForeground}
								/>
							</ZoomableImage>
						</View>

						{/* Estimate Block — most prominent element */}
						<View
							style={[
								styles.estimateBlock,
								{
									backgroundColor: colors.card,
									borderColor: colors.border,
								},
							]}
						>
							<Text
								style={[
									styles.estimateLabel,
									{ color: colors.mutedForeground },
								]}
							>
								ESTIMATED VALUE
							</Text>
							<TickerText
								value={formatPrice(heroPrice, card.currency)}
								style={[
									styles.heroPrice,
									{ color: colors.foreground },
								]}
							/>

							{/* Active selection summary chips */}
							<View style={styles.selectionSummary}>
								{pricingTab === "Graded" ? (
									<>
										<View
											style={[
												styles.selectionChip,
												{
													backgroundColor:
														colors.primary + "18",
													borderColor:
														colors.primary + "40",
												},
											]}
										>
											<View
												style={[
													styles.chipDot,
													{
														backgroundColor:
															colors.primary,
													},
												]}
											/>
											<Text
												style={[
													styles.selectionChipText,
													{
														color: colors.primary,
													},
												]}
											>
												Graded
											</Text>
										</View>
										{gradedCompany && (
											<View
												style={[
													styles.selectionChip,
													{
														backgroundColor:
															colors.primary +
															"18",
														borderColor:
															colors.primary +
															"40",
													},
												]}
											>
												<View
													style={[
														styles.chipDot,
														{
															backgroundColor:
																colors.primary,
														},
													]}
												/>
												<Text
													style={[
														styles.selectionChipText,
														{
															color: colors.primary,
														},
													]}
												>
													{gradedCompany}{" "}
													{gradedGrade}
												</Text>
											</View>
										)}
									</>
								) : (
									<>
										<View
											style={[
												styles.selectionChip,
												{
													backgroundColor:
														colors.primary + "18",
													borderColor:
														colors.primary + "40",
												},
											]}
										>
											<View
												style={[
													styles.chipDot,
													{
														backgroundColor:
															colors.primary,
													},
												]}
											/>
											<Text
												style={[
													styles.selectionChipText,
													{
														color: colors.primary,
													},
												]}
											>
												{rawSource}
											</Text>
										</View>
										<View
											style={[
												styles.selectionChip,
												{
													backgroundColor:
														colors.primary + "18",
													borderColor:
														colors.primary + "40",
												},
											]}
										>
											<View
												style={[
													styles.chipDot,
													{
														backgroundColor:
															colors.primary,
													},
												]}
											/>
											<Text
												style={[
													styles.selectionChipText,
													{
														color: colors.primary,
													},
												]}
											>
												{formatTierLabel(rawCondition)}
											</Text>
										</View>
									</>
								)}
							</View>
						</View>

						{/* Quantity Badge */}
						{configMatches && (
							<View style={[styles.quantityBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
								<Pressable
									onPress={() => {
										Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										decrementCardQuantity.mutate({
											collectionId: collectionId!,
											cardId: id,
											pricingType: pricingType || "Raw",
											source: source || "TCGPlayer",
											condition: condition || "NEAR_MINT",
											gradedCompany: initGradedCompany || undefined,
											gradedGrade: initGradedGrade || undefined,
										});
										setQuantity((q) => q - 1);
									}}
									style={[styles.qtyButton, { backgroundColor: colors.muted }]}
								>
									<Ionicons name="remove" size={16} color={colors.foreground} />
								</Pressable>
								<Ionicons name="layers-outline" size={16} color={colors.primary} />
								<Text style={[styles.quantityText, { color: colors.foreground }]}>
									{quantity}
								</Text>
								<Pressable
									onPress={() => {
										Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										incrementCardQuantity.mutate({
											collectionId: collectionId!,
											cardId: id,
											pricingType: pricingType || "Raw",
											source: source || "TCGPlayer",
											condition: condition || "NEAR_MINT",
											gradedCompany: initGradedCompany || undefined,
											gradedGrade: initGradedGrade || undefined,
										});
										setQuantity((q) => q + 1);
									}}
									style={[styles.qtyButton, { backgroundColor: colors.muted }]}
								>
									<Ionicons name="add" size={16} color={colors.foreground} />
								</Pressable>
							</View>
						)}

						{/* Card Meta Strip */}
						<View style={styles.metaStrip}>
							<View style={{ flex: 1 }}>
								<Text
									style={[
										styles.cardName,
										{ color: colors.foreground },
									]}
								>
									{card.name}
									{card.cardNumber ? (
										<Text
											style={{
												color: colors.mutedForeground,
												fontWeight: "400",
											}}
										>
											{" "}
											#{card.cardNumber}
										</Text>
									) : null}
								</Text>
								<Text
									style={[
										styles.setName,
										{ color: colors.mutedForeground },
									]}
								>
									{card.set?.name}
								</Text>
							</View>
							<View style={styles.pillRow}>
								{card.rarity && (
									<InfoPill
										label={card.rarity}
										color={colors.primary}
										bgColor={colors.primary + "15"}
									/>
								)}
								{card.variant && (
									<InfoPill
										label={card.variant.replace(
											/_/g,
											" ",
										)}
										color={colors.primary}
										bgColor={colors.primary + "15"}
									/>
								)}
							</View>
						</View>

						{/* Pricing Controls */}
						<View
							style={[
								styles.section,
								{
									backgroundColor: colors.card,
									borderColor: colors.border,
								},
							]}
						>
							<Text
								style={[
									styles.sectionTitle,
									{ color: colors.foreground },
								]}
							>
								Pricing Options
							</Text>
							{hasGraded && (
								<TabBar
									tabs={availableTabs}
									selected={pricingTab}
									onSelect={setPricingTab}
									colors={colors}
								/>
							)}

							<SlidingTabs
								activeTab={pricingTab}
								hasGraded={hasGraded}
								rawSource={rawSource}
								setRawSource={setRawSource}
								rawCondition={rawCondition}
								setRawCondition={setRawCondition}
								conditionOptions={conditionOptions}
								gradedCompanies={gradedCompanies}
								gradedCompany={gradedCompany}
								setGradedCompany={(val: string) => {
									setGradedCompany(val);
									const grades = (
										card.gradedOptions ?? []
									)
										.map((t: string) =>
											parseGradedTier(t),
										)
										.filter(
											(p: any) =>
												p.company === val,
										)
										.map((p: any) => p.grade)
										.sort(
											(a: string, b: string) =>
												parseFloat(b) -
												parseFloat(a),
										);
									setGradedGrade(grades[0] ?? null);
								}}
								gradedGrades={gradedGrades}
								gradedGrade={gradedGrade}
								setGradedGrade={setGradedGrade}
								colors={colors}
							/>
						</View>

						{/* Price History Chart */}
						<View
							style={[
								styles.section,
								{
									backgroundColor: colors.card,
									borderColor: colors.border,
								},
							]}
						>
							<View style={styles.chartHeader}>
								<Text
									style={[
										styles.sectionTitle,
										{
											color: colors.foreground,
											marginBottom: 0,
											flexShrink: 1,
										},
									]}
								>
									Price History
								</Text>
								<PeriodToggle
									selected={historyPeriod}
									onSelect={setHistoryPeriod}
									colors={colors}
								/>
							</View>

							{rawHistoryLoading || gradedHistoryLoading ? (
								<View style={styles.chartPlaceholder}>
									<Skeleton
										width="100%"
										height={180}
										color={colors.border}
									/>
								</View>
							) : chartData.length > 1 ? (
								<View style={styles.chartContainer}>
									<CartesianChart
										data={chartData}
										xKey="index"
										yKeys={["price"]}
										domainPadding={{
											top: 20,
											bottom: 10,
										}}
									>
										{({ points }) => (
											<Line
												points={points.price.filter(
													(p: any) =>
														p.y !== undefined,
												)}
												color={colors.primary}
												strokeWidth={2}
												curveType="natural"
											/>
										)}
									</CartesianChart>
								</View>
							) : (
								<View style={styles.chartPlaceholder}>
									<Text
										style={{
											color: colors.mutedForeground,
											fontSize: 13,
										}}
									>
										Price History Unavailable
									</Text>
								</View>
							)}
						</View>

						{/* Recent Sales */}
						{historyList.length > 0 && (
							<AnimatedCollapsible
								title="Recent Sales"
								expanded={salesExpanded}
								onToggle={() =>
									setSalesExpanded((v) => !v)
								}
								colors={colors}
							>
								{historyList.slice(0, 20).map((item, i) => (
									<View
										key={`${item.date}-${item.type}-${i}`}
										style={[
											styles.historyRow,
											i < Math.min(historyList.length, 20) - 1 && {
												borderBottomWidth: StyleSheet.hairlineWidth,
												borderBottomColor: colors.border,
											},
										]}
									>
										<View style={{ flex: 1 }}>
											<Text
												style={[
													styles.historyDate,
													{
														color: colors.foreground,
													},
												]}
											>
												{new Date(
													item.date,
												).toLocaleDateString()}
											</Text>
											<Text
												style={[
													styles.historyMeta,
													{
														color: colors.mutedForeground,
													},
												]}
											>
												{item.type} · {item.source}
											</Text>
										</View>
										<View
											style={{ alignItems: "flex-end" }}
										>
											<Text
												style={[
													styles.historyPrice,
													{
														color: colors.foreground,
													},
												]}
											>
												{formatPrice(
													item.avg,
													card.currency,
												)}
											</Text>
											{item.saleCount !== undefined &&
												item.saleCount > 0 && (
													<Text
														style={[
															styles.historyMeta,
															{
																color: colors.mutedForeground,
															},
														]}
													>
														{item.saleCount} sale
														{item.saleCount !== 1
															? "s"
															: ""}
													</Text>
												)}
										</View>
									</View>
								))}
							</AnimatedCollapsible>
						)}

						{/* Last Updated */}
						{card.lastUpdated && (
							<Text
								style={[
									styles.lastUpdated,
									{ color: colors.mutedForeground },
								]}
							>
								Last updated{" "}
								{new Date(
									card.lastUpdated,
								).toLocaleDateString()}
							</Text>
						)}

						{/* Remove from collection */}
						{configMatches && quantity <= 1 && (
							<Pressable
								onPress={() => {
									Alert.alert(
										"Remove Card",
										"Remove this card from the collection?",
										[
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
										],
									);
								}}
								style={[styles.removeButton, { borderColor: colors.destructive ?? "#ef4444", marginHorizontal: 20, marginTop: 16 }]}
							>
								<Ionicons name="trash-outline" size={18} color={colors.destructive ?? "#ef4444"} />
								<Text style={[styles.removeButtonText, { color: colors.destructive ?? "#ef4444" }]}>
									Remove from Collection
								</Text>
							</Pressable>
						)}

						<View style={{ height: 40 }} />
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
					<Text style={{ color: colors.mutedForeground }}>
						Card not found
					</Text>
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
		paddingBottom: 40,
	},

	// Image
	imageContainer: {
		alignItems: "center",
		marginBottom: 20,
		borderRadius: 23,
		overflow: "hidden",
		alignSelf: "center",
		width: IMAGE_WIDTH,
	},

	// Quantity badge
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
	removeButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 14,
		borderRadius: 10,
		borderWidth: 1,
	},
	removeButtonText: {
		fontSize: 16,
		fontWeight: "600",
	},

	// Estimate block — most prominent element
	estimateBlock: {
		marginHorizontal: 20,
		marginBottom: 12,
		borderRadius: 12,
		borderWidth: 1,
		padding: 20,
		alignItems: "center",
	},
	estimateLabel: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 1.5,
		marginBottom: 6,
	},
	heroPrice: {
		fontSize: 44,
		fontWeight: "800",
		letterSpacing: -1.5,
	},
	selectionSummary: {
		flexDirection: "row",
		gap: 6,
		marginTop: 12,
		flexWrap: "wrap",
		justifyContent: "center",
	},
	selectionChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 20,
		borderWidth: 1,
	},
	selectionChipText: {
		fontSize: 12,
		fontWeight: "600",
	},
	chipDot: {
		width: 5,
		height: 5,
		borderRadius: 2.5,
	},

	// Card meta strip
	metaStrip: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 20,
		marginBottom: 12,
		gap: 12,
	},
	cardName: {
		fontSize: 17,
		fontWeight: "700",
	},
	setName: {
		fontSize: 13,
		marginTop: 2,
	},
	pillRow: {
		flexDirection: "row",
		gap: 6,
		flexWrap: "wrap",
	},

	// Toggle labels
	toggleLabel: {
		fontSize: 11,
		fontWeight: "600",
		letterSpacing: 0.5,
		textTransform: "uppercase",
		marginBottom: 8,
	},

	// Collapsible header
	collapsibleHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	pill: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6,
	},
	pillText: {
		fontSize: 11,
		fontWeight: "600",
	},

	// Tab bar
	tabBar: {
		flexDirection: "row",
		gap: 0,
		marginBottom: 2,
	},
	tab: {
		flex: 1,
		alignItems: "center",
		paddingVertical: 10,
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	tabText: {
		fontSize: 14,
	},

	// Sections
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
		lineHeight: 20,
		marginBottom: 12,
	},

	// Toggles
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
	periodPill: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 6,
	},
	periodText: {
		fontSize: 11,
		fontWeight: "600",
	},

	// Chart
	chartHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 12,
		marginBottom: 4,
	},
	chartContainer: {
		height: 180,
		marginTop: 8,
	},
	chartPlaceholder: {
		height: 180,
		marginTop: 8,
		alignItems: "center",
		justifyContent: "center",
	},

	// History
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
