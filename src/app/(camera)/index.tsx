import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Dimensions,
	Linking,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	cancelAnimation,
	Easing,
	FadeIn,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Mask, Path, Rect } from "react-native-svg";
import {
	Camera,
	useCameraDevice,
	useCameraPermission,
	usePhotoOutput,
	type CameraRef,
} from "react-native-vision-camera";

import * as CardVision from "../../../modules/card-vision";

const { width, height } = Dimensions.get("window");

// Card geometry (2.5" x 3.5")
const CARD_ASPECT_RATIO = 2.5 / 3.5;
const CARD_CORNER_RADIUS = 14;
const CARD_MAX_WIDTH = 325;
const CARD_WIDTH_RATIO = 0.78;
const CARD_CENTER_Y_RATIO = 0.42;
const SCRIM_OPACITY = 0.45;
const BRACKET_LEN = 30;

// Palette — signals layered over the live feed.
const RIVER = "#208AEF"; // searching / scan
const AMBER = "#FFAE04"; // hold steady
const GREEN = "#22C55E"; // locked
const REST = "rgba(255,255,255,0.9)";

// On-device scan tuning.
const SCAN_INDEX_BASE = process.env.EXPO_PUBLIC_API_URL
	? `${process.env.EXPO_PUBLIC_API_URL}/api/scan-index`
	: null;
const ONDEVICE_THRESHOLD = 0.8;
const ONDEVICE_MARGIN = 0.05;
const REQUIRED_HITS = 2;
const AUTO_INTERVAL_MS = 550;
const TAP_HINT_DELAY_MS = 6000;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ScanState = "preparing" | "searching" | "locking" | "found";

const RETICLE_COLOR: Record<ScanState, string> = {
	preparing: "rgba(255,255,255,0.35)",
	searching: REST,
	locking: AMBER,
	found: GREEN,
};

