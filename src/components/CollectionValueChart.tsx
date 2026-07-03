import { memo, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Dimensions,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { LineChart } from "react-native-wagmi-charts";
import * as Haptics from "expo-haptics";
import { chart, radius, typeScale, useRiverTheme } from "@/constants/theme";
import { formatCurrency } from "@/lib/format";
import { RedactBar } from "@/components/ProGate";
import { LockedChartTeaser } from "@/components/LockedChartTeaser";
import { useRevenueCat } from "@/context/RevenueCatContext";
import {
	useCollectionValueHistory,
	type ValueHistoryPeriod,
	type ValueHistoryPoint,
} from "@/hooks/useCollectionValueHistory";

const PERIODS: ValueHistoryPeriod[] = ["7d", "30d", "90d", "1y", "all"];

const PERIOD_LABELS: Record<ValueHistoryPeriod, string> = {
	"7d": "past 7 days",
	"30d": "past 30 days",
	"90d": "past 90 days",
	"1y": "past year",
	all: "all time",
};

const PERIOD_DAYS: Record<ValueHistoryPeriod, number | null> = {
	"7d": 7,
	"30d": 30,
	"90d": 90,
	"1y": 365,
	all: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const SCREEN_WIDTH = Dimensions.get("window").width;
// Hero on the stage — no card chrome; just the hero's horizontal padding (20 × 2).
const CHART_WIDTH = SCREEN_WIDTH - 40;
const CHART_HEIGHT = 170;
// Locked teaser is deliberately shorter — the gate should be a compact
// preview, not a full-height hero of blurred content.
const LOCKED_CHART_HEIGHT = 110;
// One point per ~2px is visually identical to the full series but keeps the
// SVG path and cursor work bounded however long the snapshot history grows.
const MAX_CHART_POINTS = Math.round(CHART_WIDTH / 2);

/**
 * Largest-Triangle-Three-Buckets downsampling — picks the point per bucket
 * that preserves the line's visual shape, so spikes and dips survive (unlike
 * striding or averaging). First and last points are always kept.
 */
function lttb(data: ValueHistoryPoint[], threshold: number): ValueHistoryPoint[] {
	const n = data.length;
	if (threshold >= n || threshold < 3) return data;

	const sampled: ValueHistoryPoint[] = [data[0]];
	const every = (n - 2) / (threshold - 2);
	let a = 0;

	for (let i = 0; i < threshold - 2; i++) {
		// Average of the *next* bucket anchors the triangle's third vertex.
		const avgStart = Math.floor((i + 1) * every) + 1;
		const avgEnd = Math.min(Math.floor((i + 2) * every) + 1, n);
		let avgX = 0;
		let avgY = 0;
		for (let j = avgStart; j < avgEnd; j++) {
			avgX += data[j].timestamp;
			avgY += data[j].value;
		}
		avgX /= avgEnd - avgStart;
		avgY /= avgEnd - avgStart;

		const rangeStart = Math.floor(i * every) + 1;
		const rangeEnd = Math.min(Math.floor((i + 1) * every) + 1, n);
		const ax = data[a].timestamp;
		const ay = data[a].value;

		let maxArea = -1;
		let maxIdx = rangeStart;
		for (let j = rangeStart; j < rangeEnd; j++) {
			const area = Math.abs(
				(ax - avgX) * (data[j].value - ay) -
					(ax - data[j].timestamp) * (avgY - ay),
			);
			if (area > maxArea) {
				maxArea = area;
				maxIdx = j;
			}
		}
		sampled.push(data[maxIdx]);
		a = maxIdx;
	}

	sampled.push(data[n - 1]);
	return sampled;
}

/**
 * Portfolio value hero — sits on the stage above the collections sheet
 * (mirrors the card detail layout, with the chart standing in for the card
 * image). Loads the full history once; period taps slice in memory.
 */
function CollectionValueChartInner() {
	const t = useRiverTheme();
	const { isPro } = useRevenueCat();
	const [period, setPeriod] = useState<ValueHistoryPeriod>("30d");
	const { data: allHistory, isLoading } = useCollectionValueHistory();

	const data = useMemo(() => {
		const all = allHistory ?? [];
		const days = PERIOD_DAYS[period];
		const sliced = days
			? all.filter((p) => p.timestamp >= Date.now() - days * DAY_MS)
			: all;
		return lttb(sliced, MAX_CHART_POINTS);
	}, [allHistory, period]);

	const { current, delta, deltaPct, hasBaseline } = useMemo(() => {
		if (data.length === 0) {
			return { current: 0, delta: 0, deltaPct: 0, hasBaseline: false };
		}
		const last = data[data.length - 1].value;
		const first = data[0].value;
		const d = last - first;
		// Growth from a $0 baseline is undefined, not 0% — flag it so the
		// label can omit the percentage instead of claiming "0.0%".
		const hasBaseline = first > 0;
		const pct = hasBaseline ? (d / first) * 100 : 0;
		return { current: last, delta: d, deltaPct: pct, hasBaseline };
	}, [data]);

	const up = delta >= 0;
	const deltaColor = up ? t.gain : t.loss;
	const deltaSign = up ? "+" : "−";
	const deltaText = `${deltaSign}${formatCurrency(Math.abs(delta))}${
		hasBaseline ? ` (${Math.abs(deltaPct).toFixed(1)}%)` : ""
	} ${PERIOD_LABELS[period]}`;

	// Locked: no blur — blurred content on the dark gradient reads as smudge.
	// Instead a deliberate teaser: crisp label, glass redaction bars where the
	// numbers would be, a dimmed decoy chart, and the unlock pill over it.
	if (!isPro) {
		return (
			<View style={styles.container}>
				<Text style={[styles.title, { color: t.text.secondary }]}>
					Portfolio Value
				</Text>
				<RedactBar style={styles.redactValue} />
				<RedactBar tone="surface" style={styles.redactDelta} />
				<View style={styles.lockedChart}>
					<LockedChartTeaser
						height={LOCKED_CHART_HEIGHT}
						width={CHART_WIDTH}
						ctaText="Unlock portfolio tracking"
					/>
				</View>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<Text style={[styles.title, { color: t.text.secondary }]}>
				Portfolio Value
			</Text>

			<Text style={[styles.totalValue, { color: t.text.primary }]}>
				{formatCurrency(current)}
			</Text>

			{data.length > 1 && (
				<Text style={[styles.deltaText, { color: deltaColor }]}>
					{deltaText}
				</Text>
			)}

			{isLoading ? (
				<View style={styles.chartPlaceholder}>
					<ActivityIndicator size="small" color={t.text.secondary} />
				</View>
			) : data.length === 0 ? (
				<View style={styles.chartPlaceholder}>
					<Text style={[styles.emptyText, { color: t.text.secondary }]}>
						Start adding cards to see your portfolio over time.
					</Text>
				</View>
			) : data.length === 1 ? (
				<View style={styles.chartPlaceholder}>
					<Text style={[styles.emptyText, { color: t.text.secondary }]}>
						Come back tomorrow to see a trend
					</Text>
				</View>
			) : (
				<View>
					<LineChart.Provider data={data}>
						<View style={styles.chartHoverHeader}>
							<LineChart.PriceText
								format={({ value }) => {
									"worklet";
									if (!value) return "";
									const n = Number(value);
									if (!isFinite(n)) return "—";
									const [intPart, decPart] = n.toFixed(2).split(".");
									const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
									return `$${withCommas}.${decPart}`;
								}}
								style={[
									styles.chartHoverPrice,
									{ color: t.text.primary },
								]}
							/>
							<LineChart.DatetimeText
								options={{
									year: "numeric",
									month: "numeric",
									day: "numeric",
									hour: "numeric",
									minute: "2-digit",
								}}
								style={[
									styles.chartHoverDate,
									{ color: t.text.primary, opacity: 0.7 },
								]}
							/>
						</View>
						<View style={styles.chartContainer}>
							<LineChart
								height={CHART_HEIGHT}
								width={CHART_WIDTH}
								yGutter={12}
							>
								<LineChart.Path
									color={chart.line}
									width={chart.strokeWidth}
								>
									<LineChart.Gradient color={chart.line} />
									<LineChart.Dot
										at={data.length - 1}
										color={chart.line}
										size={chart.endDotRadius}
										hasPulse
										pulseBehaviour="while-inactive"
									/>
								</LineChart.Path>
								<LineChart.CursorCrosshair color={t.text.primary} />
							</LineChart>
						</View>
					</LineChart.Provider>
				</View>
			)}

			{/* Range pills — selected gets the accent fill, the rest are text-only
			    (accent fill means selected, never decoration). */}
			<View style={styles.periodRow}>
				{PERIODS.map((p) => {
					const active = p === period;
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
								setPeriod(p);
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
		</View>
	);
}

// No props, and everything it renders derives from its own query + period
// state — memo shields it from list-driven re-renders on the screen above.
export default memo(CollectionValueChartInner);

const styles = StyleSheet.create({
	// Hero on the stage — no card chrome; the sheet below provides the surface.
	container: {
		paddingHorizontal: 20,
		paddingTop: 8,
	},
	title: {
		...typeScale.overline,
	},
	totalValue: {
		...typeScale.heroNumber,
		marginTop: 6,
		fontVariant: ["tabular-nums"],
	},
	deltaText: {
		fontSize: 14,
		fontWeight: "600",
		marginTop: 3,
		fontVariant: ["tabular-nums"],
	},
	chartHoverHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginTop: 8,
		minHeight: 22,
	},
	// wagmi's PriceText/DatetimeText render single-line TextInputs, which clip to
	// their box rather than growing to fit. Give the price flex so it always shows
	// the full number, and the date a fixed width (with seconds dropped) so it
	// shows in full too — never a truncating "…".
	chartHoverPrice: {
		flex: 1,
		fontSize: 16,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
		padding: 0,
	},
	chartHoverDate: {
		flexShrink: 0,
		width: 140,
		textAlign: "right",
		fontSize: 12,
		fontWeight: "500",
		padding: 0,
	},
	chartContainer: {
		height: CHART_HEIGHT,
		marginTop: 4,
	},
	// Locked teaser — glass bars stand in for the value/delta text, sized to
	// the type they replace so the layout doesn't jump on unlock.
	redactValue: {
		width: 150,
		height: 30,
		borderRadius: 8,
		marginTop: 10,
	},
	redactDelta: {
		width: 200,
		height: 12,
		borderRadius: 6,
		marginTop: 10,
	},
	lockedChart: {
		marginTop: 16,
	},
	chartPlaceholder: {
		height: CHART_HEIGHT,
		marginTop: 12,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	emptyText: {
		fontSize: 13,
		textAlign: "center",
		fontWeight: "500",
	},
	periodRow: {
		flexDirection: "row",
		gap: 4,
		marginTop: 12,
		alignSelf: "center",
	},
	periodPill: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: radius.pill,
		minWidth: 40,
		alignItems: "center",
	},
	periodText: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 0.3,
	},
});
