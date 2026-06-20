import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Alert,
	Dimensions,
	LayoutChangeEvent,
	Linking,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import Animated, {
	Easing,
	FadeIn,
	FadeInDown,
	FadeOut,
	interpolate,
	type SharedValue,
	useAnimatedProps,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LineChart } from "react-native-wagmi-charts";
import { useApi } from "@/lib/axios";
import { getCard, getCardHistory, getCardListings } from "@/lib/api/pricing";
import { getCatalogCard, catalogCardToScrydex } from "@/lib/api/catalog";
import {
	CONDITION_LABELS,
	PERIOD_TO_DAYS,
	formatVariantLabel,
	getCardDisplayName,
	getCardDisplayRarity,
	getCardImage,
	getCardNumber,
	getExpansionDisplayName,
	getConditionOptions,
	getGradedOptions,
	getVariantNames,
	historyToChartPoints,
	isLikelyGradedListing,
	selectPrice,
} from "@/lib/scrydex";
import { formatCurrency } from "@/lib/format";
import { useTheme } from "@/context/ThemeContext";
import { useCollections } from "@/hooks/useCollections";
import { useCardConfig } from "@/context/CardConfigContext";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import { Image } from "expo-image";
import { ProGate } from "@/components/ProGate";
import CardImage from "@/components/CardImage";
import ErrorState from "@/components/ErrorState";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const IMAGE_WIDTH = SCREEN_WIDTH * 0.9;
const IMAGE_HEIGHT = IMAGE_WIDTH * 1.4;
// Chart width: screen - section horizontal margin (20*2) - section padding (16*2)
const CHART_WIDTH = SCREEN_WIDTH - 72;

// Staggered "rise in" for the detail sections — same feel as the set-tile
// entrance. These sections mount once (not recycled in a list), so a plain
// staggered FadeInDown on mount is optimal: no replay, no guard needed.
const sectionEntering = (index: number) =>
	FadeInDown.delay(Math.min(index * 55, 280)).duration(320);

// --- Helpers ---

function formatPrice(price: number | undefined, currency = "USD"): string {
	if (price === undefined || price === null) return "—";
	return formatCurrency(price, currency);
}

function formatConditionLabel(condition: string): string {
	return CONDITION_LABELS[condition] ?? condition;
}

// Settles a rapidly-changing value: while the user flicks through options the
// chart/sales queries shouldn't fire for every intermediate selection, only the
// one they land on. The hero price stays live (it's read from the cached card).
function useDebouncedValue<T>(value: T, delay: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(t);
	}, [value, delay]);
	return debounced;
}

function buildGradedTierKey(company: string, grade: string): string {
	return `${company}_${grade.replace(/\./g, "_")}`;
}

// --- Shared UI Components ---

// One pulse clock shared by every Skeleton in the loading view, so the whole
// frosted-glass column fades in and out in unison instead of each block blinking
// on its own timer. Provided by LoadingSkeleton; blocks used outside it (e.g. the
// chart's own loader) fall back to a private clock. Holds the current opacity.
const PulseContext = createContext<SharedValue<number> | null>(null);

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
	const shared = useContext(PulseContext);
	const fallback = useSharedValue(0.3);
	useEffect(() => {
		if (shared) return;
		fallback.value = withRepeat(
			withSequence(
				withTiming(0.7, { duration: 800 }),
				withTiming(0.3, { duration: 800 }),
			),
			-1,
		);
	}, [shared]);
	const pulse = shared ?? fallback;

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: pulse.value,
	}));

	return (
		<Animated.View
			style={[
				{
					width,
					height,
					backgroundColor: color,
					borderRadius: 8,
				},
				style,
				animatedStyle,
			]}
		/>
	);
}

function InfoPill({
	label,
	color,
	bgColor,
	borderColor,
}: {
	label: string;
	color: string;
	bgColor: string;
	borderColor?: string;
}) {
	return (
		<View
			style={[
				styles.pill,
				{
					backgroundColor: bgColor,
					borderColor: borderColor ?? "transparent",
					borderWidth: borderColor ? 1 : 0,
				},
			]}
		>
			<Text style={[styles.pillText, { color }]}>{label}</Text>
		</View>
	);
}

// --- Ticker Animation ---

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// Rolls the price from its previous value to the new one (stock-ticker style)
// whenever the configuration changes. Driven on the UI thread via an
// AnimatedTextInput so every interpolated frame is painted without JS churn.
function TickerPrice({ value, style }: { value: number; style: any }) {
	const animated = useSharedValue(value);

	useEffect(() => {
		animated.value = withTiming(value, {
			duration: 450,
			easing: Easing.out(Easing.cubic),
		});
	}, [value]);

	const animatedProps = useAnimatedProps(() => {
		"worklet";
		const n = animated.value;
		const [intPart, dec] = n.toFixed(2).split(".");
		// Group thousands manually — regex lookahead is unreliable inside a
		// worklet, which made the comma flicker/drop between frames.
		let withCommas = "";
		for (let i = 0; i < intPart.length; i++) {
			if (i > 0 && (intPart.length - i) % 3 === 0) withCommas += ",";
			withCommas += intPart[i];
		}
		return { text: `$${withCommas}.${dec}` } as any;
	});

	return (
		<AnimatedTextInput
			editable={false}
			pointerEvents="none"
			underlineColorAndroid="transparent"
			style={[style, styles.tickerInput]}
			animatedProps={animatedProps}
			defaultValue={formatPrice(value)}
		/>
	);
}

// --- Period Toggle ---

