import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/context/ThemeContext";

interface StreamingMessageProps {
	content: string;
}

export default function StreamingMessage({ content }: StreamingMessageProps) {
	const { colors } = useTheme();
	const cursorOpacity = useSharedValue(1);

	useEffect(() => {
		cursorOpacity.value = withRepeat(
			withSequence(
				withTiming(1, { duration: 400 }),
				withTiming(0, { duration: 400 }),
			),
			-1,
		);
	}, []);

	const cursorStyle = useAnimatedStyle(() => ({
		opacity: cursorOpacity.value,
	}));

	return (
		<View style={styles.container}>
			<Text style={[styles.text, { color: colors.foreground }]}>
				{content}
				<Animated.Text
					style={[styles.cursor, { color: colors.foreground }, cursorStyle]}
				>
					▍
				</Animated.Text>
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: 16,
		paddingVertical: 4,
		width: "100%",
	},
	text: {
		fontSize: 16,
		lineHeight: 22,
	},
	cursor: {
		fontSize: 16,
		lineHeight: 22,
	},
});
