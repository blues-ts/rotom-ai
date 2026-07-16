import { useEffect, useRef } from "react";
import { TextInput, type StyleProp, type TextStyle } from "react-native";
import Animated, {
	Easing,
	useAnimatedProps,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { formatCurrency } from "@/lib/format";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Rolls a currency amount from its previous value to the new one (stock-ticker
 * style) whenever it changes — the same treatment as the card detail's hero
 * price, sized for inline text. Driven on the UI thread via an
 * AnimatedTextInput so every interpolated frame paints without JS churn.
 *
 * `fontSize` is a prop (not style) because it also drives the width estimate:
 * a TextInput's intrinsic width is measured once at mount and animated text
 * never re-triggers layout, so the box is sized for the longer of the outgoing
 * and incoming strings and no frame of the roll clips.
 */
export default function TickerPrice({
	value,
	fontSize,
	textAlign = "left",
	style,
}: {
	value: number;
	fontSize: number;
	textAlign?: "left" | "center" | "right";
	style?: StyleProp<TextStyle>;
}) {
	const animated = useSharedValue(value);
	const prev = useRef(value);
	const targetText = formatCurrency(value);
	// Previous-value read during render, only to size the box for the longer of
	// the outgoing and incoming strings — a stale read is harmless (the box is
	// at worst one value-change wider than needed until the next render).
	// eslint-disable-next-line react-hooks/refs
	const chars = Math.max(targetText.length, formatCurrency(prev.current).length);

	useEffect(() => {
		prev.current = value;
		animated.value = withTiming(value, {
			duration: 450,
			easing: Easing.out(Easing.cubic),
		});
	}, [animated, value]);

	const animatedProps = useAnimatedProps(() => {
		"worklet";
		const n = animated.value;
		const [intPart, dec] = n.toFixed(2).split(".");
		// Group thousands manually — regex lookahead is unreliable inside a
		// worklet, which made the comma flicker/drop between frames.
		let withCommas = "";
		for (let i = 0; i < intPart.length; i++) {
			if (i > 0 && (intPart.length - i) % 3 === 0) withCommas += ",";
			withCommas += intPart[i];
		}
		return { text: `$${withCommas}.${dec}` } as any;
	});

	return (
		<AnimatedTextInput
			editable={false}
			pointerEvents="none"
			underlineColorAndroid="transparent"
			animatedProps={animatedProps}
			defaultValue={targetText}
			style={[
				{
					// ~0.62em per tabular-nums glyph, padded a hair so heavier
					// weights never clip.
					width: Math.ceil(chars * fontSize * 0.65),
					fontSize,
					textAlign,
					padding: 0,
					fontVariant: ["tabular-nums"],
				},
				style,
			]}
		/>
	);
}
