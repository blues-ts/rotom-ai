import type React from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Tap feedback driven entirely on the UI thread (reanimated shared value), so it
 * stays smooth even while the JS thread is busy mounting the next screen on
 * press. Press-in eases down quickly; release settles back with a snappy spring
 * for a responsive, slightly springy feel — no overshoot worth noticing.
 */
export default function CardPressable({
	children,
	onPress,
	disabled,
	style,
}: {
	children: React.ReactNode;
	onPress: () => void;
	disabled?: boolean;
	style?: StyleProp<ViewStyle>;
}) {
	const scale = useSharedValue(1);
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<AnimatedPressable
			style={[style, animatedStyle]}
			disabled={disabled}
			onPressIn={() => {
				scale.value = withTiming(0.95, {
					duration: 110,
					easing: Easing.out(Easing.quad),
				});
			}}
			onPressOut={() => {
				scale.value = withSpring(1, {
					damping: 15,
					stiffness: 240,
					mass: 0.5,
				});
			}}
			onPress={onPress}
		>
			{children}
		</AnimatedPressable>
	);
}
