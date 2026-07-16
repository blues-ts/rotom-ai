import { useEffect, type ReactNode } from "react";
import { Dimensions, StyleSheet } from "react-native";
import Animated, {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

const SCREEN_WIDTH = Dimensions.get("window").width;

/**
 * Slides the Raw (condition) panel left/out and the Graded (company + grade)
 * panel in from the right when the pricing tab changes, easing the frame
 * height between the two so there's no jump. Shared by the card-detail and
 * scan configure sheets.
 */
export default function SlidingPanels({
	activeTab,
	rawPanel,
	gradedPanel,
}: {
	activeTab: string;
	rawPanel: ReactNode;
	gradedPanel: ReactNode;
}) {
	const slide = useSharedValue(activeTab === "Graded" ? 1 : 0);
	const rawHeight = useSharedValue(0);
	const gradedHeight = useSharedValue(0);

	useEffect(() => {
		slide.value = withTiming(activeTab === "Graded" ? 1 : 0, { duration: 250 });
	}, [activeTab]);

	const containerStyle = useAnimatedStyle(() => {
		const height = interpolate(
			slide.value,
			[0, 1],
			[rawHeight.value, gradedHeight.value],
		);
		return {
			height: height > 0 ? height : undefined,
			overflow: "hidden" as const,
		};
	});

	const rawStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: interpolate(slide.value, [0, 1], [0, -SCREEN_WIDTH]) },
		],
		opacity: interpolate(slide.value, [0, 0.5], [1, 0]),
	}));

	const gradedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: interpolate(slide.value, [0, 1], [SCREEN_WIDTH, 0]) },
		],
		opacity: interpolate(slide.value, [0.5, 1], [0, 1]),
	}));

	return (
		<Animated.View style={containerStyle}>
			<Animated.View
				style={[styles.panel, rawStyle]}
				onLayout={(e) => {
					rawHeight.value = e.nativeEvent.layout.height;
				}}
			>
				{rawPanel}
			</Animated.View>
			<Animated.View
				style={[styles.panel, gradedStyle]}
				onLayout={(e) => {
					gradedHeight.value = e.nativeEvent.layout.height;
				}}
			>
				{gradedPanel}
			</Animated.View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	panel: {
		position: "absolute",
		width: "100%",
	},
});
