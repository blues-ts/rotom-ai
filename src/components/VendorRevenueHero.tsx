import { memo, useMemo, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { LineChart } from "react-native-wagmi-charts";
import * as Haptics from "expo-haptics";
import {
	chart,
	radius,
	spacing,
	typeScale,
	useRiverTheme,
} from "@/constants/theme";
import { formatCurrency } from "@/lib/format";
import type { VendorItem } from "@/types/vendor";

type Period = "7d" | "30d" | "90d" | "1y" | "all";

const PERIODS: Period[] = ["7d", "30d", "90d", "1y", "all"];

const PERIOD_LABELS: Record<Period, string> = {
	"7d": "past 7 days",
	"30d": "past 30 days",
	"90d": "past 90 days",
	"1y": "past year",
	all: "all time",
};

const PERIOD_DAYS: Record<Period, number | null> = {
	"7d": 7,
	"30d": 30,
	"90d": 90,
	"1y": 365,
	all: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const SCREEN_WIDTH = Dimensions.get("window").width;
// Hero on the stage — pads itself (like the collections hero); the sheet
// below carries the rest of the screen.
const CHART_WIDTH = SCREEN_WIDTH - spacing.screen * 2;
const CHART_HEIGHT = 150;

export interface VendorSummaryStats {
	revenue: number;
	soldCount: number;
	soldVsMarket: number;
	listedCount: number;
	listedMarketValue: number;
	listedAskingValue: number;
}

/**
 * Revenue hero — the vendor page's twin of the collections portfolio hero:
 * overline, hero number, colored period line, cumulative-revenue chart, and
 * range pills, all resting bare on the gradient (no card chrome). The series
 * is built from sale receipts (sold_at × sold price), so it needs no
 * snapshot history table.
 */
function VendorRevenueHeroInner({
	sold,
	summary,
}: {
	sold: VendorItem[];
	summary: VendorSummaryStats;
}) {
	const t = useRiverTheme();
	const [period, setPeriod] = useState<Period>("30d");

	const data = useMemo(() => {
		const sales = sold
			.filter((s) => s.soldAt && s.soldPrice !== undefined)
			.map((s) => ({
				timestamp: new Date(s.soldAt!).getTime(),
				amount: (s.soldPrice ?? 0) * s.quantity,
			}))
			.sort((a, b) => a.timestamp - b.timestamp);
		const days = PERIOD_DAYS[period];
		const windowStart = days
			? Date.now() - days * DAY_MS
			: (sales[0]?.timestamp ?? Date.now());
		const inWindow = sales.filter((s) => s.timestamp >= windowStart);
		if (inWindow.length === 0) return [];
		let cumulative = 0;
		const points = inWindow.map((s) => ({
			timestamp: s.timestamp,
			value: (cumulative += s.amount),
		}));
		// Anchor at the window start so the line rises from zero — and a lone
		// sale still draws a line instead of a single dot.
		return [
			{ timestamp: Math.min(windowStart, points[0].timestamp - 1), value: 0 },
			...points,
		];
	}, [sold, period]);

	// Revenue earned inside the selected window (the hero number stays all-time).
	const periodRevenue = data.length > 0 ? data[data.length - 1].value : 0;

	return (
		<View style={styles.container}>
			<Text style={[styles.title, { color: t.text.secondary }]}>Revenue</Text>

			<Text style={[styles.totalValue, { color: t.text.primary }]}>
				{formatCurrency(summary.revenue)}
			</Text>

			<Text
				style={[
					styles.deltaText,
					{ color: periodRevenue > 0 ? t.gain : t.text.secondary },
				]}
			>
				{periodRevenue > 0 ? "+" : ""}
				{formatCurrency(periodRevenue)} {PERIOD_LABELS[period]}
			</Text>

			{data.length < 2 ? (
				<View style={styles.chartPlaceholder}>
					<Text style={[styles.emptyText, { color: t.text.secondary }]}>
						{summary.soldCount === 0
							? "Mark cards sold to see your revenue over time."
							: "No sales in this period."}
					</Text>
				</View>
			) : (
				<LineChart.Provider data={data}>
					<View style={styles.chartHoverHeader}>
						<LineChart.PriceText
							format={({ value }) => {
								"worklet";
								if (!value) return "";
								const n = Number(value);
								if (!isFinite(n)) return "—";
								const [intPart, decPart] = n.toFixed(2).split(".");
								const withCommas = intPart.replace(
									/\B(?=(\d{3})+(?!\d))/g,
									",",
								);
								return `$${withCommas}.${decPart}`;
							}}
							style={[styles.chartHoverPrice, { color: t.text.primary }]}
						/>
						<LineChart.DatetimeText
							options={{
								year: "numeric",
								month: "numeric",
								day: "numeric",
							}}
							style={[
								styles.chartHoverDate,
								{ color: t.text.primary, opacity: 0.7 },
							]}
						/>
					</View>
					<View style={styles.chartContainer}>
						<LineChart height={CHART_HEIGHT} width={CHART_WIDTH} yGutter={12}>
							<LineChart.Path color={t.chartLine} width={chart.strokeWidth}>
								<LineChart.Gradient color={t.chartLine} />
								<LineChart.Dot
									at={data.length - 1}
									color={t.chartLine}
									size={chart.endDotRadius}
									hasPulse
									pulseBehaviour="while-inactive"
								/>
							</LineChart.Path>
							<LineChart.CursorCrosshair color={t.text.primary} />
						</LineChart>
					</View>
				</LineChart.Provider>
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

export default memo(VendorRevenueHeroInner);

const styles = StyleSheet.create({
	// Hero on the stage — no card chrome; the gradient below is the surface.
	container: {
		paddingTop: 8,
		paddingHorizontal: spacing.screen,
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
	// wagmi's PriceText/DatetimeText render single-line TextInputs, which clip
	// to their box rather than growing to fit — flex the price, fix the date
	// (same fix as the collections hero).
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
