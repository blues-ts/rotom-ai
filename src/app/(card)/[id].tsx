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
import { SymbolView } from "expo-symbols";
import { LinearGradient } from "expo-linear-gradient";
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
	getTcgplayerProductUrl,
	getVariantNames,
	historyToChartPoints,
	isLikelyGradedListing,
	selectPrice,
} from "@/lib/scrydex";
import { formatCurrency } from "@/lib/format";
import { chart, typeScale, useRiverTheme } from "@/constants/theme";
import { useCollections } from "@/hooks/useCollections";
import { useCardConfig } from "@/context/CardConfigContext";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import { ProGate } from "@/components/ProGate";
import CardImage from "@/components/CardImage";
import ErrorState from "@/components/ErrorState";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
// Centered hero card — full-bleed like the original layout (90% of the screen),
// TCG ratio (63:88), never cropped.
const IMAGE_WIDTH = SCREEN_WIDTH * 0.9;
const IMAGE_HEIGHT = IMAGE_WIDTH * (88 / 63);
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
	// A TextInput's intrinsic width is measured once at mount — animated text
	// updates never re-trigger layout, so a value that grows longer than the
	// mount-time string gets clipped. Fill the row instead and shrink the font
	// to fit long values (a TextInput can't adjustsFontSizeToFit like Text can).
	const [rowWidth, setRowWidth] = useState(0);
	const targetText = formatPrice(value);
	// ~0.62em per glyph: tabular-nums digits at weight 800, net of the -1.5
	// letter-spacing. Conservative so the string never overflows the row.
	const fontSize =
		rowWidth > 0
			? Math.min(
					38,
					Math.max(22, Math.floor(rowWidth / (targetText.length * 0.62))),
				)
			: 38;

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
		<View
			style={{ width: "100%" }}
			onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
		>
			<AnimatedTextInput
				editable={false}
				pointerEvents="none"
				underlineColorAndroid="transparent"
				style={[style, styles.tickerInput, { width: "100%", fontSize }]}
				animatedProps={animatedProps}
				defaultValue={targetText}
			/>
		</View>
	);
}

// --- Period Toggle ---

const PERIODS = ["7d", "30d", "90d", "1y"] as const;

function PeriodToggle({
	selected,
	onSelect,
	t,
}: {
	selected: string;
	onSelect: (val: string) => void;
	t: any;
}) {
	// Selected pill gets the accent fill; the rest are text-only (accent fill
	// means selected, never decoration).
	return (
		<View style={styles.periodRow}>
			{PERIODS.map((p) => {
				const active = p === selected;
				return (
					<Pressable
						key={p}
						hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
						style={[
							styles.periodPill,
							active && { backgroundColor: t.accent },
						]}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							onSelect(p);
						}}
					>
						<Text
							style={[
								styles.periodText,
								{ color: active ? "#FFFFFF" : t.text.secondary },
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
	t,
	outerStyle,
	children,
}: {
	title: string;
	expanded: boolean;
	onToggle: () => void;
	t: any;
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
					backgroundColor: t.glass.surfaceFill,
					borderColor: t.glass.surfaceBorder,
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
						{ color: t.text.primary, marginBottom: 0 },
					]}
				>
					{title}
				</Text>
				<Animated.View style={chevronStyle}>
					<SymbolView
	name="chevron.down"
	size={18}
	tintColor={t.text.secondary}
	weight="medium"
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
	t,
	isFromCollection,
}: {
	t: any;
	isFromCollection?: boolean;
}) {
	// `border` (not `muted`) so blocks stay visible against the sheet's `card`
	// background — muted is nearly identical to card in dark mode. Matches the
	// set-detail loader, which pulses opacity on `border`.
	const skeletonColor = t.glass.surfaceBorder;

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
					{ backgroundColor: t.glass.surfaceFill, borderColor: t.glass.surfaceBorder },
				]}
			>
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

				<View style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]} />

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

				<View style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]} />

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
									borderBottomColor: t.glass.surfaceBorder,
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

				<View style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]} />

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
	t,
	isLast,
}: {
	label: string;
	value: string;
	onPress: () => void;
	t: any;
	isLast?: boolean;
}) {
	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.configRow,
				!isLast && {
					borderBottomWidth: StyleSheet.hairlineWidth,
					borderBottomColor: t.glass.surfaceBorder,
				},
			]}
		>
			<Text style={[styles.configRowLabel, { color: t.text.primary }]}>
				{label}
			</Text>
			<View style={styles.configRowRight}>
				<Text
					style={[styles.configRowValue, { color: t.text.primary }]}
					numberOfLines={1}
				>
					{value}
				</Text>
				<SymbolView
	name="chevron.right"
	size={16}
	tintColor={t.text.secondary}
	weight="medium"
