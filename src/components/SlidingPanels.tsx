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
 * Slides the first panel left/out and the second panel in from the right when
 * `active` flips, easing the frame height between the two so there's no jump.
 * Shared by the card-detail / scan configure sheets (Raw ↔ Graded pricing) and
 * the add-to-collection sheet (collection list ↔ vending group picker).
 */
export default function SlidingPanels({
	active,
	firstPanel,
	secondPanel,
}: {
	/** false → first panel showing; true → second panel slid in. */
	active: boolean;
	firstPanel: ReactNode;
	secondPanel: ReactNode;
}) {
	const slide = useSharedValue(active ? 1 : 0);
	const firstHeight = useSharedValue(0);
	const secondHeight = useSharedValue(0);

	useEffect(() => {
		slide.value = withTiming(active ? 1 : 0, { duration: 250 });
	}, [active]);

	const containerStyle = useAnimatedStyle(() => {
		const height = interpolate(
			slide.value,
			[0, 1],
			[firstHeight.value, secondHeight.value],
		);
		return {
			height: height > 0 ? height : undefined,
			overflow: "hidden" as const,
		};
	});

	const firstStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: interpolate(slide.value, [0, 1], [0, -SCREEN_WIDTH]) },
		],
		opacity: interpolate(slide.value, [0, 0.5], [1, 0]),
	}));

	const secondStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: interpolate(slide.value, [0, 1], [SCREEN_WIDTH, 0]) },
		],
		opacity: interpolate(slide.value, [0.5, 1], [0, 1]),
	}));

	return (
		<Animated.View style={containerStyle}>
			<Animated.View
				style={[styles.panel, firstStyle]}
				onLayout={(e) => {
					firstHeight.value = e.nativeEvent.layout.height;
				}}
			>
				{firstPanel}
			</Animated.View>
			<Animated.View
				style={[styles.panel, secondStyle]}
				onLayout={(e) => {
					secondHeight.value = e.nativeEvent.layout.height;
				}}
			>
				{secondPanel}
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