const PERIODS = ["7d", "30d", "90d", "1y"] as const;

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
		<View style={[styles.periodRow, { backgroundColor: colors.muted }]}>
			{PERIODS.map((p) => {
				const active = p === selected;
				return (
					<Pressable
						key={p}
						hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
						style={[
							styles.periodPill,
							active && { backgroundColor: colors.primary },
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
									color: active ? colors.primaryForeground : colors.foreground,
									opacity: active ? 1 : 0.75,
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

// --- Animated Collapsible ---

function AnimatedCollapsible({
	title,
	expanded,
	onToggle,
	colors,
	outerStyle,
	children,
}: {
	title: string;
	expanded: boolean;
	onToggle: () => void;
	colors: any;
	outerStyle?: any;
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
					backgroundColor: colors.card + "D9",
					borderColor: colors.border,
				},
				outerStyle,
			]}
		>
			<Pressable
				style={styles.collapsibleHeader}
				onPress={() => {
					Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					onToggle();
				}}
			>
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

function LoadingSkeleton({
	colors,
	isFromCollection,
}: {
	colors: any;
	isFromCollection?: boolean;
}) {
	// `border` (not `muted`) so blocks stay visible against the sheet's `card`
	// background — muted is nearly identical to card in dark mode. Matches the
	// set-detail loader, which pulses opacity on `border`.
	const skeletonColor = colors.border;

	// Single pulse clock for all blocks below: fade between 0.3 and 0.7 in unison
	// so the whole column breathes together rather than per-block flicker.
	const pulse = useSharedValue(0.3);
	useEffect(() => {
		pulse.value = withRepeat(
			withSequence(
				withTiming(0.7, { duration: 800 }),
				withTiming(0.3, { duration: 800 }),
			),
			-1,
		);
	}, []);

	// The hero image is rendered persistently by the parent (above the crossfade),
	// so the skeleton only covers the data-dependent sections below it.
	return (
		<PulseContext.Provider value={pulse}>
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
				{/* Estimate Block — same container + line heights as the real frosted
			    card: 12pt label (~16), 44pt price (~54), ~28 chips. */}
				{/* Value header placeholder */}
				<View style={styles.valueGate}>
					<Skeleton
						width={110}
						height={16}
						color={skeletonColor}
						style={{ marginBottom: 8 }}
					/>
					<Skeleton
						width={200}
						height={54}
						color={skeletonColor}
						style={{ borderRadius: 10 }}
					/>
					<View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
						<Skeleton
							width={78}
							height={28}
							color={skeletonColor}
							style={{ borderRadius: 20 }}
						/>
						<Skeleton
							width={96}
							height={28}
							color={skeletonColor}
							style={{ borderRadius: 20 }}
						/>
					</View>
				</View>

				<View style={[styles.divider, { backgroundColor: colors.border }]} />

				{/* Identity placeholder */}
				<View style={styles.metaStrip}>
					<View style={{ flex: 1, gap: 4 }}>
						<Skeleton width="60%" height={17} color={skeletonColor} />
						<Skeleton width="40%" height={13} color={skeletonColor} />
					</View>
					<View style={{ flexDirection: "row", gap: 6 }}>
						<Skeleton
							width={56}
							height={22}
							color={skeletonColor}
							style={{ borderRadius: 6 }}
						/>
						<Skeleton
							width={72}
							height={22}
							color={skeletonColor}
							style={{ borderRadius: 6 }}
						/>
					</View>
				</View>

				<View style={[styles.divider, { backgroundColor: colors.border }]} />

				{/* Pricing Options placeholder */}
				<View style={styles.sheetSection}>
					<Skeleton
						width={140}
						height={16}
						color={skeletonColor}
						style={{ marginBottom: 12 }}
					/>
					{[0, 1].map((i) => (
						<View
							key={i}
							style={[
								styles.configRow,
								i === 0 && {
									borderBottomWidth: StyleSheet.hairlineWidth,
									borderBottomColor: colors.foreground + "1A",
								},
							]}
						>
							<Skeleton width={70} height={15} color={skeletonColor} />
							<Skeleton width={90} height={15} color={skeletonColor} />
						</View>
					))}
					<Skeleton
						width={70}
						height={11}
						color={skeletonColor}
						style={{ marginTop: 16, marginBottom: 8 }}
					/>
					<Skeleton
						width="100%"
						height={42}
						color={skeletonColor}
						style={{ borderRadius: 10 }}
					/>
				</View>

				<View style={[styles.divider, { backgroundColor: colors.border }]} />

				{/* Price History placeholder */}
				<View style={styles.sheetSection}>
					<View style={styles.chartHeader}>
						<Skeleton width={110} height={16} color={skeletonColor} />
						<Skeleton
							width={150}
							height={30}
							color={skeletonColor}
							style={{ borderRadius: 8 }}
						/>
					</View>
					<View
						style={{ minHeight: 22, marginBottom: 4, justifyContent: "center" }}
					>
						<Skeleton width={120} height={16} color={skeletonColor} />
					</View>
					<Skeleton
						width="100%"
						height={180}
						color={skeletonColor}
						style={{ marginTop: 8, borderRadius: 8 }}
					/>
					<Skeleton
						width={160}
						height={11}
						color={skeletonColor}
						style={{ marginTop: 10, alignSelf: "center" }}
					/>
				</View>
			</View>
		</PulseContext.Provider>
	);
}

// --- Config Summary Row ---

function ConfigRow({
	label,
	value,
	onPress,
	colors,
	isLast,
}: {
	label: string;
	value: string;
	onPress: () => void;
	colors: any;
	isLast?: boolean;
}) {
	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.configRow,
				!isLast && {
					borderBottomWidth: StyleSheet.hairlineWidth,
					borderBottomColor: colors.foreground + "1A",
				},
			]}
		>
			<Text style={[styles.configRowLabel, { color: colors.foreground }]}>
				{label}
			</Text>
			<View style={styles.configRowRight}>
				<Text
					style={[styles.configRowValue, { color: colors.foreground }]}
					numberOfLines={1}
				>
					{value}
				</Text>
				<Ionicons
					name="chevron-forward"
					size={16}
					color={colors.mutedForeground}
				/>
			</View>
		</Pressable>
	);
}

// --- Main ---

export default function CardDetail() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const { isPro } = useRevenueCat();
	const {
		id,
		name,
		image: initImage,
		pricingType,
		variant: initVariant,
		condition,
		gradedCompany: initGradedCompany,
		gradedGrade: initGradedGrade,
		collectionId,
		quantity: initQuantity,
		pricePaid: initPricePaid,
	} = useLocalSearchParams<{
		id: string;
		name: string;
		/** Thumbnail URL passed from the grid — already cached, shown instantly. */
		image?: string;
		pricingType?: string;
		variant?: string;
		condition?: string;
		gradedCompany?: string;
		gradedGrade?: string;
		collectionId?: string;
		quantity?: string;
		pricePaid?: string;
	}>();
	const isFromCollection = !!collectionId;
	const [quantity, setQuantity] = useState(
		parseInt(initQuantity || "1", 10) || 1,
	);
	const api = useApi();

	// Selection lives in CardConfigContext so the configure formSheet (pushed
	// over this screen) edits the same state and the price/chart/chips below
	// update live. Seeded from the route params once per card.
	const {
		variant,
		setVariant,
		pricingTab,
		setPricingTab,
		rawCondition,
		setRawCondition,
		gradedCompany,
		setGradedCompany,
		gradedGrade,
		setGradedGrade,
		pricePaid,
		setPricePaid,
		seed,
	} = useCardConfig();

	useEffect(() => {
		if (!id) return;
		seed(id, {
			variant: initVariant || "",
			pricingTab: pricingType || "Raw",
			rawCondition: pricingType === "Graded" ? "NM" : condition || "NM",
			gradedCompany: initGradedCompany || null,
			gradedGrade: initGradedGrade || null,
			pricePaid: initPricePaid || "",
		});
	}, [id]);

	// Collection context
	const {
		incrementCardQuantity,
		addCardToCollection,
		removeCardFromCollection,
		decrementCardQuantity,
		updateCardPricePaid,
	} = useCollections();

	// History
	const [historyPeriod, setHistoryPeriod] = useState("30d");
	const [salesExpanded, setSalesExpanded] = useState(false);

	// Card data. Pro gets the full card (with prices) from the pricing API; non-Pro
	// gets identity + image from the local catalog so NO pricing call fires — the
	// price sections below are paywalled behind ProGate anyway.
	const {
		data: card,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["card", id],
		queryFn: () =>
			isPro
				? getCard(api, id)
				: getCatalogCard(api, id).then(catalogCardToScrydex),
		enabled: !!id,
	});

	// If the user upgrades to Pro while on this screen, the cached data is the
	// price-less catalog card, so prices stay "—". Refetch on the Pro transition
	// so the pricing API fires and real prices replace the placeholders. (The
	// history/listings queries re-enable themselves via their `enabled` flags.)
	const wasPro = useRef(isPro);
	useEffect(() => {
		if (isPro && !wasPro.current) refetch();
		wasPro.current = isPro;
	}, [isPro, refetch]);

	// Variants — auto-select the first when none was passed in
	const variantNames = useMemo(
		() => (card ? getVariantNames(card) : []),
		[card],
	);

	useEffect(() => {
		if (variantNames.length === 0) return;
		if (!variant || !variantNames.includes(variant)) {
			setVariant(variantNames[0]);
		}
	}, [variantNames]);

	// Derived: available grading companies and grades for the selected variant
	const gradedOptions = useMemo(
		() => (card && variant ? getGradedOptions(card, variant) : []),
		[card, variant],
	);
	const gradedCompanies = useMemo(
		() => gradedOptions.map((o) => o.company),
		[gradedOptions],
	);

	const gradedGrades = useMemo(() => {
		if (!gradedCompany) return [];
		return gradedOptions.find((o) => o.company === gradedCompany)?.grades ?? [];
	}, [gradedOptions, gradedCompany]);

	// Auto-select first company and highest grade (re-validating on variant change)
	useEffect(() => {
		if (gradedCompanies.length === 0) return;
		if (!gradedCompany || !gradedCompanies.includes(gradedCompany)) {
			setGradedCompany(gradedCompanies[0]);
		}
	}, [gradedCompanies]);

	useEffect(() => {
		if (gradedGrades.length === 0) return;
		if (!gradedGrade || !gradedGrades.includes(gradedGrade)) {
			setGradedGrade(gradedGrades[0]);
		}
	}, [gradedGrades]);

	// Condition options for the selected variant
	const conditionOptions = useMemo(() => {
		const conditions =
			card && variant ? getConditionOptions(card, variant) : [];
		if (conditions.length === 0) return [{ label: "Near Mint", value: "NM" }];
		return conditions.map((c) => ({
			label: formatConditionLabel(c),
			value: c,
		}));
	}, [card, variant]);

	useEffect(() => {
		if (!conditionOptions.some((o) => o.value === rawCondition)) {
			setRawCondition(conditionOptions[0].value);
		}
	}, [conditionOptions]);

	// Determine if graded tab is available
	const hasGraded = gradedCompanies.length > 0;

	// Get current prices
	const rawPrice =
		card && variant
			? selectPrice(card, variant, { kind: "raw", condition: rawCondition })
					?.value
			: undefined;

	const gradedPrice =
		card && variant && gradedCompany && gradedGrade
			? selectPrice(card, variant, {
					kind: "graded",
					company: gradedCompany,
					grade: gradedGrade,
				})?.value
			: undefined;

	// The hero price: show whichever tab is active
	const heroPrice = pricingTab === "Graded" ? gradedPrice : rawPrice;

	// Display fields
	const cardImage = card
		? getCardImage(card, variant || undefined, "large")
		: undefined;
	// The small thumbnail is already cached from the set/search grid, so use it as
	// an instant placeholder under the large image (which loads cold here since
	// it's a different URL) — no blank frame while the large downloads. Falls back
	// to the thumbnail URL passed in the route params, which is available before
	// the card data query resolves.
	const cardImageSmall =
		(card ? getCardImage(card, variant || undefined, "small") : undefined) ??
		initImage;
	// Blurred background — strictly the thumbnail we navigated with (already
	// cached, and plenty for a 30px-blur backdrop). Fixed for the whole screen:
	// it shows instantly and never reloads on data load or variant change.
	const bgImage = initImage;
	const cardNumber = card ? getCardNumber(card) : undefined;
	// Japanese cards display their English translation when available
	const displayName = card ? getCardDisplayName(card) : (name ?? "Card");
	const setDisplayName = card?.expansion
		? getExpansionDisplayName(card.expansion)
		: undefined;

	// The chart and recent sales follow the *settled* selection (debounced), so
	// flicking through conditions/tiers in the configure sheet doesn't fire a
	// history/listings request for every option passed over — and they're hidden
	// behind the sheet anyway. The hero price above stays live (cached card).
	const dTab = useDebouncedValue(pricingTab, 350);
	const dRawCondition = useDebouncedValue(rawCondition, 350);
	const dGradedCompany = useDebouncedValue(gradedCompany, 350);
	const dGradedGrade = useDebouncedValue(gradedGrade, 350);
	const dHistoryPeriod = useDebouncedValue(historyPeriod, 350);

	const dGradedTierKey =
		dGradedCompany && dGradedGrade
			? buildGradedTierKey(dGradedCompany, dGradedGrade)
			: null;
	const historyDays = PERIOD_TO_DAYS[dHistoryPeriod] ?? 30;

	const { data: rawHistory, isLoading: rawHistoryLoading } = useQuery({
		queryKey: ["history", id, dRawCondition, dHistoryPeriod],
		queryFn: () => getCardHistory(api, id, dRawCondition, historyDays),
		enabled: isPro && !!id && !!dRawCondition && dTab !== "Graded",
		placeholderData: keepPreviousData,
		staleTime: 60 * 60 * 1000,
	});

	const { data: gradedHistory, isLoading: gradedHistoryLoading } = useQuery({
		queryKey: ["history", id, dGradedTierKey, dHistoryPeriod],
		queryFn: () => getCardHistory(api, id, dGradedTierKey!, historyDays),
		enabled: isPro && !!id && !!dGradedTierKey && dTab === "Graded",
		placeholderData: keepPreviousData,
		staleTime: 60 * 60 * 1000,
	});

	// Chart data — flatten history days for the settled variant/tier (wagmi-charts format)
	const chartData = useMemo(() => {
		if (!variant) return [];
		if (dTab === "Graded") {
			if (!dGradedCompany || !dGradedGrade) return [];
			return historyToChartPoints(gradedHistory ?? [], variant, {
				kind: "graded",
				company: dGradedCompany,
				grade: dGradedGrade,
			});
		}
		return historyToChartPoints(rawHistory ?? [], variant, {
			kind: "raw",
			condition: dRawCondition,
		});
	}, [
		dTab,
		rawHistory,
		gradedHistory,
		variant,
		dRawCondition,
		dGradedCompany,
		dGradedGrade,
	]);

	const currencySymbol = "$";

	// Scroll the detail view up so the estimate price stays visible above the
	// configure sheet while options are changed.
	const scrollRef = useRef<ScrollView>(null);
	const estimateBottom = useRef(0);
	// The content sits inside an Animated.View (the crossfade wrapper), so the
	// estimate block's onLayout reports a y relative to that wrapper, not the
	// scroll view. Capture the wrapper's offset (the image above it) and add it
	// back, otherwise the scroll-to-estimate math is short by the image height.
	const contentTop = useRef(0);

	const openConfig = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		// Land the market-value block just above the sheet's top edge — the 0.6
		// detent puts the sheet top at ~40% of the screen height. Content point
		// c renders at screenY = c - scrollOffset, so target estimateBottom there.
		const sheetTopY = SCREEN_HEIGHT * 0.4;
		scrollRef.current?.scrollTo({
			y: Math.max(estimateBottom.current - sheetTopY + 16, 0),
			animated: true,
		});
		router.push("/(card)/configure");
	}, []);

	const confirmRemove = useCallback(() => {
		Alert.alert("Remove Card", "Remove this card from the collection?", [
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
	}, [collectionId, id, removeCardFromCollection]);

	// Recent sales — real eBay sold listings (also follows the settled selection)
	const { data: listings } = useQuery({
		queryKey: [
			"listings",
			id,
			dTab === "Graded" ? dGradedCompany : null,
			dTab === "Graded" ? dGradedGrade : null,
		],
		queryFn: () =>
			getCardListings(api, id, {
				pageSize: 25,
				orderBy: "-sold_at",
				company: dTab === "Graded" ? (dGradedCompany ?? undefined) : undefined,
				grade: dTab === "Graded" ? (dGradedGrade ?? undefined) : undefined,
			}),
		enabled: isPro && !!id && (dTab !== "Graded" || !!dGradedTierKey),
		placeholderData: keepPreviousData,
		staleTime: 15 * 60 * 1000,
	});

	const salesList = useMemo(() => {
		if (!listings) return [];
		return listings.filter((l) => {
			if (l.currency !== "USD") return false;
			if (l.is_signed || l.is_error || l.is_perfect) return false;
			// Raw tab: only ungraded sales. Scrydex misses slabs from smaller
			// graders (company unset), so also screen listing titles.
			if (dTab !== "Graded" && isLikelyGradedListing(l)) return false;
			return true;
		});
	}, [listings, dTab]);

	const configMatches =
		isFromCollection &&
		pricingTab === (pricingType || "Raw") &&
		variant === (initVariant || "") &&
		(pricingTab === "Graded"
			? (gradedCompany ?? "") === (initGradedCompany || "") &&
				(gradedGrade ?? "") === (initGradedGrade || "")
			: rawCondition === (condition || "NM"));

	useEffect(() => {
		if (!isFromCollection || !configMatches) return;
		if (pricePaid === (initPricePaid || "")) return;
		const timer = setTimeout(() => {
			const parsed = pricePaid.trim().length > 0 ? parseFloat(pricePaid) : NaN;
			updateCardPricePaid.mutate({
				collectionId: collectionId!,
				cardId: id,
				pricingType: pricingTab,
				variant,
				condition: pricingTab === "Graded" ? "GRADED" : rawCondition,
				gradedCompany:
					pricingTab === "Graded" ? (gradedCompany ?? undefined) : undefined,
				gradedGrade:
					pricingTab === "Graded" ? (gradedGrade ?? undefined) : undefined,
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
		pricingTab,
		variant,
		rawCondition,
		gradedCompany,
		gradedGrade,
	]);

	return (
		<>
			<Stack.Screen
				options={{
					headerTitle: displayName,
					headerRight: () =>
						configMatches ? null : (
							<Pressable
								hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
								onPress={() => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									if (!isPro) {
										void presentProPaywallIfNeeded();
										return;
									}
									const parsedPricePaid =
										pricePaid.trim().length > 0
											? parseFloat(pricePaid)
											: undefined;
									if (isFromCollection) {
										addCardToCollection.mutate(
											{
												collectionId: collectionId!,
												cardId: id,
												cardName: displayName,
												cardNumber: cardNumber ?? undefined,
												setName: setDisplayName,
												cardImageUrl: cardImage ?? "",
												cardValue: heroPrice ?? 0,
												pricingType: pricingTab,
												variant,
												condition:
													pricingTab === "Graded" ? "GRADED" : rawCondition,
												gradedCompany:
													pricingTab === "Graded"
														? (gradedCompany ?? undefined)
														: undefined,
												gradedGrade:
													pricingTab === "Graded"
														? (gradedGrade ?? undefined)
														: undefined,
												pricePaid:
													parsedPricePaid !== undefined &&
													!isNaN(parsedPricePaid)
														? parsedPricePaid
														: undefined,
											},
											{
												onSuccess: () => {
													Haptics.notificationAsync(
														Haptics.NotificationFeedbackType.Success,
													);
													const configLabel =
														pricingTab === "Graded"
															? `${gradedCompany} ${gradedGrade}`
															: `${formatVariantLabel(variant)} · ${formatConditionLabel(rawCondition)}`;
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
												cardName: displayName,
												cardNumber: cardNumber ?? "",
												setName: setDisplayName ?? "",
												cardImageUrl: cardImage ?? "",
												cardValue: String(heroPrice ?? 0),
												pricingType: pricingTab,
												variant,
												condition:
													pricingTab === "Graded" ? "GRADED" : rawCondition,
												gradedCompany:
													pricingTab === "Graded" ? (gradedCompany ?? "") : "",
												gradedGrade:
													pricingTab === "Graded" ? (gradedGrade ?? "") : "",
												pricePaid:
													parsedPricePaid !== undefined &&
													!isNaN(parsedPricePaid)
														? String(parsedPricePaid)
														: "",
											},
										});
									}
								}}
							>
								<Ionicons name="add" size={26} color={colors.foreground} />
							</Pressable>
						),
				}}
			/>

			<View style={[styles.container, { backgroundColor: colors.background }]}>
				{/* Blurred backdrop — small image, kept OUTSIDE the crossfade so it
				    never re-fades (it's identical in both states). */}
				{bgImage && (
					<Image
						source={{ uri: bgImage }}
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

				{isLoading || card ? (
					<ScrollView
						ref={scrollRef}
						style={styles.container}
						contentContainerStyle={styles.content}
						contentInsetAdjustmentBehavior="automatic"
						showsVerticalScrollIndicator={false}
					>
						{/* Card Image — persistent, OUTSIDE the crossfade: a single
						    element that just switches from the cached small thumbnail to
						    the large image once the card data loads (no fade between). */}
						<View style={styles.imageContainer}>
							<CardImage
								uri={cardImage ?? initImage ?? ""}
								placeholder={cardImageSmall}
								style={{
									width: IMAGE_WIDTH,
									height: IMAGE_HEIGHT,
									borderRadius: 14,
								}}
								backgroundColor="transparent"
								shimmerColor={colors.border}
								fallback={
									<View
										style={{
											flex: 1,
											alignItems: "center",
											justifyContent: "center",
											gap: 6,
										}}
									>
										<Ionicons
											name="image-outline"
											size={28}
											color={colors.mutedForeground}
										/>
										{displayName && (
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
												{displayName}
											</Text>
										)}
										{cardNumber && (
											<Text
												style={{
													color: colors.mutedForeground,
													fontSize: 11,
												}}
											>
												#{cardNumber}
											</Text>
										)}
									</View>
								}
							/>
						</View>

						{card ? (
							<Animated.View
								key="card-content"
								// Fade the whole sheet in as the skeleton fades out, so the two
								// overlap into a crossfade instead of a hard cut. The inner
								// sections still cascade in on top via sectionEntering.
								entering={FadeIn.duration(260)}
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
								onLayout={(e) => {
									contentTop.current = e.nativeEvent.layout.y;
								}}
							>
								<View
									style={[
										styles.grabber,
										{ backgroundColor: colors.mutedForeground + "66" },
									]}
								/>

								{/* Market value — the sheet's headline, resting on the counter */}
								<Animated.View
									entering={sectionEntering(0)}
									onLayout={(e) => {
										const { y, height } = e.nativeEvent.layout;
										estimateBottom.current = contentTop.current + y + height;
									}}
								>
									<ProGate style={styles.valueGate}>
										<View style={styles.valueTopRow}>
											<View style={styles.valueMain}>
												<Text
													style={[
														styles.estimateLabel,
														{ color: colors.foreground, opacity: 0.75 },
													]}
												>
													MARKET VALUE
												</Text>
												{heroPrice === undefined ? (
													<Text
														style={[
															styles.heroPrice,
															{ color: colors.foreground },
														]}
													>
														—
													</Text>
												) : (
													<TickerPrice
														value={heroPrice}
														style={[
															styles.heroPrice,
															{ color: colors.foreground },
														]}
													/>
												)}
											</View>

											{/* Quantity owned — sits with the value when this exact
											    configuration is in the collection */}
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
															// At 1, decrementing would leave a 0-quantity row,
															// so confirm removal from the collection instead.
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
																	pricingType: pricingType || "Raw",
																	variant: initVariant || "normal",
																	condition: condition || "NM",
																	gradedCompany: initGradedCompany || undefined,
																	gradedGrade: initGradedGrade || undefined,
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
																	pricingType: pricingType || "Raw",
																	variant: initVariant || "normal",
																	condition: condition || "NM",
																	gradedCompany: initGradedCompany || undefined,
																	gradedGrade: initGradedGrade || undefined,
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

										{/* Active selection summary chips */}
										<View style={styles.selectionSummary}>
											{pricingTab === "Graded" ? (
												<>
													<View
														style={[
															styles.selectionChip,
															{
																backgroundColor: colors.primary + "33",
																borderColor: colors.primary + "55",
															},
														]}
													>
														<View
															style={[
																styles.chipDot,
																{
																	backgroundColor: colors.primary,
																},
															]}
														/>
														<Text
															style={[
																styles.selectionChipText,
																{
																	color: colors.foreground,
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
																	backgroundColor: colors.primary + "33",
																	borderColor: colors.primary + "55",
																},
															]}
														>
															<View
																style={[
																	styles.chipDot,
																	{
																		backgroundColor: colors.primary,
																	},
																]}
															/>
															<Text
																style={[
																	styles.selectionChipText,
																	{
																		color: colors.foreground,
																	},
																]}
															>
																{gradedCompany} {gradedGrade}
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
																backgroundColor: colors.primary + "33",
																borderColor: colors.primary + "55",
															},
														]}
													>
														<View
															style={[
																styles.chipDot,
																{
																	backgroundColor: colors.primary,
																},
															]}
														/>
														<Text
															style={[
																styles.selectionChipText,
																{
																	color: colors.foreground,
																},
															]}
														>
															{variant ? formatVariantLabel(variant) : "—"}
														</Text>
													</View>
													<View
														style={[
															styles.selectionChip,
															{
																backgroundColor: colors.primary + "33",
																borderColor: colors.primary + "55",
															},
														]}
													>
														<View
															style={[
																styles.chipDot,
																{
																	backgroundColor: colors.primary,
																},
															]}
														/>
														<Text
															style={[
																styles.selectionChipText,
																{
																	color: colors.foreground,
																},
															]}
														>
															{formatConditionLabel(rawCondition)}
														</Text>
													</View>
												</>
											)}
										</View>
									</ProGate>
								</Animated.View>

								<View
									style={[styles.divider, { backgroundColor: colors.border }]}
								/>

								{/* Identity — card name, set, rarity */}
								<Animated.View
									entering={sectionEntering(2)}
									style={styles.metaStrip}
								>
									<View style={{ flex: 1 }}>
										<Text
											style={[styles.cardName, { color: colors.foreground }]}
										>
											{displayName}
											{cardNumber ? (
												<Text
													style={{
														color: colors.foreground,
														opacity: 0.65,
														fontWeight: "500",
													}}
												>
													{" "}
													#{cardNumber}
												</Text>
											) : null}
										</Text>
										<Text
											style={[
												styles.setName,
												{ color: colors.foreground, opacity: 0.7 },
											]}
										>
											{setDisplayName}
										</Text>
									</View>
									<View style={styles.pillRow}>
										{!!getCardDisplayRarity(card) && (
											<InfoPill
												label={getCardDisplayRarity(card)!}
												color={colors.foreground}
												bgColor={colors.primary + "33"}
												borderColor={colors.primary + "55"}
											/>
										)}
										{!!variant && (
											<InfoPill
												label={formatVariantLabel(variant)}
												color={colors.foreground}
												bgColor={colors.primary + "33"}
												borderColor={colors.primary + "55"}
											/>
										)}
									</View>
								</Animated.View>

								<View
									style={[styles.divider, { backgroundColor: colors.border }]}
								/>

								{/* Pricing Options — tap a row to configure in the sheet */}
								<Animated.View
									entering={sectionEntering(3)}
									style={styles.sheetSection}
								>
									<Text
										style={[styles.sectionTitle, { color: colors.foreground }]}
									>
										Pricing Options
									</Text>
									{variantNames.length > 1 && (
										<ConfigRow
											label="Variant"
											value={formatVariantLabel(variant)}
											onPress={openConfig}
											colors={colors}
										/>
									)}
									<ConfigRow
										label={pricingTab === "Graded" ? "Grade" : "Condition"}
										value={
											pricingTab === "Graded"
												? gradedCompany && gradedGrade
													? `${gradedCompany} ${gradedGrade}`
													: "—"
												: formatConditionLabel(rawCondition)
										}
										onPress={openConfig}
										colors={colors}
										isLast
									/>

									<Text
										style={[
											styles.pricePaidLabel,
											{ color: colors.mutedForeground },
										]}
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
											{currencySymbol}
										</Text>
										<TextInput
											style={[
												styles.pricePaidInput,
												{ color: colors.foreground },
											]}
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

								<View
									style={[styles.divider, { backgroundColor: colors.border }]}
								/>

								{/* Price History Chart */}
								<Animated.View entering={sectionEntering(4)}>
									<ProGate style={styles.sheetSection}>
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

										{(
											dTab === "Graded"
												? gradedHistoryLoading
												: rawHistoryLoading
										) ? (
											<View style={styles.chartPlaceholder}>
												<Skeleton
													width="100%"
													height={180}
													color={colors.border}
												/>
											</View>
										) : chartData.length > 1 ? (
											<View>
												<LineChart.Provider data={chartData}>
													<View style={styles.chartHoverHeader}>
														<LineChart.PriceText
															format={({ value }) => {
																"worklet";
																if (!value) return "";
																const n = Number(value);
																if (!isFinite(n)) return "—";
																const [intPart, decPart] = n
																	.toFixed(2)
																	.split(".");
																const withCommas = intPart.replace(
																	/\B(?=(\d{3})+(?!\d))/g,
																	",",
																);
																return `${currencySymbol}${withCommas}.${decPart}`;
															}}
															style={[
																styles.chartHoverPrice,
																{ color: colors.foreground },
															]}
														/>
														<LineChart.DatetimeText
															style={[
																styles.chartHoverDate,
																{
																	color: colors.foreground,
																	opacity: 0.7,
																},
															]}
														/>
													</View>

													<View style={styles.chartContainer}>
														<LineChart
															height={180}
															width={CHART_WIDTH}
															yGutter={20}
														>
															<LineChart.Path color={colors.primary} width={2}>
																<LineChart.Gradient />
																<LineChart.Dot
																	at={chartData.length - 1}
																	color={colors.primary}
																	size={5}
																	hasPulse
																	pulseBehaviour="while-inactive"
																/>
															</LineChart.Path>
															<LineChart.CursorCrosshair
																color={colors.foreground}
															/>
														</LineChart>
													</View>
												</LineChart.Provider>
												<Text
													style={[
														styles.scrubHint,
														{
															color: colors.foreground,
															opacity: 0.55,
														},
													]}
												>
													Touch and drag to see prices
												</Text>
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
									</ProGate>
								</Animated.View>

								{/* Recent Sales */}
								{salesList.length > 0 && (
									<Animated.View entering={sectionEntering(5)}>
										<View
											style={[
												styles.divider,
												{ backgroundColor: colors.border },
											]}
										/>
										{isPro ? (
											<AnimatedCollapsible
												title="Recent Sales"
												expanded={salesExpanded}
												onToggle={() => setSalesExpanded((v) => !v)}
												colors={colors}
												outerStyle={styles.collapsibleInSheet}
											>
												{salesList.slice(0, 20).map((item, i) => (
													<Pressable
														key={item.id}
														disabled={!item.url}
														onPress={() => {
															if (item.url) {
																Haptics.impactAsync(
																	Haptics.ImpactFeedbackStyle.Light,
																);
																Linking.openURL(item.url);
															}
														}}
														style={[
															styles.historyRow,
															i < Math.min(salesList.length, 20) - 1 && {
																borderBottomWidth: 1,
																borderBottomColor: colors.foreground + "14",
															},
														]}
													>
														<View style={{ flex: 1, paddingRight: 12 }}>
															<Text
																style={[
																	styles.historyDate,
																	{
																		color: colors.foreground,
																	},
																]}
															>
																{new Date(
																	item.sold_at.replace(/\//g, "-"),
																).toLocaleDateString()}
															</Text>
															<Text
																style={[
																	styles.historyMeta,
																	{
																		color: colors.foreground,
																		opacity: 0.6,
																	},
																]}
																numberOfLines={1}
															>
																{item.title}
															</Text>
														</View>
														<View style={{ alignItems: "flex-end" }}>
															<Text
																style={[
																	styles.historyPrice,
																	{
																		color: colors.foreground,
																	},
																]}
															>
																{formatPrice(item.price)}
															</Text>
															{item.company && (
																<Text
																	style={[
																		styles.historyMeta,
																		{
																			color: colors.foreground,
																			opacity: 0.6,
																		},
																	]}
																>
																	{item.company} {item.grade}
																</Text>
															)}
														</View>
													</Pressable>
												))}
											</AnimatedCollapsible>
										) : (
											<ProGate style={styles.sheetSection}>
												<View style={styles.collapsibleHeader}>
													<Text
														style={[
															styles.sectionTitle,
															{ color: colors.foreground, marginBottom: 0 },
														]}
													>
														Recent Sales
													</Text>
													<Ionicons
														name="chevron-down"
														size={18}
														color={colors.mutedForeground}
													/>
												</View>
												{salesList.slice(0, 3).map((item, i) => (
													<View
														key={item.id}
														style={[
															styles.historyRow,
															i < Math.min(salesList.length, 3) - 1 && {
																borderBottomWidth: 1,
																borderBottomColor: colors.foreground + "14",
															},
														]}
													>
														<View style={{ flex: 1, paddingRight: 12 }}>
															<Text
																style={[
																	styles.historyDate,
																	{ color: colors.foreground },
																]}
															>
																{new Date(
																	item.sold_at.replace(/\//g, "-"),
																).toLocaleDateString()}
															</Text>
															<Text
																style={[
																	styles.historyMeta,
																	{ color: colors.foreground, opacity: 0.6 },
																]}
																numberOfLines={1}
															>
																{item.title}
															</Text>
														</View>
														<Text
															style={[
																styles.historyPrice,
																{ color: colors.foreground },
															]}
														>
															{formatPrice(item.price)}
														</Text>
													</View>
												))}
											</ProGate>
										)}
									</Animated.View>
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
							</Animated.View>
						) : (
							<Animated.View
								key="card-skeleton"
								exiting={FadeOut.duration(220)}
							>
								<LoadingSkeleton
									colors={colors}
									isFromCollection={isFromCollection}
								/>
							</Animated.View>
						)}
					</ScrollView>
				) : (
					<View style={[StyleSheet.absoluteFill, styles.centered]}>
						{isError ? (
							<ErrorState
								title="Couldn't load card"
								onRetry={() => refetch()}
							/>
						) : (
							<Text style={{ color: colors.mutedForeground }}>
								Card not found
							</Text>
						)}
					</View>
				)}
			</View>
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

	// The counter — one solid surface that rises beneath the floating card and
	// holds every detail as divided rows (replaces the old floating cards).
	sheet: {
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 10,
		paddingBottom: 40,
		// Fill the remaining height below the card when content is short.
		flexGrow: 1,
		minHeight: SCREEN_HEIGHT * 0.5,
		// Lift the lip off the stage so the card reads as floating above it.
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
	// A section's breathing room inside the sheet — replaces per-card margins.
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
	tickerInput: {
		alignSelf: "flex-start",
		textAlign: "left",
		padding: 0,
		fontVariant: ["tabular-nums"],
	},
	selectionSummary: {
		flexDirection: "row",
		gap: 6,
		marginTop: 14,
		flexWrap: "wrap",
		justifyContent: "flex-start",
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
		width: 7,
		height: 7,
		borderRadius: 3.5,
	},

	// Card meta strip — now a row within the sheet
	metaStrip: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 22,
		paddingVertical: 18,
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

	// Sections
	section: {
		marginHorizontal: 20,
		marginBottom: 12,
		borderRadius: 12,
		borderWidth: 1,
		padding: 16,
	},
	// Strips the collapsible's standalone-card chrome so it reads as a sheet row.
	collapsibleInSheet: {
		marginHorizontal: 0,
		marginBottom: 0,
		borderRadius: 0,
		borderWidth: 0,
		paddingHorizontal: 22,
		paddingVertical: 18,
		backgroundColor: "transparent",
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "700",
		lineHeight: 20,
		marginBottom: 12,
	},

	// Config summary rows
	configRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 14,
	},
	configRowLabel: {
		fontSize: 15,
		fontWeight: "600",
	},
	configRowRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		flexShrink: 1,
	},
	configRowValue: {
		fontSize: 15,
		fontWeight: "500",
		opacity: 0.7,
		flexShrink: 1,
	},

	// Price paid input
	pricePaidLabel: {
		fontSize: 11,
		fontWeight: "600",
		letterSpacing: 0.5,
		textTransform: "uppercase",
		marginTop: 16,
		marginBottom: 8,
	},
	pricePaidRow: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 10,
		borderWidth: 1,
		paddingHorizontal: 12,
		height: 42,
	},
	pricePaidSymbol: {
		fontSize: 16,
		fontWeight: "500",
		marginRight: 6,
	},
	pricePaidInput: {
		flex: 1,
		fontSize: 16,
		fontVariant: ["tabular-nums"],
		paddingVertical: 0,
	},

	// Period toggle
	periodRow: {
		flexDirection: "row",
		borderRadius: 8,
		padding: 2,
		gap: 2,
	},
	periodPill: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 6,
		minWidth: 36,
		alignItems: "center",
	},
	periodText: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 0.3,
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
		alignItems: "center",
	},
	chartHoverHeader: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 10,
		marginBottom: 4,
		minHeight: 22,
	},
	chartHoverPrice: {
		fontSize: 18,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	chartHoverDate: {
		fontSize: 12,
		fontWeight: "500",
	},
	scrubHint: {
		fontSize: 11,
		fontWeight: "500",
		marginTop: 10,
		textAlign: "center",
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
		paddingVertical: 14,
	},
	historyDate: {
		fontSize: 14,
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
	},
	historyMeta: {
		fontSize: 12,
		fontWeight: "500",
		marginTop: 3,
	},
	historyPrice: {
		fontSize: 15,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
});
