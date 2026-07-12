import { useEffect, useRef, type ComponentProps } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import Animated, {
	Easing,
	FadeOut,
	LinearTransition,
	ReduceMotion,
	ZoomIn,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";

import { darkTheme } from "@/constants/theme";
import {
	scanPriceLabel,
	useScanPrices,
} from "@/components/scanner/useScanPrices";
import type { ScannedCard } from "@/context/ScanSessionContext";

// Live tray under the reticle: each capture lands here at a glanceable size
// with its ballpark price. The X removes it from the session only — nothing
// has been stored yet at this point.

const t = darkTheme; // the scanner is dark in both modes

const CARD_ASPECT = 2.5 / 3.5;
export const TRAY_PADDING_H = 20;
// Headroom for the X badge's overhang — the ScrollView clips to bounds.
// Exported so the scanner can aim the capture flight at the thumb centre.
export const TRAY_ROW_TOP_PAD = 7;
/** Price line + its gap — constant across sizes (only the font scales). */
const PRICE_BLOCK_H = 23;
const MAX_ITEM_W = 100;
const MIN_ITEM_W = 48;

export type TrayMetrics = {
	itemW: number;
	thumbH: number;
	priceBlockH: number;
};

/**
 * Size the tray to the vertical band a given screen leaves between the
 * viewfinder and the toolbar: full 100pt cards where they fit (6.1"+),
 * proportionally smaller columns on minis/SEs — never overlapping the
 * reticle. The scanner also uses these numbers to aim the capture flight.
 */
export function trayMetrics(band: number): TrayMetrics {
	const maxThumbH = band - TRAY_ROW_TOP_PAD - PRICE_BLOCK_H;
	const itemW = Math.max(
		MIN_ITEM_W,
		Math.min(MAX_ITEM_W, Math.floor(maxThumbH * CARD_ASPECT)),
	);
	return { itemW, thumbH: itemW / CARD_ASPECT, priceBlockH: PRICE_BLOCK_H };
}

// New items hold their entrance until the capture flight (FLY_MS 520 in the
// scanner) is about to land, so the card appears to settle INTO its slot.
const ENTER_DELAY_MS = 380;

export default function ScanTray({
	scans,
	onPress,
	onRemove,
	interactive,
	metrics,
	style,
}: {
	scans: ScannedCard[];
	onPress: (card: ScannedCard) => void;
	onRemove: (id: string) => void;
	/** False while faded out (empty session / binder mode) so it can't eat taps. */
	interactive: boolean;
	/** From trayMetrics() — the screen-fitted item size. */
	metrics: TrayMetrics;
	style?: ComponentProps<typeof Animated.View>["style"];
}) {
	const prices = useScanPrices(scans);
	const scrollRef = useRef<ScrollView>(null);
	const priceFontSize =
		metrics.itemW >= 80 ? 16 : metrics.itemW >= 64 ? 14 : 12;

	// Captures prepend, so the newest card is leftmost — snap it into view even
	// if the user had scrolled off to the right.
	const newestId = scans[0]?.id;
	useEffect(() => {
		if (newestId) scrollRef.current?.scrollTo({ x: 0, animated: true });
	}, [newestId]);

	return (
		<Animated.View
			style={style}
			pointerEvents={interactive ? "box-none" : "none"}
		>
			<ScrollView
				ref={scrollRef}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.row}
			>
				{scans.map((scan) => {
					return (
						<Animated.View
							key={scan.id}
							entering={ZoomIn.delay(ENTER_DELAY_MS)
								.duration(220)
								.easing(Easing.out(Easing.cubic))
								.reduceMotion(ReduceMotion.System)}
							exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
							layout={LinearTransition.duration(220)}
							style={{ width: metrics.itemW }}
						>
							{/* No container clip — the artwork's printed corners do the
							    rounding, same as the binder review tray. The X is a nested
							    Pressable, so it wins over the card-detail press. */}
							<Pressable
								style={{ width: metrics.itemW, height: metrics.thumbH }}
								onPress={() => onPress(scan)}
							>
								<Image
									source={{ uri: scan.image }}
									style={styles.thumb}
									contentFit="contain"
								/>
								<Pressable
									style={styles.removeBadge}
									hitSlop={8}
									onPress={() => {
										Haptics.selectionAsync();
										onRemove(scan.id);
									}}
								>
									<SymbolView
										name="xmark"
										size={11}
										tintColor="#fff"
										weight="bold"
									/>
								</Pressable>
							</Pressable>
							<Text
								style={[styles.price, { fontSize: priceFontSize }]}
								numberOfLines={1}
							>
								{scanPriceLabel(prices[scan.id])}
							</Text>
						</Animated.View>
					);
				})}
			</ScrollView>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	row: {
		paddingHorizontal: TRAY_PADDING_H,
		paddingTop: TRAY_ROW_TOP_PAD,
		gap: 10,
	},
	thumb: {
		flex: 1,
	},
	removeBadge: {
		position: "absolute",
		top: -6,
		right: -6,
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(8, 24, 38, 0.85)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.5)",
	},
	price: {
		marginTop: 4,
		fontWeight: "600",
		lineHeight: 19,
		textAlign: "center",
		fontVariant: ["tabular-nums"],
		color: t.text.primary,
		textShadowColor: "rgba(0,0,0,0.6)",
		textShadowRadius: 4,
		textShadowOffset: { width: 0, height: 1 },
	},
});
