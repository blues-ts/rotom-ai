import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
	FadeIn,
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
	Camera,
	useCameraDevice,
	useCameraPermission,
	usePhotoOutput,
	type CameraRef,
} from "react-native-vision-camera";

import * as CardVision from "../../../modules/card-vision";
import { useScanSession } from "@/context/ScanSessionContext";
import { playCaptureFeedback } from "@/lib/captureSound";

const cardImageUrl = (id: string) =>
	`https://images.scrydex.com/pokemon/${id}/small`;

// The captured card flies into the library button over this long; the scan loop
// stays paused for the same window so a card held in the reticle counts once.
const FLY_MS = 520;
const CAPTURE_FLASH_MS = FLY_MS + 80;

const { width, height } = Dimensions.get("window");

// Card geometry (2.5" x 3.5")
const CARD_ASPECT_RATIO = 2.5 / 3.5;
const CARD_CORNER_RADIUS = 14;
const CARD_MAX_WIDTH = 325;
const CARD_WIDTH_RATIO = 0.78;
const CARD_CENTER_Y_RATIO = 0.42;
const SCRIM_OPACITY = 0.45;

// Palette — signals layered over the live feed.
const RIVER = "#208AEF"; // searching / scan
const AMBER = "#FFAE04"; // hold steady
const REST = "rgba(255,255,255,0.9)";

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

// Collector-number re-rank. When the visual match is a tight near-twin cluster
// (holos), OCR the printed number and use it to break the tie — but only as a
// reinforcement of the artwork, never an override (a candidate must clear
// NUM_VISUAL_FLOOR to be eligible, so a misread number can't pull in a card the
// camera never really saw).
const OCR_FLOOR = 0.55; // below this the frame isn't a confident card — skip OCR
const OCR_MARGIN = 0.06; // only OCR when the top two are this close (ambiguous)
const OCR_TIE_BAND = 0.06; // a lettered number breaks ties within this band of #1
const PHOTO_FINISH = 0.008; // a bare number may confirm only a leader/co-leader this close to #1
const NUM_VISUAL_FLOOR = 0.55; // and never trusts a candidate below this absolute score

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Normalise a collector number for comparison: uppercase, drop a letter prefix's
// leading zeros. "TG02" → "TG2", "010" → "10", "123" → "123".
function normNum(raw: string): string | null {
  const m = String(raw).toUpperCase().match(/([A-Z]{0,4})0*(\d{1,3})/);
  return m ? m[1] + m[2] : null;
}

// The printed number is the Scrydex id's suffix after the LAST dash (set codes
// themselves contain dashes, e.g. `tcgp-A4a-4`). `swsh10tg-TG02` → "TG2".
function idNumber(id: string): string | null {
  const i = id.lastIndexOf("-");
  return i < 0 ? null : normNum(id.slice(i + 1));
}

// Collector numbers parsed from OCR lines, split by how trustworthy they are:
//  - high: a LETTERED number ("XY133", "TG02", "SWSH165"). Those numbering schemes
//    are set-bound, so the token alone identifies the card — safe to break a tie.
//  - low: a bare 1–3 digit number ("21", "6"). Shared across thousands of cards
//    (and "021/028"→"21" is no better — the set total is what's specific, and we
//    don't have it), so a bare number may only CONFIRM the artwork's own pick.
function parseNumbers(lines: string[]): { high: Set<string>; low: Set<string> } {
  const high = new Set<string>();
  const low = new Set<string>();
  const token = /([A-Z]{0,4})0*(\d{1,3})/g;
  for (const line of lines) {
    const up = line.toUpperCase();
    let m: RegExpExecArray | null;
    token.lastIndex = 0;
    while ((m = token.exec(up))) {
      const t = m[1] + m[2];
      if (m[1]) high.add(t); // letter prefix → set-specific
      else low.add(t); // bare digits → common, confirm-only
    }
  }
  return { high, low };
}

