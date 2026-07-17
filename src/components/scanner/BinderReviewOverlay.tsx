import { useEffect, useMemo, useRef, useState } from "react";
import {
	Dimensions,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	Easing,
	FadeIn,
	ReduceMotion,
	SlideInDown,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
	ZoomIn,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
	darkTheme,
	radius,
	typeScale,
	useRiverDarkTheme,
	withAlpha,
} from "@/constants/theme";
import {
	scanPriceLabel,
	useScanPrices,
} from "@/components/scanner/useScanPrices";
import type { CardDetection } from "@/lib/binderScan";
import { binderRegion } from "@/components/scanner/BinderFrameOverlay";

// Post-shutter review, "map + list": the photo is the hero — detected cards
// get numbered outline marks only (never covered), while the catalog matches
// live in a tray below at a readable size. The photo settles from the capture
// position into an inset card, the marks tick on one by one, the tray slides
// up. Tap a mark or its tray card to include/exclude; numbers tie the two.

const AMBER = "#FFAE04"; // the scanner's "needs a look" signal
const t = darkTheme; // the scanner is dark in both modes

const { width, height } = Dimensions.get("window");

// Where the guide box sat during capture (screen points) — the photo animates
// FROM here into its settled spot.
const regionLeft = binderRegion.x * width;
const regionTop = binderRegion.y * height;
const regionW = binderRegion.w * width;
const regionH = binderRegion.h * height;

const TRAY_CARD_W = 104;
const TRAY_GAP = 10;

const cardImageUrl = (id: string) =>
	`https://images.scrydex.com/pokemon/${id}/small`;

const ENTRANCE = { duration: 380, easing: Easing.inOut(Easing.cubic) };
const MARKS_START_MS = 260; // marks begin after the photo has mostly settled
const MARK_STAGGER_MS = 70;

type Picked = { id: string; score: number };

