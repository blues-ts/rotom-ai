import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { router, Stack, useFocusEffect } from "expo-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Dimensions,
	Linking,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	Easing,
	interpolate,
	runOnJS,
	useAnimatedProps,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
	type SharedValue,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import {
	Button,
	Host,
	HStack,
	Image as UIImage,
	Spacer,
	Text as UIText,
	ZStack,
} from "@expo/ui/swift-ui";
import {
	buttonStyle,
	font,
	foregroundStyle,
	frame,
	glassEffect,
	padding,
} from "@expo/ui/swift-ui/modifiers";
import {
	Camera,
	useCameraDevice,
	useCameraPermission,
	usePhotoOutput,
	type CameraRef,
} from "react-native-vision-camera";

import { darkTheme, palette } from "@/constants/theme";
import * as CardVision from "../../../modules/card-vision";
import {
	useScanSession,
	type ScannedCard,
} from "@/context/ScanSessionContext";
import { playCaptureFeedback } from "@/lib/captureSound";
import {
	filterByLanguage,
	MODEL_LOCK_MARGIN,
	MODEL_LOCK_SCORE,
	OCR_FLOOR,
	OCR_MARGIN,
	resolveOcrTieBreak,
} from "@/lib/scanMatching";
import { getScanLang, setScanLang, useScanLang } from "@/lib/scanPrefs";
import * as SecureStore from "expo-secure-store";
import { SCANNER_TOOLS_HINT_KEY } from "@/hooks/useTapHoldHint";
import TapHoldHintOverlay from "@/components/TapHoldHintOverlay";
import { analyzeCardsInFrame, type CardDetection } from "@/lib/binderScan";
import {
	BINDER_CORNER_RADIUS,
	binderHeight,
	binderRegion,
	binderWidth,
	binderY,
} from "@/components/scanner/BinderFrameOverlay";
import BinderReviewOverlay from "@/components/scanner/BinderReviewOverlay";
import HeaderIconButton, { HeaderButtonGroup } from "@/components/HeaderIconButton";
import ScanTray, {
	TRAY_PADDING_H,
	TRAY_ROW_TOP_PAD,
	trayMetrics,
} from "@/components/scanner/ScanTray";

const cardImageUrl = (id: string) =>
	`https://images.scrydex.com/pokemon/${id}/small`;

// The captured card flies into the scanned-card tray over this long; the scan
// loop stays paused for the same window so a card held in the reticle counts
// once. ScanTray's ENTER_DELAY_MS is tuned against this.
const FLY_MS = 520;
const CAPTURE_FLASH_MS = FLY_MS + 80;
// Binder confirm: each card lifts off from its detected spot this long after
// the previous one — a staggered spread rather than one blob.
const FLOCK_STAGGER_MS = 70;

const { width, height } = Dimensions.get("window");

// Card geometry (2.5" x 3.5")
const CARD_ASPECT_RATIO = 2.5 / 3.5;
const CARD_CORNER_RADIUS = 24;
// Deliberately wider than the mock's 286pt reticle: this box doubles as the
// recognition crop, and shrinking it made scans flaky (cards held at the
// accustomed distance bled outside the analyzed region).
const CARD_MAX_WIDTH = 325;
const CARD_WIDTH_RATIO = 0.78;
const CARD_CENTER_Y_RATIO = 0.42;
const SCRIM_OPACITY = 0.28;

// Card box (screen points). Derived entirely from launch-time screen constants,
// so hoisted to module scope — renders only read them.
const cardWidth = Math.min(CARD_MAX_WIDTH, width * CARD_WIDTH_RATIO);
const cardHeight = cardWidth / CARD_ASPECT_RATIO;
const cardX = width / 2 - cardWidth / 2;
const cardY = height * CARD_CENTER_Y_RATIO - cardHeight / 2;

// Palette — signals layered over the live feed.
const RIVER = palette.accent; // searching / scan (design-system accent)

// Blue glow hugging the viewfinder. Drawn as concentric rounded-rect strokes
// radiating OUTWARD from the hole with opacity falling off — each ring tracks
// the animated viewfinder rect, so the glow rides the card ↔ binder morph.
const GLOW_THICKNESS = 20;
const GLOW_STEPS = 12;
const GLOW_STROKE = GLOW_THICKNESS / GLOW_STEPS + 1.5;

// Bottom sheet — everything below the viewfinder lives on one surface, the
// same lip language as the card-detail sheet. Its top edge sits far enough
// below the box that the glow fades out before the surface starts; it rides
// the mode morph since the binder box is taller.
const SHEET_GAP = 20;
const SHEET_TOP_PAD = 10;
const TRAY_TOP_OFFSET = 10; // tray's offset inside the sheet body
const TOOLBAR_H = 56;
const sheetTopSingle = cardY + cardHeight + SHEET_GAP;
const sheetTopBinder = binderY + binderHeight + SHEET_GAP;
const AMBER = "#FFAE04"; // hold steady
const REST = "rgba(255,255,255,0.92)";

// On-device scan tuning.
const SCAN_INDEX_BASE = process.env.EXPO_PUBLIC_API_URL
	? `${process.env.EXPO_PUBLIC_API_URL}/api/scan-index`
	: null;
const ONDEVICE_THRESHOLD = 0.7; // a frame this confident casts a vote
const INSTANT_LOCK = 0.9; // single very-confident frame locks immediately
// Holos make look-alikes cluster ~0.75 with tiny margins and the #1 swaps frame
// to frame. So lock on the card that DOMINATES a window of recent frames, not
// whichever is #1 right now: needs VOTE_NEEDED of the last VOTE_WINDOW frames
// and a VOTE_LEAD edge over the runner-up. Won't lock when the cluster is tied.
const VOTE_WINDOW = 8;
const VOTE_NEEDED = 4;
const VOTE_LEAD = 2;
const AUTO_INTERVAL_MS = 550;
const REGION_PAD = 0.04;

// The card box as preview fractions (plus padding) for the recognition crop.
const scanRegion = {
	x: Math.max(0, cardX / width - (cardWidth / width) * REGION_PAD),
	y: Math.max(0, cardY / height - (cardHeight / height) * REGION_PAD),
	w: Math.min(1, (cardWidth / width) * (1 + 2 * REGION_PAD)),
	h: Math.min(1, (cardHeight / height) * (1 + 2 * REGION_PAD)),
};

