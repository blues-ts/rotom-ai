import { StyleSheet, View } from "react-native";
import { LineChart } from "react-native-wagmi-charts";

import { chart } from "@/constants/theme";
import { ProUnlockPill } from "@/components/ProGate";

const DAY_MS = 24 * 60 * 60 * 1000;

// Decoy series for locked chart teasers — a plausible upward drift so the
// preview looks real, while the user's actual history never renders.
// Deterministic sine mix, no randomness, so it's stable across renders.
export const DECOY_SERIES = Array.from({ length: 30 }, (_, i) => ({
	timestamp: Date.now() - (29 - i) * DAY_MS,
	value:
		1840 +
		i * 21 +
		Math.sin(i * 0.9) * 55 +
		Math.sin(i * 2.3) * 26,
}));

/**
 * Dimmed decoy line chart with the unlock pill centered over it — the
 * locked stand-in for any Pro price/value chart (no blur; see ProGate's
 * lockedView note).
 */
export function LockedChartTeaser({
	height,
	width,
	ctaText,
}: {
	height: number;
	width: number;
	ctaText?: string;
}) {
	return (
		<View>
			<View pointerEvents="none" style={[styles.chart, { height }]}>
				<LineChart.Provider data={DECOY_SERIES}>
					<LineChart height={height} width={width} yGutter={12}>
						<LineChart.Path
							color={chart.line}
							width={chart.strokeWidth}
						>
							<LineChart.Gradient color={chart.line} />
						</LineChart.Path>
					</LineChart>
				</LineChart.Provider>
			</View>
			<View
				pointerEvents="box-none"
				style={[StyleSheet.absoluteFill, styles.center]}
			>
				<ProUnlockPill ctaText={ctaText} />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	chart: {
		opacity: 0.55,
	},
	center: {
		alignItems: "center",
		justifyContent: "center",
	},
});