export default function CameraScreen() {
	const device = useCameraDevice("back");
	const { hasPermission, requestPermission } = useCameraPermission();
	const photoOutput = usePhotoOutput({ qualityPrioritization: "speed" });
	const cameraRef = useRef<CameraRef>(null);
	const reduceMotion = useReducedMotion();

	const [isActive, setIsActive] = useState(false);
	const [torchEnabled, setTorchEnabled] = useState(false);
	const [indexReady, setIndexReady] = useState(false);
	const [scanState, setScanState] = useState<ScanState>("preparing");
	const [showTapHint, setShowTapHint] = useState(false);

	const onDeviceReadyRef = useRef(false);
	const photoOutputRef = useRef(photoOutput);
	photoOutputRef.current = photoOutput;
	const loopRunningRef = useRef(false);
	const navigatedRef = useRef(false);
	const capturingRef = useRef(false);
	const deactivateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const voteRef = useRef<{ id: string | null; hits: number }>({ id: null, hits: 0 });

	// Card box (screen points) + the same box as preview fractions for cropping.
	const cardWidth = Math.min(CARD_MAX_WIDTH, width * CARD_WIDTH_RATIO);
	const cardHeight = cardWidth / CARD_ASPECT_RATIO;
	const cardX = width / 2 - cardWidth / 2;
	const cardY = height * CARD_CENTER_Y_RATIO - cardHeight / 2;
	const scanRegion = useMemo(() => {
		const pad = 0.04;
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

	// Sweep line animation (the scan signal).
	const sweep = useSharedValue(0);
	const searching = scanState === "searching";
	useEffect(() => {
		if (searching && !reduceMotion) {
			sweep.value = 0;
			sweep.value = withRepeat(
				withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.quad) }),
				-1,
				false,
			);
		} else {
			cancelAnimation(sweep);
			sweep.value = 0;
		}
	}, [searching, reduceMotion, sweep]);
	const sweepStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: sweep.value * (cardHeight - 3) }],
		opacity: 0.95 - sweep.value * 0.45,
	}));

	useEffect(() => {
		return () => {
			if (deactivateTimer.current) clearTimeout(deactivateTimer.current);
		};
	}, []);

	const markReady = useCallback(() => {
		onDeviceReadyRef.current = true;
		setIndexReady(true);
		setScanState((s) => (s === "preparing" ? "searching" : s));
	}, []);

	const goToCard = useCallback((id: string) => {
		router.push({
			pathname: "/(card)/[id]",
			params: { id, image: `https://images.scrydex.com/pokemon/${id}/small` },
		});
	}, []);

	const captureAndIdentify = useCallback(async (): Promise<
		CardVision.CardMatch[] | null
	> => {
		const po = photoOutputRef.current;
		if (!po || capturingRef.current || navigatedRef.current) return null;
		capturingRef.current = true;
		try {
			const file = await po.capturePhotoToFile(
				{ flashMode: "off", enableShutterSound: false },
				{},
			);
			if (!file?.filePath || navigatedRef.current) return null;
			return await CardVision.identifyInRegion(
				file.filePath,
				scanRegion,
				width / height,
				5,
			);
		} catch {
			return null;
		} finally {
			capturingRef.current = false;
		}
	}, [scanRegion]);

	const lockAndGo = useCallback(
		(id: string) => {
			navigatedRef.current = true;
			loopRunningRef.current = false;
			setScanState("found");
			Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
			setTimeout(() => goToCard(id), 180); // let the green snap register
		},
		[goToCard],
	);

	const evaluate = useCallback(
		(matches: CardVision.CardMatch[]) => {
			const top = matches[0];
			const margin = matches[1] ? top.score - matches[1].score : top?.score ?? 0;
			if (top && top.score >= ONDEVICE_THRESHOLD && margin >= ONDEVICE_MARGIN) {
				if (voteRef.current.id === top.id) voteRef.current.hits += 1;
				else voteRef.current = { id: top.id, hits: 1 };
				if (voteRef.current.hits >= REQUIRED_HITS) lockAndGo(top.id);
				else setScanState("locking");
			} else {
				voteRef.current = { id: null, hits: 0 };
				setScanState("searching");
			}
		},
		[lockAndGo],
	);

	const runLoop = useCallback(async () => {
		if (loopRunningRef.current) return;
		loopRunningRef.current = true;
		while (loopRunningRef.current && !navigatedRef.current) {
			if (!onDeviceReadyRef.current) {
				await delay(300);
				continue;
			}
			const matches = await captureAndIdentify();
			if (matches && !navigatedRef.current) evaluate(matches);
			await delay(AUTO_INTERVAL_MS);
		}
		loopRunningRef.current = false;
	}, [captureAndIdentify, evaluate]);

	const ensureIndexLoaded = useCallback(async () => {
		if (onDeviceReadyRef.current) return true;
		if (!CardVision.isAvailable()) return false;
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
			navigatedRef.current = false;
			voteRef.current = { id: null, hits: 0 };
			setShowTapHint(false);
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
			const hint = setTimeout(
				() => !cancelled && !navigatedRef.current && setShowTapHint(true),
				TAP_HINT_DELAY_MS,
			);
			runLoop();

			return () => {
				cancelled = true;
				clearTimeout(safety);
				clearTimeout(hint);
				// Stop scanning immediately, but keep the camera session alive briefly
				// so a back-swipe shows a live preview through the transition (not a
				// frozen frame or black). Free the camera if they linger off-screen.
				loopRunningRef.current = false;
				if (deactivateTimer.current) clearTimeout(deactivateTimer.current);
				deactivateTimer.current = setTimeout(() => setIsActive(false), 20000);
				// Clear the result UI so swiping back doesn't flash "Got it!".
				voteRef.current = { id: null, hits: 0 };
				setShowTapHint(false);
				setScanState(onDeviceReadyRef.current ? "searching" : "preparing");
			};
		}, [ensureIndexLoaded, markReady, runLoop]),
	);

	const handleToggleTorch = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		setTorchEnabled((p) => !p);
	}, []);

	// Tap anywhere = explicit single-frame capture (silent manual fallback).
	const handleTapScan = useCallback(async () => {
		if (!onDeviceReadyRef.current || navigatedRef.current) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		const matches = await captureAndIdentify();
		if (!matches || navigatedRef.current) return;
		const top = matches[0];
		const margin = matches[1] ? top.score - matches[1].score : top?.score ?? 0;
		if (top && top.score >= ONDEVICE_THRESHOLD && margin >= ONDEVICE_MARGIN) {
			lockAndGo(top.id);
		} else {
			Alert.alert(
				"No match yet",
				"Fill the frame with the card and keep it flat and well-lit.",
			);
		}
	}, [captureAndIdentify, lockAndGo]);

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

	const reticle = RETICLE_COLOR[scanState];
	const right = cardX + cardWidth;
	const bottom = cardY + cardHeight;
	const L = BRACKET_LEN;
	const bracketPath = [
		`M ${cardX} ${cardY + L} L ${cardX} ${cardY} L ${cardX + L} ${cardY}`,
		`M ${right - L} ${cardY} L ${right} ${cardY} L ${right} ${cardY + L}`,
		`M ${right} ${bottom - L} L ${right} ${bottom} L ${right - L} ${bottom}`,
		`M ${cardX + L} ${bottom} L ${cardX} ${bottom} L ${cardX} ${bottom - L}`,
	].join(" ");

	const primary =
		scanState === "preparing"
			? "Getting the scanner ready"
			: scanState === "locking"
				? "Hold steady…"
				: scanState === "found"
					? "Got it!"
					: "Point your camera at a card";
	const secondary =
		scanState === "found"
			? null
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
						<Pressable
							hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
							onPress={handleToggleTorch}
						>
							<Ionicons
								name={torchEnabled ? "flashlight" : "flashlight-outline"}
								size={22}
								color={torchEnabled ? AMBER : "#fff"}
							/>
						</Pressable>
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

			{/* Tap anywhere to capture (silent manual fallback) */}
			<Pressable
				style={StyleSheet.absoluteFill}
				onPress={handleTapScan}
				accessibilityLabel="Scan the card in the frame"
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
				<Path
					d={bracketPath}
					stroke={reticle}
					strokeWidth={3}
					strokeLinecap="round"
					strokeLinejoin="round"
					fill="none"
				/>
			</Svg>

			{/* Scan sweep line (searching only) */}
			{searching && !reduceMotion && (
				<View
					pointerEvents="none"
					style={[
						styles.sweepClip,
						{ left: cardX, top: cardY, width: cardWidth, height: cardHeight },
					]}
				>
					<Animated.View style={[styles.sweepLine, sweepStyle]} />
				</View>
			)}

			{/* Status */}
			<View style={styles.statusWrap} pointerEvents="none">
				{scanState === "found" && (
					<Animated.View entering={FadeIn.duration(160)} style={styles.foundBadge}>
						<Ionicons name="checkmark-circle" size={34} color={GREEN} />
					</Animated.View>
				)}
				{scanState === "preparing" && (
					<ActivityIndicator color="#fff" style={{ marginBottom: 12 }} />
				)}
				<Text style={styles.primary}>{primary}</Text>
				{secondary && <Text style={styles.secondary}>{secondary}</Text>}
				{showTapHint && scanState !== "found" && (
					<Animated.Text entering={FadeIn.duration(200)} style={styles.tapHint}>
						Trouble locking on? Tap anywhere to scan
					</Animated.Text>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#000",
	},
	sweepClip: {
		position: "absolute",
		overflow: "hidden",
		borderRadius: CARD_CORNER_RADIUS,
	},
	sweepLine: {
		height: 3,
		width: "100%",
		backgroundColor: RIVER,
		shadowColor: RIVER,
		shadowOpacity: 0.9,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 0 },
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
	tapHint: {
		color: "rgba(255,255,255,0.55)",
		fontSize: 13,
		textAlign: "center",
		marginTop: 18,
		textDecorationLine: "underline",
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
});
