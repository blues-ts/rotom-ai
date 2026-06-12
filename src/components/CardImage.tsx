import { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import Animated, {
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
	onError,
	onImageLoad,
	fallback,
}: CardImageProps) {
	const [loaded, setLoaded] = useState(false);
	const [errored, setErrored] = useState(false);
	const shimmerOpacity = useSharedValue(0.3);

	useEffect(() => {
		shimmerOpacity.value = withRepeat(
			withSequence(
				withTiming(0.7, { duration: 800 }),
				withTiming(0.3, { duration: 800 }),
			),
			-1,
		);
	}, []);

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
				transition={200}
				cachePolicy="memory-disk"
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