// Collector-number re-rank thresholds + tie-break logic live in
// @/lib/scanMatching (shared with binder scan). The EN/JP language filter
// pref lives in @/lib/scanPrefs (toggled from the scanner-tips sheet).

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ScanState = "preparing" | "searching" | "locking" | "found";

const RETICLE_COLOR: Record<ScanState, string> = {
	preparing: "rgba(255,255,255,0.35)",
	searching: REST,
	locking: AMBER,
	found: RIVER,
};

// One viewfinder serves both modes: the hole morphs between card size and
// binder-page size when the mode toggles. Both boxes share the same center
// (width/2, height*CARD_CENTER_Y_RATIO) and the same aspect, so only the
// width and corner radius interpolate.
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const viewfinderRect = (p: number) => {
	"worklet";
	const w = interpolate(p, [0, 1], [cardWidth, binderWidth]);
	const h = w / CARD_ASPECT_RATIO;
	return {
		x: (width - w) / 2,
		y: height * CARD_CENTER_Y_RATIO - h / 2,
		w,
		h,
		r: interpolate(p, [0, 1], [CARD_CORNER_RADIUS, BINDER_CORNER_RADIUS]),
	};
};

// Rounded-rect subpath: under the full-screen rect with fillRule="evenodd" it
// punches the viewfinder hole — no <Mask> needed (react-native-svg can't
// animate mask contents).
const holePath = (x: number, y: number, w: number, h: number, r: number) => {
	"worklet";
	return (
		`M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}` +
		`a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}` +
		`v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`
	);
};

// The scrim only animates on mode toggle (props are a stable shared value, so
// the memoized tree never re-commits from React) — scan-state re-renders only
// touch the small outline Svg below, same split as before.
const AnimatedScrim = memo(function AnimatedScrim({
	progress,
}: {
	progress: SharedValue<number>;
}) {
	const animatedProps = useAnimatedProps(() => {
		const { x, y, w, h, r } = viewfinderRect(progress.value);
		return { d: `M0 0H${width}V${height}H0Z` + holePath(x, y, w, h, r) };
	});
	return (
		<Svg
			style={StyleSheet.absoluteFill}
			width={width}
			height={height}
			pointerEvents="none"
		>
			<AnimatedPath
				animatedProps={animatedProps}
				fill={`rgba(0,0,0,${SCRIM_OPACITY})`}
				fillRule="evenodd"
			/>
		</Svg>
	);
});

// Outline of the hole — colors through the scan state; its own small Svg so
// color changes don't re-commit the scrim tree.
const AnimatedOutline = memo(function AnimatedOutline({
	progress,
	color,
}: {
	progress: SharedValue<number>;
	color: string;
}) {
	const animatedProps = useAnimatedProps(() => {
		const { x, y, w, h, r } = viewfinderRect(progress.value);
		return { x, y, width: w, height: h, rx: r, ry: r };
	});
	return (
		<Svg
			style={StyleSheet.absoluteFill}
			width={width}
			height={height}
			pointerEvents="none"
		>
			<AnimatedRect
				animatedProps={animatedProps}
				fill="none"
				stroke={color}
				strokeWidth={3}
			/>
		</Svg>
	);
});

const GlowRing = memo(function GlowRing({
	progress,
	index,
}: {
	progress: SharedValue<number>;
	index: number;
}) {
	const t = index / (GLOW_STEPS - 1); // 0 at the outline → 1 at the outer extent
	const outset = 1.5 + t * GLOW_THICKNESS;
	const animatedProps = useAnimatedProps(() => {
		const { x, y, w, h, r } = viewfinderRect(progress.value);
		return {
			x: x - outset,
			y: y - outset,
			width: w + 2 * outset,
			height: h + 2 * outset,
			rx: r + outset,
			ry: r + outset,
		};
	});
	return (
		<AnimatedRect
			animatedProps={animatedProps}
			fill="none"
			stroke={RIVER}
			strokeOpacity={0.5 * Math.pow(1 - t, 1.7)}
			strokeWidth={GLOW_STROKE}
		/>
	);
});

const ReticleGlow = memo(function ReticleGlow({
	progress,
}: {
	progress: SharedValue<number>;
}) {
	return (
		<Svg
			style={StyleSheet.absoluteFill}
			width={width}
			height={height}
			pointerEvents="none"
		>
			{Array.from({ length: GLOW_STEPS }, (_, i) => (
				<GlowRing key={i} progress={progress} index={i} />
			))}
		</Svg>
	);
});

// One card of the binder-confirm flock: rests at its detected spot in the
// binder frame through its stagger delay, then arcs up into the library
// button, shrinking and twisting slightly — successive cards land at
// different angles, so the flight reads as a fanned stack.
const FlockCard = memo(function FlockCard({
	image,
	cx,
	cy,
	w,
	h,
	index,
	total,
	tx,
	ty,
}: {
	image: string;
	cx: number; // start centre (screen pts)
	cy: number;
	w: number; // start size
	h: number;
	index: number;
	total: number;
	tx: number; // library button centre
	ty: number;
}) {
	const p = useSharedValue(0);
	useEffect(() => {
		p.value = withDelay(
			index * FLOCK_STAGGER_MS,
			withTiming(1, { duration: FLY_MS, easing: Easing.in(Easing.cubic) }),
		);
	}, [p, index]);
	// Per-card final twist: fanned around the flight path, ±~12°.
	const twist = total > 1 ? (index / (total - 1) - 0.5) * 24 : 8;
	const style = useAnimatedStyle(() => {
		const v = p.value;
		return {
			opacity: interpolate(v, [0, 0.75, 1], [1, 1, 0]),
			transform: [
				{ translateX: (tx - cx) * v },
				{ translateY: (ty - cy) * v - 30 * Math.sin(v * Math.PI) },
				{ rotateZ: `${twist * v}deg` },
				{ scale: interpolate(v, [0, 1], [1, Math.max(0.08, 24 / w)]) },
			],
		};
	});
	return (
		<Animated.View
			style={[
				{
					position: "absolute",
					left: cx - w / 2,
					top: cy - h / 2,
					width: w,
					height: h,
				},
				style,
			]}
			pointerEvents="none"
		>
			<Image
				source={{ uri: image }}
				style={styles.flockCardImage}
				contentFit="contain"
			/>
		</Animated.View>
	);
});