export default function BinderReviewOverlay({
	photoUri,
	detections,
	onConfirm,
	onRetake,
}: {
	photoUri: string;
	detections: CardDetection[];
	onConfirm: (picked: Picked[]) => void;
	onRetake: () => void;
}) {
	const insets = useSafeAreaInsets();
	const trayRef = useRef<ScrollView>(null);
	// Always-dark surface, but the accent follows the Appearance colorway.
	const td = useRiverDarkTheme();

	// Low-confidence guesses start excluded — the user confirms them after
	// eyeballing the (fully visible) card in the photo.
	const [excluded, setExcluded] = useState<Set<number>>(
		() => new Set(detections.flatMap((d, i) => (d.confident ? [] : [i]))),
	);

	// Ballpark prices under each match; thumbnails render immediately from the
	// image CDN while these resolve.
	const prices = useScanPrices(detections);

	// ── Photo geometry: settle from the capture position into an inset card
	// above the tray. Same aspect, so one uniform scale + translate.
	const trayH = 306 + insets.bottom;
	const photo = useMemo(() => {
		const availTop = insets.top + 12;
		const availH = height - trayH - 12 - availTop;
		const availW = width - 24;
		const scale = Math.min(availW / regionW, availH / regionH, 1);
		const w = regionW * scale;
		const h = regionH * scale;
		return {
			left: (width - w) / 2,
			top: availTop + (availH - h) / 2,
			width: w,
			height: h,
		};
	}, [insets.top, trayH]);

	const settle = useSharedValue(0);
	useEffect(() => {
		settle.value = withTiming(1, {
			...ENTRANCE,
			reduceMotion: ReduceMotion.System,
		});
	}, [settle]);

	// Leaving slides the whole review (photo + tray, as one sheet) down off the
	// screen, revealing the live camera underneath — THEN the overlay unmounts.
	// Without this, retake is a hard cut.
	const leave = useSharedValue(0);
	const leavingRef = useRef(false);
	const depart = (after: () => void) => {
		if (leavingRef.current) return;
		leavingRef.current = true;
		leave.value = withTiming(1, {
			duration: 320,
			easing: Easing.in(Easing.cubic),
			reduceMotion: ReduceMotion.System,
		});
		setTimeout(after, 330);
	};

	const rootStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: leave.value * height }],
	}));

	const photoStyle = useAnimatedStyle(() => {
		const p = settle.value;
		const s0 = regionW / photo.width;
		const dx = regionLeft + regionW / 2 - (photo.left + photo.width / 2);
		const dy = regionTop + regionH / 2 - (photo.top + photo.height / 2);
		return {
			transform: [
				{ translateX: (1 - p) * dx },
				{ translateY: (1 - p) * dy },
				{ scale: s0 + p * (1 - s0) },
			],
			borderRadius: 6 + p * 12,
		};
	});

	// One light tick per mark as it lands — the "found your cards" moment.
	useEffect(() => {
		const timers = detections.map((_, i) =>
			setTimeout(
				() => Haptics.selectionAsync(),
				MARKS_START_MS + i * MARK_STAGGER_MS,
			),
		);
		return () => timers.forEach(clearTimeout);
	}, [detections]);

	const included = detections.filter((_, i) => !excluded.has(i));
	const hasGuesses = detections.some((d) => !d.confident);

	const toggle = (index: number) => {
		Haptics.selectionAsync();
		setExcluded((prev) => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	};

	// Tapping a mark on the photo also brings its tray card into view.
	const revealInTray = (index: number) => {
		trayRef.current?.scrollTo({
			x: Math.max(0, index * (TRAY_CARD_W + TRAY_GAP) - width / 2 + TRAY_CARD_W),
			animated: true,
		});
	};

	return (
		<Animated.View
			style={[
				StyleSheet.absoluteFill,
				// Deep-water black from the colorway's darkest ramp stop, not flat
				// gray — near-opaque so the live feed underneath fully recedes.
				{ backgroundColor: withAlpha(td.background.colors[2], 0.97) },
				rootStyle,
			]}
		>
			{/* The analyzed frame — marks are children, so they ride the settle. */}
			<Animated.View style={[styles.photo, photo, photoStyle]}>
				{!!photoUri && (
					<Image
						source={{ uri: photoUri }}
						style={StyleSheet.absoluteFill}
						contentFit="fill"
					/>
				)}

				{detections.map((d, index) => {
					const on = !excluded.has(index);
					const accent = d.confident ? td.accent : AMBER;
					return (
						<Animated.View
							key={index}
							entering={ZoomIn.delay(MARKS_START_MS + index * MARK_STAGGER_MS)
								.duration(200)
								.easing(Easing.out(Easing.cubic))
								.reduceMotion(ReduceMotion.System)}
							style={[
								styles.mark,
								{
									left: `${d.rect.x * 100}%`,
									top: `${d.rect.y * 100}%`,
									width: `${d.rect.w * 100}%`,
									height: `${d.rect.h * 100}%`,
								},
								!d.confident && styles.markDashed,
								{
									borderColor: on ? accent : "rgba(255,255,255,0.3)",
								},
							]}
						>
							<Pressable
								style={styles.markPress}
								onPress={() => {
									toggle(index);
									revealInTray(index);
								}}
							>
								<View
									style={[
										styles.markBadge,
										on
											? { backgroundColor: accent }
											: styles.markBadgeOff,
									]}
								>
									<Text style={styles.markBadgeText}>{index + 1}</Text>
								</View>
							</Pressable>
						</Animated.View>
					);
				})}

				{detections.length === 0 && (
					<Animated.View
						entering={FadeIn.delay(200).reduceMotion(ReduceMotion.System)}
						style={styles.emptyState}
						pointerEvents="none"
					>
						<Text style={styles.emptyTitle}>No cards found</Text>
						<Text style={styles.emptyBody}>
							Get closer and fill the frame with the page
						</Text>
					</Animated.View>
				)}
			</Animated.View>

			{/* Match tray — the catalog side, at a readable size. */}
			<Animated.View
				entering={SlideInDown.delay(160)
					.duration(340)
					.easing(Easing.out(Easing.cubic))
					.reduceMotion(ReduceMotion.System)}
				style={[
					styles.tray,
					{
						height: trayH,
						paddingBottom: insets.bottom,
						backgroundColor: td.glass.sheetFill,
						borderColor: td.glass.surfaceBorder,
					},
				]}
			>
				<View style={styles.trayHeader}>
					<Text style={styles.trayTitle}>
						{detections.length === 1
							? "1 card found"
							: `${detections.length} cards found`}
					</Text>
					<Text style={styles.traySelected}>{included.length} selected</Text>
				</View>
				{hasGuesses && (
					<Text style={styles.trayHint}>
						Some matches need review — tap to confirm
					</Text>
				)}

				<ScrollView
					ref={trayRef}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.trayRow}
					style={styles.trayScroll}
				>
					{detections.map((d, index) => {
						const on = !excluded.has(index);
						const accent = d.confident ? td.accent : AMBER;
						return (
							<Pressable
								key={index}
								style={styles.trayCard}
								onPress={() => toggle(index)}
							>
								<View style={styles.thumbFrame}>
									<Image
										source={{ uri: cardImageUrl(d.id) }}
										style={[styles.thumb, !on && styles.thumbOff]}
										contentFit="contain"
									/>
									<View
										style={[
											styles.thumbState,
											on
												? { backgroundColor: accent }
												: styles.thumbStateOff,
										]}
									>
										<SymbolView
											name={on ? "checkmark" : "plus"}
											size={10}
											tintColor="#fff"
											weight="bold"
										/>
									</View>
									<View style={styles.thumbNumber}>
										<Text style={styles.thumbNumberText}>{index + 1}</Text>
									</View>
								</View>
								<Text style={styles.trayPrice} numberOfLines={1}>
									{scanPriceLabel(prices[d.id])}
								</Text>
							</Pressable>
						);
					})}
				</ScrollView>

				<View style={styles.footerButtons}>
					<Pressable
						style={[
							styles.retakeButton,
							{
								backgroundColor: td.glass.elevatedFill,
								borderColor: td.glass.elevatedBorder,
							},
						]}
						onPress={() => depart(onRetake)}
					>
						<Text style={styles.retakeText}>Retake</Text>
					</Pressable>
					<Pressable
						style={[
							styles.confirmButton,
							{ backgroundColor: td.accent, shadowColor: td.accent },
							included.length === 0 && styles.confirmDisabled,
						]}
						disabled={included.length === 0}
						onPress={() => {
							const picked = included.map((d) => ({
								id: d.id,
								score: d.score,
							}));
							depart(() => onConfirm(picked));
						}}
					>
						<Text style={styles.confirmText}>
							{included.length === 1
								? "Add 1 card"
								: `Add ${included.length} cards`}
						</Text>
					</Pressable>
				</View>
			</Animated.View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	photo: {
		position: "absolute",
		overflow: "hidden",
		backgroundColor: "rgba(210, 235, 255, 0.05)",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "rgba(210, 235, 255, 0.18)",
	},
	// A mark outlines the user's card — it never covers it.
	mark: {
		position: "absolute",
		borderWidth: 2,
		borderRadius: 10,
	},
	markDashed: {
		borderStyle: "dashed",
	},
	markPress: {
		flex: 1,
	},
	markBadge: {
		position: "absolute",
		top: -9,
		left: -9,
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	markBadgeOff: {
		backgroundColor: "rgba(8, 24, 38, 0.85)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.5)",
	},
	markBadgeText: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "700",
	},
	emptyState: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	emptyTitle: {
		color: t.text.primary,
		fontSize: 16,
		fontWeight: "700",
	},
	emptyBody: {
		color: t.text.secondary,
		fontSize: 13,
		fontWeight: "500",
	},
	// backgroundColor + borderColor applied inline (colorway sheet glass).
	tray: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 18,
	},
	trayHeader: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		paddingHorizontal: 20,
	},
	trayTitle: {
		...typeScale.overline,
		color: t.text.secondary,
	},
	traySelected: {
		...typeScale.caption,
		color: t.text.primary,
	},
	trayHint: {
		...typeScale.caption,
		color: AMBER,
		paddingHorizontal: 20,
		paddingTop: 6,
	},
	trayScroll: {
		flexGrow: 0,
		marginTop: 12,
	},
	trayRow: {
		paddingHorizontal: 20,
		gap: TRAY_GAP,
	},
	trayCard: {
		width: TRAY_CARD_W,
	},
	// No container radius/clip — like the card detail screen, the artwork's own
	// printed corners do the rounding (Scrydex images carry them).
	thumbFrame: {
		width: TRAY_CARD_W,
		height: TRAY_CARD_W / (2.5 / 3.5), // real card aspect — never squashed
	},
	thumb: {
		flex: 1,
	},
	thumbOff: {
		opacity: 0.35,
	},
	thumbState: {
		position: "absolute",
		top: 5,
		right: 5,
		width: 19,
		height: 19,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	thumbStateOff: {
		backgroundColor: "rgba(8, 24, 38, 0.7)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.55)",
	},
	thumbNumber: {
		position: "absolute",
		top: 5,
		left: 5,
		minWidth: 19,
		height: 19,
		borderRadius: 10,
		paddingHorizontal: 5,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(8, 24, 38, 0.7)",
	},
	thumbNumberText: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "700",
	},
	trayPrice: {
		color: t.text.body,
		fontSize: 15,
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
		textAlign: "center",
		marginTop: 6,
	},
	footerButtons: {
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 12,
	},
	// backgroundColor + borderColor applied inline (colorway glass).
	retakeButton: {
		flex: 1,
		paddingVertical: 14,
		borderRadius: radius.pill,
		alignItems: "center",
		borderWidth: 1,
	},
	retakeText: {
		color: t.text.primary,
		fontSize: 16,
		fontWeight: "600",
	},
	// backgroundColor + shadowColor applied inline (colorway accent).
	confirmButton: {
		flex: 2,
		paddingVertical: 14,
		borderRadius: radius.pill,
		alignItems: "center",
		...t.buttonGlow,
	},
	confirmDisabled: {
		opacity: 0.4,
	},
	confirmText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "700",
	},
});
