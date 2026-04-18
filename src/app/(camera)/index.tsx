import { useAnalyzeCard } from "@/hooks/useAnalyzeCard";
import { Ionicons } from "@expo/vector-icons";
import {
	CameraView,
	useCameraPermissions,
	type AvailableLenses,
} from "expo-camera";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Dimensions,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	FadeIn,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Mask, Rect } from "react-native-svg";

const { width, height } = Dimensions.get("window");

// Card dimensions: 2.5" x 3.5" Pokemon card
const CARD_ASPECT_RATIO = 2.5 / 3.5;
const CARD_CORNER_RADIUS = 12;
const CARD_MAX_WIDTH = 325;
const CARD_WIDTH_RATIO = 0.75;
const CARD_CENTER_Y_RATIO = 0.4;
const OVERLAY_OPACITY = 0.6;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function Camera() {
	const [permission, requestPermission] = useCameraPermissions();
	const cameraRef = useRef<React.ComponentRef<typeof CameraView>>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [processingStatus, setProcessingStatus] = useState("");
	const [selectedLens, setSelectedLens] = useState<string | undefined>(undefined);
	const [zoom, setZoom] = useState(0.1);
	const [torchEnabled, setTorchEnabled] = useState(false);
	const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const analyzeCardMutation = useAnalyzeCard();

	// Pulse animation for processing indicator
	const pulseOpacity = useSharedValue(1);
	const pulseStyle = useAnimatedStyle(() => ({
		opacity: pulseOpacity.value,
	}));

	// Request camera permissions on load
	useEffect(() => {
		if (permission && !permission.granted) {
			requestPermission();
		}
	}, [permission, requestPermission]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
			if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
		};
	}, []);

	// Reset state when screen regains focus
	useFocusEffect(
		useCallback(() => {
			setIsProcessing(false);
			setProcessingStatus("");
			if (statusIntervalRef.current) {
				clearInterval(statusIntervalRef.current);
				statusIntervalRef.current = null;
			}
			if (navigationTimeoutRef.current) {
				clearTimeout(navigationTimeoutRef.current);
				navigationTimeoutRef.current = null;
			}
		}, []),
	);

	const statusMessages = ["Capturing photo...", "Analyzing card...", "Identifying card..."];

	const startStatusProgression = useCallback(() => {
		let currentIndex = 0;
		setProcessingStatus(statusMessages[0]);
		pulseOpacity.value = withRepeat(
			withSequence(
				withTiming(0.4, { duration: 600 }),
				withTiming(1, { duration: 600 }),
			),
			-1,
		);

		statusIntervalRef.current = setInterval(() => {
			if (currentIndex < statusMessages.length - 1) {
				currentIndex++;
				setProcessingStatus(statusMessages[currentIndex]);
			}
		}, 1500);
	}, []);

	const stopStatusProgression = useCallback(() => {
		if (statusIntervalRef.current) {
			clearInterval(statusIntervalRef.current);
			statusIntervalRef.current = null;
		}
		pulseOpacity.value = withTiming(1, { duration: 200 });
	}, []);

	// Lens selection
	const selectBestLens = useCallback(async () => {
		if (!cameraRef.current) return;
		try {
			const lenses = await cameraRef.current.getAvailableLensesAsync();
			if (lenses.length > 0) {
				setSelectedLens(lenses[lenses.length - 1]);
			}
		} catch {}
	}, []);

	const handleCameraReady = useCallback(() => {
		selectBestLens().catch(() => {});
	}, [selectBestLens]);

	const handleAvailableLensesChanged = useCallback(
		(_event: AvailableLenses) => { selectBestLens(); },
		[selectBestLens],
	);

	// Zoom controls
	const handleZoomIn = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		setZoom((prev) => Math.min(1, prev + 0.1));
	}, []);

	const handleZoomOut = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		setZoom((prev) => Math.max(0, prev - 0.1));
	}, []);

	const handleToggleTorch = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		setTorchEnabled((prev) => !prev);
	}, []);

	// Card overlay dimensions
	const cardWidth = Math.min(CARD_MAX_WIDTH, width * CARD_WIDTH_RATIO);
	const cardHeight = cardWidth / CARD_ASPECT_RATIO;
	const cardCenterX = width / 2;
	const cardCenterY = height * CARD_CENTER_Y_RATIO;
	const cardX = cardCenterX - cardWidth / 2;
	const cardY = cardCenterY - cardHeight / 2;

	const handleScanCard = async () => {
		if (!cameraRef.current || isProcessing) return;

		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

		try {
			setIsProcessing(true);
			startStatusProgression();

			const photo = await cameraRef.current.takePictureAsync({
				quality: 0.8,
				base64: true,
			});

			if (!photo?.base64) {
				throw new Error("Camera is not ready. Please try again.");
			}

			try {
				const result = await analyzeCardMutation.mutateAsync(photo.base64);
				stopStatusProgression();
				setProcessingStatus("Card found!");

				const cardData = result.data ?? result;
				router.push({
					pathname: `/(card)/${cardData.id}`,
					params: { name: cardData.name },
				});

				navigationTimeoutRef.current = setTimeout(() => {
					setIsProcessing(false);
					setProcessingStatus("");
					setTorchEnabled(false);
				}, 400);
			} catch (error: any) {
				const errorMessage =
					error?.response?.data?.error?.message ||
					error?.response?.data?.message ||
					error?.message ||
					"Failed to analyze the card. Please try again.";
				Alert.alert("Error", errorMessage);
				stopStatusProgression();
				setIsProcessing(false);
				setProcessingStatus("");
			}
		} catch (error: any) {
			console.error("Camera scan error:", error);
			stopStatusProgression();
			Alert.alert("Error", error?.message || "Failed to capture or process the image. Please try again.");
			setIsProcessing(false);
			setProcessingStatus("");
		}
	};

	// Permission not granted
	if (permission && !permission.granted) {
		return (
			<View style={styles.container}>
				<View style={styles.permissionContainer}>
					<Ionicons name="camera-outline" size={48} color="#999" />
					<Text style={styles.permissionText}>
						Camera permission is required to scan cards.
					</Text>
					<Pressable
						style={styles.permissionButton}
						onPress={async () => {
							const result = await requestPermission();
							if (!result.granted) {
								Alert.alert(
									"Permission Required",
									"Camera permission is required. Please enable it in your device settings.",
								);
							}
						}}
					>
						<Text style={styles.permissionButtonText}>Grant Permission</Text>
					</Pressable>
				</View>
			</View>
		);
	}

	// Loading permissions
	if (!permission) {
		return (
			<View style={styles.container}>
				<View style={styles.permissionContainer}>
					<Text style={styles.permissionText}>Loading...</Text>
				</View>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<CameraView
				ref={cameraRef}
				style={StyleSheet.absoluteFill}
				selectedLens={selectedLens}
				zoom={zoom}
				enableTorch={torchEnabled}
				onCameraReady={handleCameraReady}
				onAvailableLensesChanged={handleAvailableLensesChanged}
			/>

			{/* SVG overlay with card cutout */}
			<Svg style={StyleSheet.absoluteFill} width={width} height={height}>
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
					fill={`rgba(0,0,0,${OVERLAY_OPACITY})`}
					mask="url(#holeMask)"
				/>
			</Svg>

			{/* Controls overlay */}
			<View style={styles.content} pointerEvents="box-none">
				<View style={styles.topSpacer} />
				<View style={styles.cardArea} />

				<View style={styles.bottomSection}>
					{/* Zoom + torch controls */}
					<View style={styles.controlsRow}>
						<View style={styles.zoomControls}>
							<Pressable
								style={({ pressed }) => [
									styles.zoomButton,
									{ opacity: pressed ? 0.7 : zoom <= 0 ? 0.4 : 1 },
								]}
								onPress={handleZoomOut}
								disabled={zoom <= 0}
							>
								<Ionicons name="remove" size={22} color="#fff" />
							</Pressable>
							<View style={styles.zoomIndicator}>
								<Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
							</View>
							<Pressable
								style={({ pressed }) => [
									styles.zoomButton,
									{ opacity: pressed ? 0.7 : zoom >= 1 ? 0.4 : 1 },
								]}
								onPress={handleZoomIn}
								disabled={zoom >= 1}
							>
								<Ionicons name="add" size={22} color="#fff" />
							</Pressable>
						</View>

						<View style={styles.controlsSeparator} />

						<Pressable
							style={({ pressed }) => [
								styles.torchButton,
								torchEnabled && styles.torchButtonActive,
								{ opacity: pressed ? 0.7 : 1 },
							]}
							onPress={handleToggleTorch}
						>
							<Ionicons
								name={torchEnabled ? "flashlight" : "flashlight-outline"}
								size={20}
								color="#fff"
							/>
						</Pressable>
					</View>

					{/* Scan button */}
					<Pressable
						style={({ pressed }) => [
							styles.scanButton,
							{ width: cardWidth, opacity: pressed && !isProcessing ? 0.8 : 1 },
							isProcessing && styles.scanButtonDisabled,
						]}
						onPress={handleScanCard}
						disabled={isProcessing || analyzeCardMutation.isPending}
					>
						{isProcessing ? (
							<ActivityIndicator size="small" color="#000" style={{ marginRight: 8 }} />
						) : (
							<Ionicons name="scan" size={20} color="#000" style={{ marginRight: 8 }} />
						)}
						<Text style={styles.scanButtonText}>
							{isProcessing ? "Processing..." : "Scan Card"}
						</Text>
					</Pressable>

					{/* Status text */}
					<Animated.Text
						entering={FadeIn.duration(200)}
						style={styles.statusText}
					>
						{processingStatus || "Center the card and scan to get started"}
					</Animated.Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#000",
	},
	content: {
		...StyleSheet.absoluteFillObject,
		flexDirection: "column",
	},
	topSpacer: {
		flex: 0.1,
	},
	cardArea: {
		flex: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	bottomSection: {
		flex: 1,
		alignItems: "center",
		justifyContent: "flex-start",
	},
	controlsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 16,
		gap: 8,
	},
	controlsSeparator: {
		width: 1,
		height: 28,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
		marginHorizontal: 12,
	},
	zoomControls: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255, 255, 255, 0.08)",
		borderRadius: 28,
		paddingVertical: 4,
		paddingHorizontal: 6,
		gap: 4,
	},
	zoomButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: "rgba(255, 255, 255, 0.15)",
		alignItems: "center",
		justifyContent: "center",
	},
	zoomIndicator: {
		paddingVertical: 4,
		paddingHorizontal: 12,
		minWidth: 56,
		alignItems: "center",
	},
	zoomText: {
		color: "#fff",
		fontSize: 15,
		fontWeight: "600",
	},
	torchButton: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: "rgba(255, 255, 255, 0.15)",
		alignItems: "center",
		justifyContent: "center",
	},
	torchButtonActive: {
		backgroundColor: "rgba(255, 174, 4, 0.4)",
	},
	scanButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#fff",
		paddingVertical: 14,
		borderRadius: 14,
	},
	scanButtonDisabled: {
		opacity: 0.7,
	},
	scanButtonText: {
		color: "#000",
		fontSize: 16,
		fontWeight: "700",
	},
	statusText: {
		color: "#fff",
		textAlign: "center",
		fontSize: 14,
		marginTop: 12,
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