export default function CameraScreen() {
	const device = useCameraDevice("back");
	const { hasPermission, requestPermission } = useCameraPermission();
	const photoOutput = usePhotoOutput({ qualityPrioritization: "speed" });
	const cameraRef = useRef<CameraRef>(null);

	const { count, scans, addScan, removeScan } = useScanSession();
	const insets = useSafeAreaInsets();

	const [isActive, setIsActive] = useState(false);
	const [torchEnabled, setTorchEnabled] = useState(false);
	const [indexReady, setIndexReady] = useState(false);
	const [scanState, setScanState] = useState<ScanState>("preparing");
	// Binder mode: one manual shutter → every card in the frame detected +
	// identified → review. No alignment needed — detection finds the cards
	// wherever they sit. The live auto-capture loop idles (but keeps ticking)
	// while mode !== "single".
	const [mode, setMode] = useState<"single" | "binder">("single");
	const modeRef = useRef<"single" | "binder">("single");
	const [binderPhase, setBinderPhase] = useState<
		"idle" | "analyzing" | "review"
	>("idle");
	// Mirrored to a ref so the blur cleanup can decide whether binder work is
	// in progress without re-subscribing the focus effect to phase changes.
	const binderPhaseRef = useRef<"idle" | "analyzing" | "review">("idle");
	const [binderPhoto, setBinderPhoto] = useState<string | null>(null);
	const [binderCards, setBinderCards] = useState<CardDetection[] | null>(null);
	// Bumped whenever the current binder capture is invalidated (retake, mode
	// switch, blur) so an in-flight analysis can't resurrect a stale review.
	const binderGenRef = useRef(0);
	const binderBusyRef = useRef(false);
	// Which language's prints the matcher may consider. EN/JA near-twins (same
	// art, same number) are the classic wrong-card source; scoping the candidate
	// list to the language in hand turns those ties into clean margins. Toggled
	// from the scanner-tips sheet; the loop reads getScanLang() directly.
	const scanLang = useScanLang();
	// User-controlled scanning pause (the play/pause button). The loop idles while
	// paused but the camera preview stays live. Mirrored to a ref so the async
	// scan loop can read it without re-subscribing.
	const [scanningPaused, setScanningPaused] = useState(false);
	const scanningPausedRef = useRef(false);
	const setPaused = useCallback((v: boolean) => {
		scanningPausedRef.current = v;
		setScanningPaused(v);
	}, []);
	// The card currently flying from the reticle: single captures land in the
	// scanned-card tray, binder confirms in the library button (the tray is
	// faded out in binder mode). `key` re-arms the flight effect for each
	// capture (even back-to-back same image).
	const [flyingCard, setFlyingCard] = useState<{
		image: string;
		key: number;
		target: "tray" | "library";
	} | null>(null);
	// Binder confirms fly EVERY picked card from its detected spot in the
	// frame into the library button, staggered — a fanned stack, not one
	// representative thumbnail.
	const [flyingFlock, setFlyingFlock] = useState<{
		cards: { image: string; cx: number; cy: number; w: number; h: number }[];
		key: number;
	} | null>(null);
	const flockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fly = useSharedValue(0); // 0 = at reticle, 1 = landed
	// 0 = single-card box, 1 = binder-page box; drives the viewfinder morph.
	const modeProgress = useSharedValue(0);
	// 0 = tray hidden (empty session), 1 = shown. The alignment caption yields
	// its spot to the tray — once cards are landing it's redundant.
	const trayProgress = useSharedValue(0);
	const singleCaptionStyle = useAnimatedStyle(() => ({
		opacity: (1 - modeProgress.value) * (1 - trayProgress.value),
	}));
	const trayStyle = useAnimatedStyle(() => ({
		opacity: (1 - modeProgress.value) * trayProgress.value,
	}));
	// The sheet's lip tracks the viewfinder bottom through the mode morph.
	const sheetStyle = useAnimatedStyle(() => ({
		top: interpolate(
			modeProgress.value,
			[0, 1],
			[sheetTopSingle, sheetTopBinder],
		),
	}));
	const binderCaptionStyle = useAnimatedStyle(() => ({
		opacity: modeProgress.value,
	}));
	// Shutter expands in with the viewfinder morph (and shrinks away on the way
	// back to single mode).
	const shutterStyle = useAnimatedStyle(() => ({
		opacity: modeProgress.value,
		transform: [{ scale: interpolate(modeProgress.value, [0, 1], [0.4, 1]) }],
	}));

	const onDeviceReadyRef = useRef(false);
	const photoOutputRef = useRef(photoOutput);
	photoOutputRef.current = photoOutput;
	const loopRunningRef = useRef(false);
	// True while the post-capture flash plays — the loop skips frames so a card
	// held in the reticle is captured exactly once.
	const pausedRef = useRef(false);
	// The last card we captured; held until the reticle empties, so the same card
	// can't double-count but a second physical copy (re-presented) still can.
	const lastCapturedIdRef = useRef<string | null>(null);
	const capturingRef = useRef(false);
	const deactivateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const voteRef = useRef<string[]>([]); // recent confident top-1 ids (windowed)

	// Flight paths from the reticle centre. Single captures shrink and arc DOWN
	// into the newest (leftmost) tray slot; binder confirms still arc up into
	// the library button at the top-right of the header.
	const reticleCx = cardX + cardWidth / 2;
	const reticleCy = cardY + cardHeight / 2;
	// Fit the tray to whatever vertical band THIS screen's sheet body has
	// between the lip and the toolbar — full-size cards on big phones, scaled
	// down on minis/SEs instead of overflowing.
	const toolbarBlockH = TOOLBAR_H + insets.bottom + 10; // glass host + bottom margin
	const tray = trayMetrics(
		height - sheetTopSingle - SHEET_TOP_PAD - TRAY_TOP_OFFSET - toolbarBlockH,
	);
	const trayDX = TRAY_PADDING_H + tray.itemW / 2 - reticleCx;
	const trayDY =
		sheetTopSingle +
		SHEET_TOP_PAD +
		TRAY_TOP_OFFSET +
		TRAY_ROW_TOP_PAD +
		tray.thumbH / 2 -
		reticleCy;
	const libDX = width - 30 - reticleCx;
	const libDY = insets.top + 24 - reticleCy;
	const flyToLibrary = flyingCard?.target === "library";
	const flyDX = flyToLibrary ? libDX : trayDX;
	const flyDY = flyToLibrary ? libDY : trayDY;
	const flyEndScale = flyToLibrary ? 0.1 : tray.itemW / cardWidth;
	const flyArc = flyToLibrary ? -26 : 22; // sin bulge: up into the header, out toward the tray
	const flyStyle = useAnimatedStyle(() => {
		const p = fly.value;
		return {
			opacity: interpolate(p, [0, 0.75, 1], [1, 1, 0]),
			transform: [
				{ translateX: flyDX * p },
				{ translateY: flyDY * p + flyArc * Math.sin(p * Math.PI) },
				{ scale: interpolate(p, [0, 1], [1, flyEndScale]) },
				{ rotateZ: `${interpolate(p, [0, 1], [0, 10])}deg` },
			],
		};
	});

	// Run the flight whenever a new card is captured (key changes), then clear it.
	useEffect(() => {
		if (!flyingCard) return;
		fly.value = 0;
		fly.value = withTiming(
			1,
			{ duration: FLY_MS, easing: Easing.in(Easing.cubic) },
			(finished) => {
				if (finished) runOnJS(setFlyingCard)(null);
			},
		);
	}, [flyingCard, fly]);

	// Tray fades in with the first capture and back out when the session
	// empties (X on the last card, or a clear from the library screen).
	const hasScans = count > 0;
	useEffect(() => {
		trayProgress.value = withTiming(hasScans ? 1 : 0, {
			duration: 220,
			easing: Easing.out(Easing.cubic),
		});
	}, [hasScans, trayProgress]);

	useEffect(() => {
		return () => {
			if (deactivateTimer.current) clearTimeout(deactivateTimer.current);
			if (flashTimer.current) clearTimeout(flashTimer.current);
			if (flockTimer.current) clearTimeout(flockTimer.current);
		};
	}, []);

	const markReady = useCallback(() => {
		onDeviceReadyRef.current = true;
		setIndexReady(true);
		setScanState((s) => (s === "preparing" ? "searching" : s));
	}, []);

	const goToLibrary = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		setTorchEnabled(false); // don't leave the torch burning on the library screen
		router.push("/(camera)/library");
	}, []);

	// Tray card → the full card detail screen, same push as the session
	// library grid.
	const handleOpenCard = useCallback((card: ScannedCard) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		setTorchEnabled(false); // don't leave the torch burning on the detail screen
		router.push({
			pathname: "/(card)/[id]",
			params: { id: card.id, image: card.image },
		});
	}, []);

	// Removing a card also frees it for immediate rescan — the dedupe ref would
	// otherwise block re-capturing a card the user just deleted while it's
	// still sitting in the reticle.
	const handleRemoveScan = useCallback(
		(id: string) => {
			removeScan(id);
			if (lastCapturedIdRef.current === id) lastCapturedIdRef.current = null;
		},
		[removeScan],
	);

	const captureAndIdentify = useCallback(async (): Promise<{
		matches: CardVision.CardMatch[];
		filePath: string;
	} | null> => {
		const po = photoOutputRef.current;
		if (!po || capturingRef.current || pausedRef.current) return null;
		capturingRef.current = true;
		try {
			const file = await po.capturePhotoToFile(
				{ flashMode: "off", enableShutterSound: false },
				{},
			);
			if (!file?.filePath || pausedRef.current) return null;
			// Smoothed: averages recent frames so holo glare (which moves) cancels.
			// Top-24 (not 5): the EN/JP filter below drops roughly half the
			// candidates, and the OCR re-rank still needs the near-twins that
			// survive present several ranks deep.
			const raw = await CardVision.identifyInRegionSmoothed(
				file.filePath,
				scanRegion,
				width / height,
				24,
				5,
			);
			// Only the selected language competes — the other language's near-twin
			// (same art + number) is the main wrong-card source, and removing it
			// here is what turns a tie into a lockable margin.
			const matches = filterByLanguage(raw, getScanLang());
			// Keep the file path: ambiguous frames re-read the printed number off it.
			return { matches, filePath: file.filePath };
		} catch {
			return null;
		} finally {
			capturingRef.current = false;
		}
	}, []);

	// Capture a locked card into the current scanning session, then keep scanning.
	// Unlike before, this does NOT navigate away — it plays the captured cue, adds
	// the card to the session, and flies its thumbnail into the library button.
	const captureCard = useCallback(
		(id: string, score: number) => {
			if (pausedRef.current) return; // a capture is already flying
			if (id === lastCapturedIdRef.current) return; // same card still in frame
			pausedRef.current = true;
			lastCapturedIdRef.current = id;
			voteRef.current = [];
			setScanState("found");

			const image = cardImageUrl(id);
			// New object + key launches the flight effect; the card lands in the badge.
			setFlyingCard({ image, key: Date.now(), target: "tray" });

			playCaptureFeedback();
			addScan({ id, image, score });

			if (flashTimer.current) clearTimeout(flashTimer.current);
			flashTimer.current = setTimeout(() => {
				pausedRef.current = false;
				setScanState(onDeviceReadyRef.current ? "searching" : "preparing");
			}, CAPTURE_FLASH_MS);
		},
		[addScan],
	);

	const evaluate = useCallback(
		async (matches: CardVision.CardMatch[], filePath: string) => {
			const top = matches[0];
			const margin = matches[1] ? top.score - matches[1].score : top?.score ?? 0;
			if (__DEV__) {
				console.log(
					"[scan]",
					matches
						.slice(0, 3)
						.map((m) => `${m.id} ${m.score.toFixed(3)}`)
						.join("  |  "),
					`margin=${margin.toFixed(3)}`,
				);
			}
			if (pausedRef.current) return; // mid-capture flash — ignore this frame
			if (top && top.score >= INSTANT_LOCK) {
				// Very confident — capture right away.
				captureCard(top.id, top.score);
				return;
			}
			// A single fat-margin frame is decisive (see scanMatching.ts) — lock
			// without waiting out the vote window. Real scores live below
			// INSTANT_LOCK (~0.73–0.81), so without this rule every scan pays the
			// full multi-frame vote.
			if (top && top.score >= MODEL_LOCK_SCORE && margin >= MODEL_LOCK_MARGIN) {
				captureCard(top.id, top.score);
				return;
			}
			// Tight near-twin cluster (classic holo case): the artwork found the
			// right look, but can't pick between siblings. Read the printed number
			// and lock the one candidate it confirms — gated by a visual floor so
			// the number reinforces the artwork rather than overriding it.
			if (
				top &&
				top.score >= OCR_FLOOR &&
				margin < OCR_MARGIN &&
				!pausedRef.current
			) {
				try {
					const text = await CardVision.readCardText(
						filePath,
						scanRegion,
						width / height,
					);
					if (pausedRef.current) return;
					const resolved = resolveOcrTieBreak(matches, text);
					if (resolved) {
						captureCard(resolved.id, resolved.score);
						return;
					}
				} catch {}
			}
			if (top && top.score >= ONDEVICE_THRESHOLD) {
				// Record this frame's winner into the sliding window.
				const w = voteRef.current;
				w.push(top.id);
				if (w.length > VOTE_WINDOW) w.shift();
				// Tally the window; lock on a clear, dominant plurality.
				const counts = new Map<string, number>();
				for (const id of w) counts.set(id, (counts.get(id) ?? 0) + 1);
				const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
				const [bestId, c1] = ranked[0];
				const c2 = ranked[1]?.[1] ?? 0;
				if (c1 >= VOTE_NEEDED && c1 - c2 >= VOTE_LEAD)
					captureCard(bestId, top.score);
				else setScanState("locking");
			} else {
				// Low-confidence frame: age out one old vote so stale picks fade.
				if (voteRef.current.length) voteRef.current.shift();
				// Reticle has emptied — release the dedupe lock so a second copy of
				// the just-captured card can be scanned when re-presented.
				if (!voteRef.current.length) lastCapturedIdRef.current = null;
				setScanState(voteRef.current.length ? "locking" : "searching");
			}
		},
		[captureCard],
	);

	const resetBinder = useCallback(() => {
		binderGenRef.current++;
		binderPhaseRef.current = "idle";
		setBinderPhase("idle");
		setBinderPhoto(null);
		setBinderCards(null);
	}, []);

	const runLoop = useCallback(async () => {
		if (loopRunningRef.current) return;
		loopRunningRef.current = true;
		while (loopRunningRef.current) {
			if (
				!onDeviceReadyRef.current ||
				pausedRef.current ||
				scanningPausedRef.current ||
				modeRef.current !== "single"
			) {
				await delay(pausedRef.current || scanningPausedRef.current ? 120 : 300);
				continue;
			}
			const result = await captureAndIdentify();
			if (result && !pausedRef.current && !scanningPausedRef.current)
				await evaluate(result.matches, result.filePath);
			await delay(AUTO_INTERVAL_MS);
		}
		loopRunningRef.current = false;
	}, [captureAndIdentify, evaluate]);

	const ensureIndexLoaded = useCallback(async () => {
		if (onDeviceReadyRef.current) return true;
		if (!CardVision.isAvailable()) return false;
		// The launch warm-up usually has the index loaded already — use it as-is
		// instead of reloading 66 MB from disk again.
		if (CardVision.isLoaded()) {
			console.log(
				`[scan] index already loaded: rev=${CardVision.loadedRev()} count=${CardVision.loadedCount()}`,
			);
			markReady();
			return true;
		}
		try {
			const local = await CardVision.loadBestLocal();
			if (local.count > 0) {
				console.log(
					`[scan] index loaded: rev=${local.rev} count=${local.count} source=${local.source}`,
				);
				markReady();
				return true;
			}
		} catch {}
		return false;
	}, [markReady]);

	useFocusEffect(
		useCallback(() => {
			pausedRef.current = false;
			// Scanning resumes the moment the screen is focused — no tap-to-play.
			// The dedupe (lastCapturedIdRef) deliberately survives navigation: the
			// card just scanned is still blocked until it leaves the reticle, so
			// returning from reviewing a scan can't instantly re-capture it.
			setPaused(false);
			voteRef.current = [];
			if (CardVision.isAvailable()) CardVision.resetSmoothing();
			// Keep the camera live (cancel any pending deactivate from a prior blur)
			// so returning to the scanner shows a live preview, never a frozen frame.
			if (deactivateTimer.current) clearTimeout(deactivateTimer.current);
			setIsActive(true);
			setScanState(onDeviceReadyRef.current ? "searching" : "preparing");

			let cancelled = false;
			(async () => {
				await ensureIndexLoaded();
				if (cancelled || !SCAN_INDEX_BASE) return;
				// No-op while the server serves the legacy FeaturePrint index (the
				// native side refuses rev < 1000 before downloading anything); starts
				// updating automatically once it serves a trained-model index.
				try {
					const r = await CardVision.refreshFromServer(
						`${SCAN_INDEX_BASE}/version`,
						`${SCAN_INDEX_BASE}/manifest.json`,
						`${SCAN_INDEX_BASE}/index.f16`,
					);
					if (!cancelled && r.count > 0) markReady();
				} catch {}
			})();

			const safety = setTimeout(() => !cancelled && setIndexReady(true), 12000);
			runLoop();

			return () => {
				cancelled = true;
				clearTimeout(safety);
				// Stop scanning immediately, but keep the camera session alive briefly
				// so a back-swipe shows a live preview through the transition (not a
				// frozen frame or black). Free the camera if they linger off-screen.
				loopRunningRef.current = false;
				if (deactivateTimer.current) clearTimeout(deactivateTimer.current);
				deactivateTimer.current = setTimeout(() => setIsActive(false), 20000);
				// Clear the result UI so swiping back doesn't flash "Got it!".
				voteRef.current = [];
				setScanState(onDeviceReadyRef.current ? "searching" : "preparing");
				// An unconfirmed review (or an analysis in flight) is the user's
				// work — preserve it across navigation so visiting the library and
				// coming back doesn't force a re-shutter. Idle has nothing to keep.
				if (binderPhaseRef.current === "idle") resetBinder();
			};
		}, [ensureIndexLoaded, markReady, runLoop, setPaused, resetBinder]),
	);

	const handleTogglePause = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		setPaused(!scanningPausedRef.current);
	}, [setPaused]);

	const handleToggleMode = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		const next = modeRef.current === "single" ? "binder" : "single";
		modeRef.current = next;
		setMode(next);
		modeProgress.value = withTiming(next === "binder" ? 1 : 0, {
			duration: 340,
			easing: Easing.inOut(Easing.cubic),
		});
		resetBinder();
		// Entering either mode starts a fresh scan: clear the single-card voting
		// window and the frame-averaging buffer.
		voteRef.current = [];
		lastCapturedIdRef.current = null;
		if (CardVision.isAvailable()) CardVision.resetSmoothing();
	}, [resetBinder]);

	const handleBinderShutter = useCallback(async () => {
		if (!onDeviceReadyRef.current || binderBusyRef.current) return;
		const po = photoOutputRef.current;
		if (!po) return;
		binderBusyRef.current = true;
		const gen = binderGenRef.current;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		binderPhaseRef.current = "analyzing";
		setBinderPhase("analyzing");
		try {
			const file = await po.capturePhotoToFile(
				{ flashMode: "off", enableShutterSound: false },
				{},
			);
			if (!file?.filePath) throw new Error("capture failed");
			if (gen !== binderGenRef.current) return; // invalidated mid-capture
			// The review shows the native's upright frame JPEG, never the raw
			// capture — raw orientation metadata is unreliable off the sensor.
			const { photoUri, cards } = await analyzeCardsInFrame(
				file.filePath,
				binderRegion,
				width / height,
			);
			if (gen !== binderGenRef.current) return;
			setBinderPhoto(photoUri);
			setBinderCards(cards);
			if (cards.length > 0)
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
			binderPhaseRef.current = "review";
			setBinderPhase("review");
		} catch {
			if (gen === binderGenRef.current) {
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
				binderPhaseRef.current = "idle";
				setBinderPhase("idle");
				setBinderPhoto(null);
				setBinderCards(null);
			}
		} finally {
			binderBusyRef.current = false;
		}
	}, []);

	const handleBinderConfirm = useCallback(
		(picked: { id: string; score: number }[]) => {
			playCaptureFeedback();
			for (const p of picked) {
				addScan({ id: p.id, image: cardImageUrl(p.id), score: p.score });
			}
			// Fly every picked card from its detected spot into the library
			// button. Rects are normalized to the guide-box crop; a card the
			// picker matched but can't place (shouldn't happen) lifts from the
			// box centre. Duplicate ids consume detections in order.
			if (picked.length > 0) {
				const detections = binderCards ?? [];
				const used = new Set<number>();
				const cards = picked.map((p) => {
					const di = detections.findIndex(
						(d, i) => !used.has(i) && d.id === p.id,
					);
					if (di >= 0) used.add(di);
					const rect = di >= 0 ? detections[di].rect : null;
					const cx = rect
						? (binderRegion.x + (rect.x + rect.w / 2) * binderRegion.w) * width
						: width / 2;
					const cy = rect
						? (binderRegion.y + (rect.y + rect.h / 2) * binderRegion.h) *
							height
						: height * CARD_CENTER_Y_RATIO;
					// Size from the detected width but at true TCG ratio (63:88) —
					// detection rects are skewed bounding boxes, and fitting the art
					// to them cropped the card's top/bottom.
					const w = rect ? rect.w * binderRegion.w * width : 80;
					return {
						image: cardImageUrl(p.id),
						cx,
						cy,
						w,
						h: w * (88 / 63),
					};
				});
				setFlyingFlock({ cards, key: Date.now() });
				if (flockTimer.current) clearTimeout(flockTimer.current);
				flockTimer.current = setTimeout(
					() => setFlyingFlock(null),
					picked.length * FLOCK_STAGGER_MS + FLY_MS + 120,
				);
			}
			resetBinder();
		},
		[addScan, binderCards, resetBinder],
	);

	// First-run nudge: one bubble above the sheet lip introducing the toolbar's
	// EN/JP language filter and binder mode. SecureStore-persisted like the
	// tap-hold hint; waits for indexReady so it never covers a scanner that
	// isn't running yet. Tap or timeout dismisses.
	const [showScannerHint, setShowScannerHint] = useState(false);
	useEffect(() => {
		if (!indexReady || !CardVision.isAvailable()) return;
		let active = true;
		SecureStore.getItemAsync(SCANNER_TOOLS_HINT_KEY)
			.then((seen) => {
				if (active && seen !== "true") setShowScannerHint(true);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [indexReady]);

	const dismissScannerHint = useCallback(() => {
		setShowScannerHint(false);
		void SecureStore.setItemAsync(SCANNER_TOOLS_HINT_KEY, "true");
	}, []);

	const handleToggleLang = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		setScanLang(getScanLang() === "en" ? "ja" : "en");
		// A filter change restarts the scan: votes cast under the old language
		// (and the dedupe lock) no longer mean anything.
		voteRef.current = [];
		lastCapturedIdRef.current = null;
		if (CardVision.isAvailable()) CardVision.resetSmoothing();
	}, []);

	const handleToggleTorch = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		setTorchEnabled((p) => !p);
	}, []);

	const handleOpenTips = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		router.push("/(camera)/scanner-tips");
	}, []);

	// Permission gate
	if (!hasPermission) {
		return (
			<View style={styles.container}>
				<View style={styles.permissionContainer}>
					<SymbolView
						name="camera"
						size={44}
						tintColor="rgba(255,255,255,0.5)"
						weight="regular"
					/>
					<Text style={styles.permissionText}>
						Turn on the camera to scan your cards.
					</Text>
					<Pressable
						style={styles.permissionButton}
						onPress={async () => {
							const granted = await requestPermission();
							if (!granted) Linking.openSettings();
						}}
					>
						<Text style={styles.permissionButtonText}>Continue</Text>
					</Pressable>
				</View>
			</View>
		);
	}

	if (!device) {
		return (
			<View style={styles.container}>
				<View style={styles.permissionContainer}>
					<Text style={styles.permissionText}>Starting camera…</Text>
				</View>
			</View>
		);
	}

	const reticle = scanningPaused ? REST : RETICLE_COLOR[scanState];

	return (
		<View style={styles.container}>
			<Stack.Screen
				options={{
					headerRight: () => (
						<HeaderButtonGroup forceDark>
							{mode === "single" && (
								<HeaderIconButton forceDark onPress={handleTogglePause}>
									<SymbolView
										name={scanningPaused ? "play" : "pause"}
										size={21}
										tintColor={scanningPaused ? "#FFFFFF" : palette.accentSoft}
										weight="medium"
									/>
								</HeaderIconButton>
							)}
							<HeaderIconButton forceDark onPress={goToLibrary}>
								<SymbolView
									name="square.stack"
									size={21}
									tintColor={palette.accentSoft}
									weight="medium"
								/>
								{count > 0 && (
									<View style={styles.headerBadge}>
										<Text style={styles.headerBadgeText}>
											{count > 99 ? "99+" : count}
										</Text>
									</View>
								)}
							</HeaderIconButton>
						</HeaderButtonGroup>
					),
				}}
			/>
			<Camera
				ref={cameraRef}
				style={StyleSheet.absoluteFill}
				device={device}
				outputs={[photoOutput]}
				isActive={isActive}
				torchMode={torchEnabled ? "on" : "off"}
				resizeMode="cover"
				enableNativeZoomGesture
			/>

			{/* Scrim + viewfinder — one hole that morphs card ↔ binder page when
			    the mode toggles. */}
			<AnimatedScrim progress={modeProgress} />
			<AnimatedOutline
				progress={modeProgress}
				color={
					mode === "single"
						? reticle
						: binderPhase === "analyzing"
							? AMBER
							: REST
				}
			/>

			{mode === "binder" && binderPhase === "analyzing" && (
				<View style={styles.binderSpinner} pointerEvents="none">
					<ActivityIndicator size="large" color="#fff" />
				</View>
			)}

			{/* Blue glow hugging the viewfinder — rides the card ↔ binder morph. */}
			<ReticleGlow progress={modeProgress} />

			{/* Bottom sheet — everything below the viewfinder on one surface, the
			    same lip language as the card-detail sheet. The body holds the tray
			    (single) or the shutter (binder), with the alignment caption in the
			    same slot while the tray is empty. */}
			<Animated.View style={[styles.sheet, sheetStyle]}>
				<View style={styles.sheetBody} pointerEvents="box-none">
					<ScanTray
						scans={scans}
						onPress={handleOpenCard}
						onRemove={handleRemoveScan}
						interactive={mode === "single" && count > 0}
						metrics={tray}
						style={[styles.sheetTray, trayStyle]}
					/>
					<Animated.View
						style={[styles.captionOverlay, singleCaptionStyle]}
						pointerEvents="none"
					>
						<Text style={styles.sheetCaption}>
							Align the card inside the frame
						</Text>
					</Animated.View>
					<View style={styles.binderControls} pointerEvents="box-none">
						<Animated.Text
							style={[styles.sheetCaption, binderCaptionStyle]}
							pointerEvents="none"
						>
							Align your cards inside the frame
						</Animated.Text>
						{/* Binder shutter — manual capture, one page per tap. Stays
						    mounted through the mode morph so it can scale/fade both
						    ways; taps are disabled whenever it isn't fully the
						    binder's turn. */}
						{binderPhase === "idle" && (
							<Animated.View
								style={[styles.shutter, shutterStyle]}
								pointerEvents={mode === "binder" ? "auto" : "none"}
							>
								<Pressable
									style={styles.shutterPress}
									onPress={handleBinderShutter}
								>
									<View style={styles.shutterInner} />
								</Pressable>
							</Animated.View>
						)}
					</View>
				</View>

				{/* Glass toolbar — info (left), scan status (centre), torch (right),
				    pinned above the home indicator. */}
				<View style={[styles.toolbar, { marginBottom: insets.bottom + 10 }]}>
					<Host style={styles.toolbarHost}>
					<ZStack>
						{/* Status pill on its own centered layer — ZStack centers it
						    regardless of how many buttons flank it in the row above. */}
						<HStack
							spacing={7}
							modifiers={[
								padding({ horizontal: 16, vertical: 9 }),
								glassEffect({ shape: "capsule" }),
							]}
						>
							<UIImage
								systemName="circle.fill"
								size={8}
								color={
									mode === "binder"
										? binderPhase === "analyzing"
											? AMBER
											: palette.accent
										: scanningPaused
											? "rgba(255,255,255,0.45)"
											: palette.accent
								}
							/>
							<UIText
								modifiers={[
									font({ size: 15, weight: "semibold" }),
									foregroundStyle("#fff"),
								]}
							>
								{mode === "binder"
									? binderPhase === "analyzing"
										? "Analyzing..."
										: "Binder scan"
									: scanningPaused
										? "Scanner paused"
										: "Scanning..."}
							</UIText>
						</HStack>
						<HStack>
						{/* Icon buttons: plain button + glass drawn on a fixed square
						    frame with an explicit circle shape. buttonStyle("glass")
						    capsules follow the label's width, and SF Symbol glyphs vary
						    in aspect — this is the only way they render as equal circles. */}
						<Button onPress={handleOpenTips} modifiers={[buttonStyle("plain")]}>
							<UIImage
								systemName="info.circle"
								size={20}
								color={palette.accentSoft}
								modifiers={[
									frame({ width: 44, height: 44 }),
									glassEffect({
										shape: "circle",
										glass: { variant: "regular", interactive: true },
									}),
								]}
							/>
						</Button>
						{/* EN/JP filter — which language's prints the matcher considers.
						    Single mode only: the binder pipeline doesn't read it (yet). */}
						{mode === "single" && CardVision.isAvailable() && (
							<Button
								onPress={handleToggleLang}
								modifiers={[buttonStyle("plain")]}
							>
								<UIText
									modifiers={[
										font({ size: 14, weight: "bold" }),
										foregroundStyle(
											scanLang === "ja" ? "#FFFFFF" : palette.accentSoft,
										),
										frame({ width: 44, height: 44 }),
										glassEffect({
											shape: "circle",
											glass: { variant: "regular", interactive: true },
										}),
									]}
								>
									{scanLang === "ja" ? "JP" : "EN"}
								</UIText>
							</Button>
						)}
						<Spacer />
						{/* Mode toggle lives with the other scan controls — toggling
						    binder mode makes the shutter appear just above this bar, so
						    the whole flow stays in the thumb zone. */}
						{CardVision.isAvailable() && (
							<Button
								onPress={handleToggleMode}
								modifiers={[buttonStyle("plain")]}
							>
								<UIImage
									systemName="square.grid.3x3"
									size={20}
									color={mode === "binder" ? "#FFFFFF" : palette.accentSoft}
									modifiers={[
										frame({ width: 44, height: 44 }),
										glassEffect({
											shape: "circle",
											glass: { variant: "regular", interactive: true },
										}),
									]}
								/>
							</Button>
						)}
						<Button
							onPress={handleToggleTorch}
							modifiers={[buttonStyle("plain")]}
						>
							<UIImage
								systemName={
									torchEnabled ? "flashlight.on.fill" : "flashlight.off.fill"
								}
								size={20}
								color={torchEnabled ? AMBER : palette.accentSoft}
								modifiers={[
									frame({ width: 44, height: 44 }),
									glassEffect({
										shape: "circle",
										glass: { variant: "regular", interactive: true },
									}),
								]}
							/>
						</Button>
						</HStack>
					</ZStack>
					</Host>
				</View>
			</Animated.View>

			{/* First-run nudge — one native popover centered above the sheet lip,
			    introducing the toolbar tools. Anchored to an invisible STATIC
			    view in the root layout (same pattern as the card-grid hint), not
			    the toolbar's Host inside the animated sheet — that anchor raced
			    layout and pinned the popover to a stale position. */}
			{mode === "single" && showScannerHint && (
				<View style={styles.hintAnchor} pointerEvents="none">
					<TapHoldHintOverlay
						width={44}
						height={10}
						position="above"
						maxWidth={240}
						label="Switch EN/JP matching or scan a full binder page below"
						onDismiss={dismissScannerHint}
					/>
				</View>
			)}

			{/* Post-shutter review: toggle wrong matches off, then confirm.
			    binderPhoto may be "" (frame JPEG write failed) — the overlay
			    then shows tiles over the dark backdrop, still usable. */}
			{mode === "binder" && binderPhase === "review" && binderCards && (
				<BinderReviewOverlay
					photoUri={binderPhoto ?? ""}
					detections={binderCards}
					onConfirm={handleBinderConfirm}
					onRetake={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						resetBinder();
					}}
				/>
			)}

			{/* The captured card flies from the reticle into the tray (single) or
			    the library button (binder). */}
			{flyingCard && (
				<Animated.View
					key={flyingCard.key}
					style={[
						styles.flyCard,
						{ left: cardX, top: cardY, width: cardWidth, height: cardHeight },
						flyStyle,
					]}
					pointerEvents="none"
				>
					<Image
						source={{ uri: flyingCard.image }}
						style={styles.flyCardImage}
						contentFit="contain"
					/>
				</Animated.View>
			)}

			{/* Binder confirm: the whole page's cards lift off from their spots,
			    staggered, and spiral into the library button. */}
			{flyingFlock && (
				<View style={StyleSheet.absoluteFill} pointerEvents="none">
					{flyingFlock.cards.map((card, i) => (
						<FlockCard
							key={`${flyingFlock.key}-${i}`}
							{...card}
							index={i}
							total={flyingFlock.cards.length}
							tx={width - 30}
							ty={insets.top + 24}
						/>
					))}
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#000",
	},
	sheet: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderColor: darkTheme.glass.surfaceBorder,
		backgroundColor: darkTheme.glass.sheetFill,
		paddingTop: SHEET_TOP_PAD,
		// Lift the lip off the camera feed, same as the card-detail sheet.
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -8 },
		shadowOpacity: 0.22,
		shadowRadius: 18,
		elevation: 12,
	},
	sheetBody: {
		flex: 1,
	},
	sheetTray: {
		position: "absolute",
		top: TRAY_TOP_OFFSET,
		left: 0,
		right: 0,
	},
	captionOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
		// Reserve the binder column's shutter block (68pt + 14pt gap) so this
		// caption sits at the SAME height as the binder caption — the two
		// cross-fade in place during the mode morph instead of jumping.
		paddingBottom: 82,
	},
	sheetCaption: {
		textAlign: "center",
		fontSize: 13,
		fontWeight: "500",
		color: darkTheme.text.secondary,
	},
	binderControls: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
		gap: 14,
	},
	toolbar: {
		marginHorizontal: 16,
	},
	toolbarHost: {
		height: TOOLBAR_H,
	},
	// Invisible popover anchor: a small centered strip hugging the sheet lip,
	// so the hint floats mid-screen just above the sheet with its arrow
	// pointing down at the lip.
	hintAnchor: {
		position: "absolute",
		top: sheetTopSingle - 10,
		alignSelf: "center",
		width: 44,
		height: 10,
	},
	permissionContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
		gap: 16,
	},
	permissionText: {
		color: "#999",
		fontSize: 16,
		textAlign: "center",
	},
	permissionButton: {
		backgroundColor: palette.accent,
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 999,
		shadowColor: "#3B9DF2",
		shadowOpacity: 0.4,
		shadowRadius: 12,
		shadowOffset: { width: 0, height: 4 },
	},
	permissionButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "700",
	},
	binderSpinner: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	shutter: {
		width: 68,
		height: 68,
		borderRadius: 34,
		borderWidth: 4,
		borderColor: "#fff",
		alignItems: "center",
		justifyContent: "center",
	},
	shutterPress: {
		flex: 1,
		alignSelf: "stretch",
		alignItems: "center",
		justifyContent: "center",
	},
	shutterInner: {
		width: 52,
		height: 52,
		borderRadius: 26,
		backgroundColor: "#fff",
	},
	flyCard: {
		position: "absolute",
		alignItems: "center",
		justifyContent: "center",
	},
	flyCardImage: {
		width: "100%",
		height: "100%",
		borderRadius: CARD_CORNER_RADIUS,
	},
	flockCardImage: {
		width: "100%",
		height: "100%",
		borderRadius: 8,
	},
	headerBadge: {
		position: "absolute",
		top: 2,
		right: 0,
		minWidth: 17,
		height: 17,
		paddingHorizontal: 4,
		borderRadius: 8.5,
		backgroundColor: "#FF3B30",
		alignItems: "center",
		justifyContent: "center",
	},
	headerBadgeText: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "800",
	},
});