// Hiragana, katakana, or CJK present → this is the Japanese print of the card.
// EN cards have no such characters, so absence is treated as English.
function hasJapanese(lines: string[]): boolean {
  return lines.some((l) => /[぀-ヿ㐀-鿿]/.test(l));
}

type ScanState = "preparing" | "searching" | "locking" | "found";

const RETICLE_COLOR: Record<ScanState, string> = {
	preparing: "rgba(255,255,255,0.35)",
	searching: REST,
	locking: AMBER,
	found: RIVER,
};

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

	// Card box (screen points) + the same box as preview fractions for cropping.
	const cardWidth = Math.min(CARD_MAX_WIDTH, width * CARD_WIDTH_RATIO);
	const cardHeight = cardWidth / CARD_ASPECT_RATIO;
	const cardX = width / 2 - cardWidth / 2;
	const cardY = height * CARD_CENTER_Y_RATIO - cardHeight / 2;
	const scanRegion = useMemo(() => {
		const pad = REGION_PAD;
		const nx = cardX / width;
		const ny = cardY / height;
		const nw = cardWidth / width;
		const nh = cardHeight / height;
		return {
			x: Math.max(0, nx - nw * pad),
			y: Math.max(0, ny - nh * pad),
			w: Math.min(1, nw * (1 + 2 * pad)),
			h: Math.min(1, nh * (1 + 2 * pad)),
		};
	}, [cardX, cardY, cardWidth, cardHeight]);

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
	}, [scanRegion]);

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
					const { high, low } = parseNumbers(text.bottom);
					if (high.size || low.size) {
						const ja = hasJapanese([...text.top, ...text.bottom]);
						// (1) A LETTERED number may break a tie within the top cluster —
						// candidates the artwork already scored within OCR_TIE_BAND of #1.
						const cut = Math.max(NUM_VISUAL_FLOOR, top.score - OCR_TIE_BAND);
						let hits = matches.filter((m) => {
							const n = idNumber(m.id);
							return m.score >= cut && n != null && high.has(n);
						});
						// EN/JA twin (same art + number): split on the script OCR read.
						if (hits.length > 1) {
							const byLang = hits.filter((m) => m.id.includes("_ja") === ja);
							if (byLang.length) hits = byLang;
						}
						// (2) A bare number may only CONFIRM a visual leader / co-leader
						// (a true photo-finish with #1) — never promote a lower card that
						// merely shares the very common collector number.
						const leaders = matches.filter(
							(m) => m.score >= top.score - PHOTO_FINISH,
						);
						const confirmed = leaders.filter((m) => {
							const n = idNumber(m.id);
							return n != null && (high.has(n) || low.has(n));
						});
						if (__DEV__) {
							console.log(
								"[scan] ocr",
								`hi:${[...high].join(",") || "-"} lo:${[...low].join(",") || "-"}`,
								ja ? "(ja)" : "(en)",
								"→",
								hits.length === 1
									? hits[0].id
									: confirmed.length === 1
										? `${confirmed[0].id} (confirms #1)`
										: "(no eligible match)",
							);
						}
						if (hits.length === 1) {
							captureCard(hits[0].id, hits[0].score);
							return;
						}
						if (confirmed.length === 1) {
							captureCard(confirmed[0].id, confirmed[0].score);
							return;
						}
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
		[captureCard, scanRegion],
	);

	const runLoop = useCallback(async () => {
		if (loopRunningRef.current) return;
		loopRunningRef.current = true;
		while (loopRunningRef.current) {
			if (
				!onDeviceReadyRef.current ||
				pausedRef.current ||
				scanningPausedRef.current
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
			markReady();
			return true;
		}
		try {
			const local = await CardVision.loadBestLocal();
			if (local.count > 0) {
				markReady();
				return true;
			}
		} catch {}
		return false;
	}, [markReady]);

	useFocusEffect(
		useCallback(() => {
			pausedRef.current = false;
			lastCapturedIdRef.current = null;
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
				// Auto-pause when navigating away — returning shows a paused scanner so
				// it never grabs a card while the user is mid-navigation; they tap play
				// to resume.
				setPaused(true);
				if (deactivateTimer.current) clearTimeout(deactivateTimer.current);
				deactivateTimer.current = setTimeout(() => setIsActive(false), 20000);
				// Clear the result UI so swiping back doesn't flash "Got it!".
				voteRef.current = [];
				setScanState(onDeviceReadyRef.current ? "searching" : "preparing");
			};
		}, [ensureIndexLoaded, markReady, runLoop, setPaused]),
	);

	const handleTogglePause = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		setPaused(!scanningPausedRef.current);
	}, [setPaused]);

	const handleToggleTorch = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		setTorchEnabled((p) => !p);
	}, []);

	// Permission gate
	if (!hasPermission) {
		return (
			<View style={styles.container}>
				<View style={styles.permissionContainer}>
					<Ionicons name="camera-outline" size={48} color="#999" />
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

	const primary = scanningPaused
		? "Scanning paused"
		: scanState === "preparing"
			? "Getting the scanner ready"
			: scanState === "locking"
				? "Hold steady…"
				: scanState === "found"
					? "Captured!"
					: "Point your camera at a card";
	const secondary = scanningPaused
		? "Tap play to resume"
		: scanState === "found"
			? "Added to your scans"
			: scanState === "preparing"
				? null
				: scanState === "locking"
					? "Almost there"
					: "Scans automatically — no button needed";

	return (
		<View style={styles.container}>
			<Stack.Screen
				options={{
					headerRight: () => (
						<View style={styles.headerActions}>
							<Pressable style={styles.headerButton} onPress={handleTogglePause}>
								<Ionicons
									name={scanningPaused ? "play" : "pause"}
									size={23}
									color={scanningPaused ? RIVER : "#fff"}
								/>
							</Pressable>
							<Pressable style={styles.headerButton} onPress={handleToggleTorch}>
								<Ionicons
									name={torchEnabled ? "flashlight" : "flashlight-outline"}
									size={22}
									color={torchEnabled ? AMBER : "#fff"}
								/>
							</Pressable>
							<Pressable style={styles.headerButton} onPress={goToLibrary}>
								<Ionicons name="albums" size={23} color="#fff" />
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

			{/* Scrim + viewfinder reticle */}
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
				{/* Outline of the hole — colors through the scan state */}
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

			{/* Status */}
			<View style={styles.statusWrap} pointerEvents="none">
				{scanningPaused ? (
					<Animated.View entering={FadeIn.duration(160)} style={styles.foundBadge}>
						<Ionicons name="pause-circle" size={34} color={REST} />
					</Animated.View>
				) : scanState === "found" ? (
					<Animated.View entering={FadeIn.duration(160)} style={styles.foundBadge}>
						<Ionicons name="checkmark-circle" size={34} color={RIVER} />
					</Animated.View>
				) : scanState === "preparing" ? (
					<ActivityIndicator color="#fff" style={{ marginBottom: 12 }} />
				) : null}
				<Text style={styles.primary}>{primary}</Text>
				{secondary && <Text style={styles.secondary}>{secondary}</Text>}
			</View>

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
	statusWrap: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: height * 0.12,
		alignItems: "center",
		paddingHorizontal: 32,
	},
	foundBadge: {
		marginBottom: 10,
	},
	primary: {
		color: "#fff",
		fontSize: 19,
		fontWeight: "700",
		textAlign: "center",
		letterSpacing: 0.2,
	},
	secondary: {
		color: "rgba(255,255,255,0.65)",
		fontSize: 13.5,
		textAlign: "center",
		marginTop: 6,
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
		backgroundColor: "#fff",
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 10,
	},
	permissionButtonText: {
		color: "#000",
		fontSize: 16,
		fontWeight: "600",
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
