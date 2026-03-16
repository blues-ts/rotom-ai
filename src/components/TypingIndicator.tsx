import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/context/ThemeContext";

const DOT_SIZE = 7;
const DURATION = 400;

function Dot({ delay, color }: { delay: number; color: string }) {
	const opacity = useSharedValue(0.3);

	useEffect(() => {
		opacity.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(1, { duration: DURATION }),
					withTiming(0.3, { duration: DURATION }),
				),
				-1,
			),
		);
	}, []);

	const style = useAnimatedStyle(() => ({
		opacity: opacity.value,
	}));

	return (
		<Animated.View
			style={[
				styles.dot,
				{ backgroundColor: color },
				style,
			]}
		/>
	);
}

export default function TypingIndicator() {
	const { colors } = useTheme();

	return (
		<View style={styles.container}>
			<Dot delay={0} color={colors.mutedForeground} />
			<Dot delay={150} color={colors.mutedForeground} />
			<Dot delay={300} color={colors.mutedForeground} />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	dot: {
		width: DOT_SIZE,
		height: DOT_SIZE,
		borderRadius: DOT_SIZE / 2,
	},
});
