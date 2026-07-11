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
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import {
	Button,
	Host,
	HStack,
	Image as UIImage,
	Spacer,
	Text as UIText,
} from "@expo/ui/swift-ui";
import {
	buttonStyle,
	controlSize,
	font,
	foregroundStyle,
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

import { palette } from "@/constants/theme";
import * as CardVision from "../../../modules/card-vision";
import { useScanSession } from "@/context/ScanSessionContext";
import { playCaptureFeedback } from "@/lib/captureSound";
import {
	MODEL_LOCK_MARGIN,
	MODEL_LOCK_SCORE,
	OCR_FLOOR,
	OCR_MARGIN,
	resolveOcrTieBreak,
} from "@/lib/scanMatching";
import { analyzeCardsInFrame, type CardDetection } from "@/lib/binderScan";
import BinderFrameOverlay, {
	binderHeight,
	binderRegion,
	binderY,
} from "@/components/scanner/BinderFrameOverlay";
import BinderReviewOverlay from "@/components/scanner/BinderReviewOverlay";

const cardImageUrl = (id: string) =>
	`https://images.scrydex.com/pokemon/${id}/small`;

// The captured card flies into the library button over this long; the scan loop
// stays paused for the same window so a card held in the reticle counts once.
const FLY_MS = 520;
const CAPTURE_FLASH_MS = FLY_MS + 80;

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

// Blue glow framing the screen. Drawn as concentric rounded-rect strokes from
// the edge inward — one continuous frame so the corners stay seamless — with
// opacity falling off toward the centre. Thickness is capped by the side margin
// so the glow never reaches the card rectangle.
const RING_GAP = 16; // keep the glow this far clear of the card
const RING_THICKNESS = Math.max(0, (width - cardWidth) / 2 - RING_GAP);
const RING_STEPS = 18;
const RING_STROKE = RING_THICKNESS / RING_STEPS + 1.5;
const SCREEN_CORNER = 52;
const RING_RECTS = Array.from({ length: RING_STEPS }, (_, i) => {
	const t = i / (RING_STEPS - 1); // 0 at the edge → 1 at the inner extent
	const inset = t * RING_THICKNESS;
	return {
		inset,
		rx: Math.max(2, SCREEN_CORNER - inset),
		opacity: 0.5 * Math.pow(1 - t, 1.7),
	};
});
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
// @/lib/scanMatching (shared with binder scan).

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ScanState = "preparing" | "searching" | "locking" | "found";

const RETICLE_COLOR: Record<ScanState, string> = {
	preparing: "rgba(255,255,255,0.35)",
	searching: REST,
	locking: AMBER,
	found: RIVER,
};

// The scrim/mask and the edge glow never change. Hoisted out of the screen and
// memoized so the scan-state re-renders (~2Hz while scanning) only re-commit
// the small reticle-outline Svg, not two full-screen SVG trees.
const ViewfinderScrim = memo(function ViewfinderScrim() {
	return (
		<Svg
			style={StyleSheet.absoluteFill}
			width={width}
			height={height}
			pointerEvents="none"
		>
			<Defs>
				<Mask id="holeMask">
					<Rect width={width} height={height} fill="white" />
					<Rect
						x={cardX}
						y={cardY}
						width={cardWidth}
						height={cardHeight}
						rx={CARD_CORNER_RADIUS}
						ry={CARD_CORNER_RADIUS}
						fill="black"
					/>
				</Mask>
			</Defs>
			<Rect
				width={width}
				height={height}
				fill={`rgba(0,0,0,${SCRIM_OPACITY})`}
				mask="url(#holeMask)"
			/>
		</Svg>
	);
});

const EdgeGlow = memo(function EdgeGlow() {
	return (
		<Svg
			style={StyleSheet.absoluteFill}
			width={width}
			height={height}
			pointerEvents="none"
		>
			{RING_RECTS.map((r, i) => (
				<Rect
					key={i}
					x={r.inset}
					y={r.inset}
					width={width - 2 * r.inset}
					height={height - 2 * r.inset}
					rx={r.rx}
					ry={r.rx}
					fill="none"
					stroke={RIVER}
					strokeOpacity={r.opacity}
					strokeWidth={RING_STROKE}
				/>
			))}
		</Svg>
	);
});

export default function CameraScreen() {
	const device = useCameraDevice("back");
	const { hasPermission, requestPermission } = useCameraPermission();
	const photoOutput = usePhotoOutput({ qualityPrioritization: "speed" });
	const cameraRef = useRef<CameraRef>(null);

	const { count, addScan } = useScanSession();
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
	const [binderPhoto, setBinderPhoto] = useState<string | null>(null);
	const [binderCards, setBinderCards] = useState<CardDetection[] | null>(null);
	// Bumped whenever the current binder capture is invalidated (retake, mode
	// switch, blur) so an in-flight analysis can't resurrect a stale review.
	const binderGenRef = useRef(0);
	const binderBusyRef = useRef(false);
	// User-controlled scanning pause (the play/pause button). The loop idles while
	// paused but the camera preview stays live. Mirrored to a ref so the async
	// scan loop can read it without re-subscribing.
	const [scanningPaused, setScanningPaused] = useState(false);
	const scanningPausedRef = useRef(false);
	const setPaused = useCallback((v: boolean) => {
		scanningPausedRef.current = v;
		setScanningPaused(v);
	}, []);
	// The card currently flying from the reticle into the library button. `key`
	// re-arms the flight effect for each capture (even back-to-back same image).
	const [flyingCard, setFlyingCard] = useState<{
		image: string;
		key: number;
	} | null>(null);
	const fly = useSharedValue(0); // 0 = at reticle, 1 = landed in the library button

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

	// Flight path: reticle centre → the library button at the top-right of the
	// header. The card shrinks and arcs up into the button on each capture.
	const reticleCx = cardX + cardWidth / 2;
	const reticleCy = cardY + cardHeight / 2;
	const flyDX = width - 30 - reticleCx;
	const flyDY = insets.top + 24 - reticleCy;
	const flyStyle = useAnimatedStyle(() => {
		const p = fly.value;
		return {
			opacity: interpolate(p, [0, 0.75, 1], [1, 1, 0]),
			transform: [
				{ translateX: flyDX * p },
				{ translateY: flyDY * p - 26 * Math.sin(p * Math.PI) },
				{ scale: interpolate(p, [0, 1], [1, 0.1]) },
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

	useEffect(() => {
		return () => {
			if (deactivateTimer.current) clearTimeout(deactivateTimer.current);
			if (flashTimer.current) clearTimeout(flashTimer.current);
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
			// Top-12 (not 5): on EN/JA twins the correct print can sit several ranks
			// down, and the OCR number needs it present as a candidate to pull it up.
			const matches = await CardVision.identifyInRegionSmoothed(
				file.filePath,
				scanRegion,
				width / height,
				12,
				5,
			);
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
			setFlyingCard({ image, key: Date.now() });

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
				// Drop any in-flight binder capture so navigating back never
				// resurrects a stale review over a live preview.
				resetBinder();
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
			setBinderPhase("review");
		} catch {
			if (gen === binderGenRef.current) {
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
			// One representative flight into the library badge (the badge count
			// jumping by N carries the rest).
			if (picked[0]) {
				setFlyingCard({ image: cardImageUrl(picked[0].id), key: Date.now() });
			}
			resetBinder();
		},
		[addScan, resetBinder],
	);

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
						<Text style={styles.permissionButtonText}>Turn on camera</Text>
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
						<View style={styles.headerActions}>
							{CardVision.isAvailable() && (
								<Pressable
									style={styles.headerButton}
									onPress={handleToggleMode}
								>
									<SymbolView
										name="square.grid.3x3"
										size={21}
										tintColor={mode === "binder" ? "#FFFFFF" : palette.accentSoft}
										weight="medium"
									/>
								</Pressable>
							)}
							{mode === "single" && (
								<Pressable
									style={styles.headerButton}
									onPress={handleTogglePause}
								>
									<SymbolView
										name={scanningPaused ? "play" : "pause"}
										size={21}
										tintColor={scanningPaused ? "#FFFFFF" : palette.accentSoft}
										weight="medium"
									/>
								</Pressable>
							)}
							<Pressable style={styles.headerButton} onPress={goToLibrary}>
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
							</Pressable>
						</View>
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

			{mode === "single" ? (
				<>
					{/* Scrim + viewfinder reticle */}
					<ViewfinderScrim />
					{/* Outline of the hole — colors through the scan state. Its own small
					    Svg so the color change doesn't re-commit the scrim/mask tree. */}
					<Svg
						style={StyleSheet.absoluteFill}
						width={width}
						height={height}
						pointerEvents="none"
					>
						<Rect
							x={cardX}
							y={cardY}
							width={cardWidth}
							height={cardHeight}
							rx={CARD_CORNER_RADIUS}
							ry={CARD_CORNER_RADIUS}
							fill="none"
							stroke={reticle}
							strokeWidth={3}
						/>
					</Svg>

					{/* Caption below the viewfinder. */}
					<Text
						style={[styles.reticleCaption, { top: cardY + cardHeight + 14 }]}
						pointerEvents="none"
					>
						Align the card inside the frame
					</Text>
				</>
			) : (
				<>
					{/* Page-shaped guide box (no inner grid) — detection finds the
					    cards wherever they sit inside it. */}
					<BinderFrameOverlay
						color={binderPhase === "analyzing" ? AMBER : REST}
					/>
					<Text
						style={[
							styles.reticleCaption,
							{ top: binderY + binderHeight + 14 },
						]}
						pointerEvents="none"
					>
						Align your cards inside the frame
					</Text>
					{binderPhase === "analyzing" && (
						<View style={styles.binderSpinner} pointerEvents="none">
							<ActivityIndicator size="large" color="#fff" />
						</View>
					)}
				</>
			)}

			{/* Blue glow framing the screen — concentric strokes keep corners seamless. */}
			<EdgeGlow />

			{/* Bottom bar — native SwiftUI glass buttons: info (left), scan status
			    (centre), torch (right). */}
			<View
				style={[styles.toolbar, { bottom: insets.bottom + 10 }]}
				pointerEvents="box-none"
			>
				<Host style={styles.toolbarHost}>
					<HStack>
						<Button
							onPress={handleOpenTips}
							modifiers={[buttonStyle("glass"), controlSize("large")]}
						>
							<UIImage
								systemName="info.circle"
								size={20}
								color={palette.accentSoft}
							/>
						</Button>
						<Spacer />
						{/* Status pill — 8px status dot + label in a glass capsule
						    (accent while scanning, dimmed while paused). */}
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
						<Spacer />
						<Button
							onPress={handleToggleTorch}
							modifiers={[buttonStyle("glass"), controlSize("large")]}
						>
							<UIImage
								systemName={
									torchEnabled ? "flashlight.on.fill" : "flashlight.off.fill"
								}
								size={20}
								color={torchEnabled ? AMBER : palette.accentSoft}
							/>
						</Button>
					</HStack>
				</Host>
			</View>

			{/* Binder shutter — manual capture, one page per tap. */}
			{mode === "binder" && binderPhase === "idle" && (
				<Pressable
					style={[styles.shutter, { bottom: insets.bottom + 84 }]}
					onPress={handleBinderShutter}
				>
					<View style={styles.shutterInner} />
				</Pressable>
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

			{/* The captured card flies from the reticle into the library button. */}
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
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#000",
	},
	toolbar: {
		position: "absolute",
		left: 16,
		right: 16,
		alignItems: "stretch",
	},
	toolbarHost: {
		height: 56,
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
	reticleCaption: {
		position: "absolute",
		left: 0,
		right: 0,
		textAlign: "center",
		fontSize: 13,
		fontWeight: "500",
		color: "rgba(255,255,255,0.65)",
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
		position: "absolute",
		alignSelf: "center",
		width: 68,
		height: 68,
		borderRadius: 34,
		borderWidth: 4,
		borderColor: "#fff",
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
	headerActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	headerButton: {
		padding: 8,
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