/>
			</View>
		</Pressable>
	);
}

// --- Main ---

export default function CardDetail() {
	const t = useRiverTheme();
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

	const dGradedTierKey =
		dGradedCompany && dGradedGrade
			? buildGradedTierKey(dGradedCompany, dGradedGrade)
			: null;

	// Always fetch the full year and slice per-period client-side, so the period
	// toggle never waits on the network (or the settle debounce — a period tap is
	// a single deliberate gesture, unlike flicking through conditions).
	const {
		data: rawHistory,
		isLoading: rawHistoryLoading,
		isPlaceholderData: rawHistoryStale,
	} = useQuery({
		queryKey: ["history", id, dRawCondition],
		queryFn: () => getCardHistory(api, id, dRawCondition, 365),
		enabled: isPro && !!id && !!dRawCondition && dTab !== "Graded",
		placeholderData: keepPreviousData,
		staleTime: 60 * 60 * 1000,
	});

	const {
		data: gradedHistory,
		isLoading: gradedHistoryLoading,
		isPlaceholderData: gradedHistoryStale,
	} = useQuery({
		queryKey: ["history", id, dGradedTierKey],
		queryFn: () => getCardHistory(api, id, dGradedTierKey!, 365),
		enabled: isPro && !!id && !!dGradedTierKey && dTab === "Graded",
		placeholderData: keepPreviousData,
		staleTime: 60 * 60 * 1000,
	});

	// Chart data — flatten history days for the settled variant/tier (wagmi-charts
	// format), then slice to the selected period. The slice reads the live (not
	// debounced) period so switching ranges is instant and never refetches.
	const chartData = useMemo(() => {
		if (!variant) return [];
		let points: { timestamp: number; value: number }[];
		if (dTab === "Graded") {
			if (!dGradedCompany || !dGradedGrade) return [];
			points = historyToChartPoints(gradedHistory ?? [], variant, {
				kind: "graded",
				company: dGradedCompany,
				grade: dGradedGrade,
			});
		} else {
			points = historyToChartPoints(rawHistory ?? [], variant, {
				kind: "raw",
				condition: dRawCondition,
			});
		}
		const days = PERIOD_TO_DAYS[historyPeriod] ?? 30;
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
		return points.filter((p) => p.timestamp >= cutoff);
	}, [
		dTab,
		rawHistory,
		gradedHistory,
		variant,
		dRawCondition,
		dGradedCompany,
		dGradedGrade,
		historyPeriod,
	]);

	// True while the chart is showing the previous condition/tier's line waiting
	// on a fetch for the new one (keepPreviousData hides the query's pending
	// state, so surface it as a dimmed chart instead of a frozen one).
	const chartStale =
		dTab === "Graded" ? gradedHistoryStale : rawHistoryStale;

	const currencySymbol = "$";

	// TCGplayer link-out for the selected variant; undefined hides the row
	// (e.g. Japanese cards, which TCGplayer doesn't list).
	const tcgplayerUrl = card
		? getTcgplayerProductUrl(card, variant || undefined)
		: undefined;

	// Pops this modal (and anything under it) back to the home chat screen with
	// a ready-to-send question about this card seeded into the input.
	const openChatAboutCard = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		const label = `${displayName}${cardNumber ? ` #${cardNumber}` : ""}${
			setDisplayName ? ` from ${setDisplayName}` : ""
		}`;
		router.dismissTo({
			pathname: "/(home)",
			params: { chatPrefill: `Tell me about ${label}` },
		});
	}, [displayName, cardNumber, setDisplayName]);

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
									borderRadius: 12,
								}}
								backgroundColor="transparent"
								shimmerColor={t.glass.surfaceBorder}
								fallback={
									<View
										style={{
											flex: 1,
											alignItems: "center",
											justifyContent: "center",
											gap: 6,
										}}
									>
										<SymbolView
	name="photo"
	size={28}
	tintColor={t.text.secondary}
	weight="medium"
/>
										{displayName && (
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
												{displayName}
											</Text>
										)}
										{cardNumber && (
											<Text
												style={{
													color: t.text.secondary,
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
										backgroundColor: t.glass.surfaceFill,
										borderColor: t.glass.surfaceBorder,
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
														{ color: t.text.secondary },
													]}
												>
													Market value
												</Text>
												{heroPrice === undefined ? (
													<Text
														style={[
															styles.heroPrice,
															{ color: t.text.primary },
														]}
													>
														—
													</Text>
												) : (
													<TickerPrice
														value={heroPrice}
														style={[
															styles.heroPrice,
															{ color: t.text.primary },
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
															backgroundColor: t.glass.elevatedFill,
															borderColor: t.glass.surfaceBorder,
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

										{/* Active selection summary chips */}
										<View style={styles.selectionSummary}>
											{pricingTab === "Graded" ? (
												<>
													<View
														style={[
															styles.selectionChip,
															{
																backgroundColor: t.glass.elevatedFill,
																borderColor: t.glass.elevatedBorder,
															},
														]}
													>
														<View
															style={[
																styles.chipDot,
																{
																	backgroundColor: t.accent,
																},
															]}
														/>
														<Text
															style={[
																styles.selectionChipText,
																{
																	color: t.text.primary,
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
																	backgroundColor: t.glass.elevatedFill,
																	borderColor: t.glass.elevatedBorder,
																},
															]}
														>
															<View
																style={[
																	styles.chipDot,
																	{
																		backgroundColor: t.accent,
																	},
																]}
															/>
															<Text
																style={[
																	styles.selectionChipText,
																	{
																		color: t.text.primary,
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
																backgroundColor: t.glass.elevatedFill,
																borderColor: t.glass.elevatedBorder,
															},
														]}
													>
														<View
															style={[
																styles.chipDot,
																{
																	backgroundColor: t.accent,
																},
															]}
														/>
														<Text
															style={[
																styles.selectionChipText,
																{
																	color: t.text.primary,
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
																backgroundColor: t.glass.elevatedFill,
																borderColor: t.glass.elevatedBorder,
															},
														]}
													>
														<View
															style={[
																styles.chipDot,
																{
																	backgroundColor: t.accent,
																},
															]}
														/>
														<Text
															style={[
																styles.selectionChipText,
																{
																	color: t.text.primary,
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
									style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]}
								/>

								{/* Identity — card name, set, rarity */}
								<Animated.View
									entering={sectionEntering(2)}
									style={styles.metaStrip}
								>
									<View style={{ flex: 1 }}>
										<Text
											style={[styles.cardName, { color: t.text.primary }]}
										>
											{displayName}
											{cardNumber ? (
												<Text
													style={{
														color: t.text.primary,
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
												{ color: t.text.primary, opacity: 0.7 },
											]}
										>
											{setDisplayName}
										</Text>
									</View>
									<View style={styles.pillRow}>
										{!!getCardDisplayRarity(card) && (
											<InfoPill
												label={getCardDisplayRarity(card)!}
												color={t.text.primary}
												bgColor={t.glass.elevatedFill}
												borderColor={t.glass.elevatedBorder}
											/>
										)}
										{!!variant && (
											<InfoPill
												label={formatVariantLabel(variant)}
												color={t.text.primary}
												bgColor={t.glass.elevatedFill}
												borderColor={t.glass.elevatedBorder}
											/>
										)}
									</View>
								</Animated.View>

								<View
									style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]}
								/>

								{/* Pricing Options — tap a row to configure in the sheet */}
								<Animated.View
									entering={sectionEntering(3)}
									style={styles.sheetSection}
								>
									<Text
										style={[styles.sectionTitle, { color: t.text.primary }]}
									>
										Pricing Options
									</Text>
									{variantNames.length > 1 && (
										<ConfigRow
											label="Variant"
											value={formatVariantLabel(variant)}
											onPress={openConfig}
											t={t}
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
										t={t}
										isLast
									/>

									<Text
										style={[
											styles.pricePaidLabel,
											{ color: t.text.secondary },
										]}
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
											{currencySymbol}
										</Text>
										<TextInput
											style={[
												styles.pricePaidInput,
												{ color: t.text.primary },
											]}
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

								{/* Chat about this card — jumps to River with the card seeded */}
								<Animated.View entering={sectionEntering(4)}>
									<Pressable
										onPress={openChatAboutCard}
										style={styles.linkOutRow}
									>
										<SymbolView
	name="bubble.left.and.bubble.right"
	size={18}
	tintColor={t.text.primary}
	weight="medium"
/>
										<Text
											style={[
												styles.linkOutText,
												{ color: t.text.primary },
											]}
										>
											Chat about this card
										</Text>
										<SymbolView
	name="chevron.right"
	size={16}
	tintColor={t.text.secondary}
	weight="medium"
/>
									</Pressable>
									<View
										style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]}
									/>
								</Animated.View>

								{/* Buy on TCGplayer — follows the selected variant */}
								{tcgplayerUrl && (
									<Animated.View entering={sectionEntering(4)}>
										<Pressable
											onPress={() => {
												Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
												Linking.openURL(tcgplayerUrl);
											}}
											style={styles.linkOutRow}
										>
											<SymbolView
	name="cart"
	size={18}
	tintColor={t.text.primary}
	weight="medium"
/>
											<Text
												style={[
													styles.linkOutText,
													{ color: t.text.primary },
												]}
											>
												Buy on TCGplayer
											</Text>
											<SymbolView
	name="arrow.up.right"
	size={16}
	tintColor={t.text.secondary}
	weight="medium"
/>
										</Pressable>
										<View
											style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]}
										/>
									</Animated.View>
								)}

								{/* Price History Chart */}
								<Animated.View entering={sectionEntering(4)}>
									<ProGate style={styles.sheetSection}>
										<View style={styles.chartHeader}>
											<Text
												style={[
													styles.sectionTitle,
													{
														color: t.text.primary,
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
												t={t}
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
													color={t.glass.surfaceBorder}
												/>
											</View>
										) : chartData.length > 1 ? (
											<View style={chartStale ? { opacity: 0.4 } : undefined}>
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
																{ color: t.text.primary },
															]}
														/>
														<LineChart.DatetimeText
															style={[
																styles.chartHoverDate,
																{
																	color: t.text.primary,
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
															<LineChart.Path
																color={chart.line}
																width={chart.strokeWidth}
															>
																<LineChart.Gradient color={chart.line} />
																<LineChart.Dot
																	at={chartData.length - 1}
																	color={chart.line}
																	size={chart.endDotRadius}
																	hasPulse
																	pulseBehaviour="while-inactive"
																/>
															</LineChart.Path>
															<LineChart.CursorCrosshair
																color={t.text.primary}
															/>
														</LineChart>
													</View>
												</LineChart.Provider>
												<Text
													style={[
														styles.scrubHint,
														{
															color: t.text.primary,
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
														color: t.text.secondary,
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
												{ backgroundColor: t.glass.surfaceBorder },
											]}
										/>
										{isPro ? (
											<AnimatedCollapsible
												title="Recent Sales"
												expanded={salesExpanded}
												onToggle={() => setSalesExpanded((v) => !v)}
												t={t}
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
																borderBottomColor: t.glass.surfaceBorder,
															},
														]}
													>
														<View style={{ flex: 1, paddingRight: 12 }}>
															<Text
																style={[
																	styles.historyDate,
																	{
																		color: t.text.primary,
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
																		color: t.text.primary,
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
																		color: t.text.primary,
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
																			color: t.text.primary,
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
															{ color: t.text.primary, marginBottom: 0 },
														]}
													>
														Recent Sales
													</Text>
													<SymbolView
	name="chevron.down"
	size={18}
	tintColor={t.text.secondary}
	weight="medium"
/>
												</View>
												{salesList.slice(0, 3).map((item, i) => (
													<View
														key={item.id}
														style={[
															styles.historyRow,
															i < Math.min(salesList.length, 3) - 1 && {
																borderBottomWidth: 1,
																borderBottomColor: t.glass.surfaceBorder,
															},
														]}
													>
														<View style={{ flex: 1, paddingRight: 12 }}>
															<Text
																style={[
																	styles.historyDate,
																	{ color: t.text.primary },
																]}
															>
																{new Date(
																	item.sold_at.replace(/\//g, "-"),
																).toLocaleDateString()}
															</Text>
															<Text
																style={[
																	styles.historyMeta,
																	{ color: t.text.primary, opacity: 0.6 },
																]}
																numberOfLines={1}
															>
																{item.title}
															</Text>
														</View>
														<Text
															style={[
																styles.historyPrice,
																{ color: t.text.primary },
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
							</Animated.View>
						) : (
							<Animated.View
								key="card-skeleton"
								exiting={FadeOut.duration(220)}
							>
								<LoadingSkeleton
									t={t}
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
							<Text style={{ color: t.text.secondary }}>
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
	// A section's breathing room inside the sheet — replaces per-card margins.
	sheetSection: {
		paddingHorizontal: 22,
		paddingVertical: 18,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginHorizontal: 22,
	},
	// Marketplace link-out — a slim tappable row between sheet sections.
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

	// Image — floats on the water with a deep drop shadow (no clipping wrapper,
	// which would cut the shadow off).
	imageContainer: {
		alignItems: "center",
		marginBottom: 20,
		alignSelf: "center",
		width: IMAGE_WIDTH,
		shadowColor: "#000A19",
		shadowOpacity: 0.55,
		shadowRadius: 40,
		shadowOffset: { width: 0, height: 18 },
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
		...typeScale.overline,
		marginBottom: 8,
	},
	heroPrice: {
		fontSize: 38,
		fontWeight: "800",
		letterSpacing: -1,
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
		gap: 4,
	},
	periodPill: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 999,
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
