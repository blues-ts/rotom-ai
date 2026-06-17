import { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import Animated, {
	cancelAnimation,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";

interface CardImageProps {
	uri: string;
	style: StyleProp<ViewStyle>;
	backgroundColor: string;
	shimmerColor: string;
	contentFit?: "contain" | "cover";
	/**
	 * Low-res image to show instantly while `uri` loads (e.g. a thumbnail that's
	 * already cached). Shown immediately and crossfaded to the full image, so
	 * the frame is never blank when the larger image isn't cached yet.
	 */
	placeholder?: string;
	onError?: () => void;
	/** Reports the image's natural pixel dimensions once loaded. */
	onImageLoad?: (dims: { width: number; height: number }) => void;
	fallback?: React.ReactNode;
}

export default function CardImage({
	uri,
	style,
	backgroundColor,
	shimmerColor,
	contentFit = "contain",
	placeholder,
	onError,
	onImageLoad,
	fallback,
}: CardImageProps) {
	const [loaded, setLoaded] = useState(false);
	const [errored, setErrored] = useState(false);
	const shimmerOpacity = useSharedValue(0.3);

	// Run the shimmer only until the image loads, then cancel it. Otherwise the
	// infinite repeat keeps ticking on the UI thread for every cell forever
	// (the shimmer stops rendering but the animation driver doesn't stop),
	// which compounds badly across a full grid of images.
	useEffect(() => {
		if (loaded || errored) {
			cancelAnimation(shimmerOpacity);
			return;
		}
		shimmerOpacity.value = withRepeat(
			withSequence(
				withTiming(0.7, { duration: 800 }),
				withTiming(0.3, { duration: 800 }),
			),
			-1,
		);
		return () => cancelAnimation(shimmerOpacity);
	}, [loaded, errored]);

	const shimmerStyle = useAnimatedStyle(() => ({
		opacity: shimmerOpacity.value,
	}));

	if (errored && fallback) {
		return (
			<View style={[style, { backgroundColor, overflow: "hidden" }]}>
				{fallback}
			</View>
		);
	}

	return (
		<View style={[style, { backgroundColor, overflow: "hidden" }]}>
			{!loaded && (
				<Animated.View
					pointerEvents="none"
					style={[
						StyleSheet.absoluteFill,
						{ backgroundColor: shimmerColor },
						shimmerStyle,
					]}
				/>
			)}
			<Image
				source={{ uri }}
				style={StyleSheet.absoluteFill}
				contentFit={contentFit}
				placeholder={placeholder ? { uri: placeholder } : undefined}
				placeholderContentFit={contentFit}
				transition={200}
				cachePolicy="memory-disk"
				// In a recycled FlatList cell, reset instead of cross-fading from the
				// previous (differently-shaped) image — otherwise sealed products,
				// which have varied aspect ratios, appear to scale/zoom into place.
				recyclingKey={uri}
				onLoad={(e) => {
					setLoaded(true);
					if (e.source?.width && e.source?.height) {
						onImageLoad?.({ width: e.source.width, height: e.source.height });
					}
				}}
				onError={() => {
					setErrored(true);
					onError?.();
				}}
			/>
		</View>
	);
}
