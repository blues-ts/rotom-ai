import { useMemo, useState } from "react";
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
import { useTheme } from "@/context/ThemeContext";
import { formatCurrency } from "@/lib/format";
import { ProGate } from "@/components/ProGate";
import {
	useCollectionValueHistory,
	type ValueHistoryPeriod,
} from "@/hooks/useCollectionValueHistory";

const PERIODS: ValueHistoryPeriod[] = ["7d", "30d", "90d", "1y", "all"];

const PERIOD_LABELS: Record<ValueHistoryPeriod, string> = {
	"7d": "past 7 days",
	"30d": "past 30 days",
	"90d": "past 90 days",
	"1y": "past year",
	all: "all time",
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_WIDTH = SCREEN_WIDTH - 64; // 16 screen pad × 2 + 16 card pad × 2

export default function CollectionValueChart() {
	const { colors } = useTheme();
	const [period, setPeriod] = useState<ValueHistoryPeriod>("30d");
	const { data, isLoading } = useCollectionValueHistory(period);

	const { current, delta, deltaPct } = useMemo(() => {
		if (!data || data.length === 0) {
			return { current: 0, delta: 0, deltaPct: 0 };
		}
		const last = data[data.length - 1].value;
		const first = data[0].value;
		const d = last - first;
		const pct = first > 0 ? (d / first) * 100 : 0;
		return { current: last, delta: d, deltaPct: pct };
	}, [data]);

	const up = delta >= 0;
	const deltaColor = up ? colors.chart2 : colors.destructive;
	const deltaSign = up ? "+" : "−";
	const deltaText = `${deltaSign}${formatCurrency(Math.abs(delta))} (${Math.abs(deltaPct).toFixed(1)}%) ${PERIOD_LABELS[period]}`;

	return (
		<ProGate
			ctaText="Unlock portfolio tracking"
			style={[
				styles.container,
				{ backgroundColor: colors.card, borderColor: colors.border },
			]}
		>
			<View style={styles.header}>
				<Text style={[styles.title, { color: colors.mutedForeground }]}>
					Portfolio Value
				</Text>
			</View>

			<Text style={[styles.totalValue, { color: colors.foreground }]}>
				{formatCurrency(current)}
			</Text>

			{data && data.length > 1 && (
				<Text style={[styles.deltaText, { color: deltaColor }]}>
					{deltaText}
				</Text>
			)}

			{isLoading ? (
				<View style={styles.chartPlaceholder}>
					<ActivityIndicator size="small" color={colors.mutedForeground} />
				</View>
			) : !data || data.length === 0 ? (
				<View style={styles.chartPlaceholder}>
					<Text
						style={[styles.emptyText, { color: colors.mutedForeground }]}
					>
						Start adding cards to see your portfolio over time.
					</Text>
				</View>
			) : data.length === 1 ? (
				<View style={styles.chartPlaceholder}>
					<Text
						style={[styles.emptyText, { color: colors.mutedForeground }]}
					>
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
									{ color: colors.foreground },
								]}
							/>
							<LineChart.DatetimeText
								style={[
									styles.chartHoverDate,
									{ color: colors.foreground, opacity: 0.7 },
								]}
							/>
						</View>
						<View style={styles.chartContainer}>
							<LineChart height={180} width={CHART_WIDTH} yGutter={20}>
								<LineChart.Path color={colors.primary} width={2}>
									<LineChart.Gradient />
									<LineChart.Dot
										at={data.length - 1}
										color={colors.primary}
										size={5}
										hasPulse
										pulseBehaviour="while-inactive"
									/>
								</LineChart.Path>
								<LineChart.CursorCrosshair color={colors.foreground} />
							</LineChart>
						</View>
					</LineChart.Provider>
				</View>
			)}

			<View
				style={[
					styles.periodRow,
					{ backgroundColor: colors.muted, borderColor: colors.border },
				]}
			>
				{PERIODS.map((p) => {
					const active = p === period;
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
								setPeriod(p);
							}}
						>
							<Text
								style={[
									styles.periodText,
									{
										color: active
											? colors.primaryForeground
											: colors.foreground,
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
		</ProGate>
	);
}

const styles = StyleSheet.create({
	container: {
		borderRadius: 12,
		borderWidth: 1,
		padding: 16,
		marginBottom: 12,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	title: {
		fontSize: 13,
		fontWeight: "600",
		letterSpacing: 0.2,
	},
	totalValue: {
		fontSize: 28,
		fontWeight: "700",
		marginTop: 4,
		fontVariant: ["tabular-nums"],
	},
	deltaText: {
		fontSize: 13,
		fontWeight: "600",
		marginTop: 2,
		fontVariant: ["tabular-nums"],
	},
	chartHoverHeader: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 10,
		marginTop: 8,
		minHeight: 22,
	},
	chartHoverPrice: {
		fontSize: 16,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	chartHoverDate: {
		fontSize: 12,
		fontWeight: "500",
	},
	chartContainer: {
		height: 180,
		marginTop: 4,
	},
	chartPlaceholder: {
		height: 180,
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
		borderRadius: 8,
		borderWidth: 1,
		padding: 2,
		gap: 2,
		marginTop: 12,
		alignSelf: "center",
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
});
