import type React from "react";
import {
	Pressable,
	type PressableProps,
	type StyleProp,
	type ViewStyle,
} from "react-native";
import Animated, {
	Easing,
	interpolate,
	interpolateColor,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The app's single press-feedback primitive. One progress value drives a
 * 90ms ease-down on touch and a stiff ~180ms spring back on release — fast
 * enough to feel simultaneous with the finger, crisp enough to never read
 * as mushy. Runs entirely on the UI thread (reanimated shared value), so it
 * stays smooth even while the JS thread is busy mounting the next screen.
 *
 * Conventions: cards sink to 0.98, buttons/tiles 0.95–0.97 (`pressScale`);
 * selection chips brighten without moving (`pressScale={1}` + color pair).
 * Pass `baseColor`/`pressedColor` to animate the fill on the same curve —
 * pair them with the design system's `glass.pressedFill`.
 */
export default function CardPressable({
	children,
	onPress,
	disabled,
	style,
	pressScale = 0.97,
	baseColor,
	pressedColor,
	...pressableProps
}: {
	children: React.ReactNode;
	onPress: () => void;
	disabled?: boolean;
	style?: StyleProp<ViewStyle>;
	/** How far the surface sinks while pressed; 1 disables the scale. */
	pressScale?: number;
	/** Resting fill — animates to `pressedColor` while pressed. */
	baseColor?: string;
	/** Pressed fill; both colors must be set for the fill to animate. */
	pressedColor?: string;
} & Omit<PressableProps, "style" | "onPress" | "disabled" | "children">) {
	const progress = useSharedValue(0);

	const animatedStyle = useAnimatedStyle(() => {
		const scale = interpolate(progress.value, [0, 1], [1, pressScale]);
		if (baseColor && pressedColor) {
			// Clamp for the color only: the release spring dips a hair below 0,
			// which is fine for scale but would extrapolate the color.
			const p = Math.min(1, Math.max(0, progress.value));
			return {
				transform: [{ scale }],
				backgroundColor: interpolateColor(
					p,
					[0, 1],
					[baseColor, pressedColor],
				),
			};
		}
		return { transform: [{ scale }] };
	});

	return (
		<AnimatedPressable
			{...pressableProps}
			style={[style, animatedStyle]}
			disabled={disabled}
			onPressIn={() => {
				progress.value = withTiming(1, {
					duration: 90,
					easing: Easing.out(Easing.quad),
				});
			}}
			onPressOut={() => {
				progress.value = withSpring(0, {
					stiffness: 380,
					damping: 26,
					mass: 0.6,
				});
			}}
			onPress={onPress}
		>
			{children}
		</AnimatedPressable>
	);
}
