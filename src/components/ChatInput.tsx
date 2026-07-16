import { useEffect, useMemo, useState } from "react";
import {
	Keyboard,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";

import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import CardPressable from "@/components/CardPressable";
import { spacing, useRiverTheme } from "@/constants/theme";

interface ChatInputProps {
	/**
	 * Returns (or resolves) false when the send was refused — e.g. the Pro
	 * paywall was dismissed — in which case the drafted text stays in the
	 * input instead of being cleared.
	 */
	onSend: (text: string) => void | boolean | Promise<void | boolean>;
	onStop?: () => void;
	isStreaming?: boolean;
	onFocus?: () => void;
}

const LINE_HEIGHT = 22;
// Single line up to 4 lines, then the text scrolls inside the input. The
// input is sized to the text alone — its 9pt top/bottom gaps are margins
// (see styles.input), so the breathing room stays even while scrolled.
const MIN_INPUT_HEIGHT = LINE_HEIGHT;
const MAX_INPUT_HEIGHT = 4 * LINE_HEIGHT;

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export default function ChatInput({
	onSend,
	onStop,
	isStreaming,
	onFocus,
}: ChatInputProps) {
	const t = useRiverTheme();
	const [text, setText] = useState("");
	// The input's height is derived from a hidden <Text> mirror of the draft,
	// measured at the input's width. Native auto-sizing can't be trusted here:
	// on Fabric, multiline inputs grow but won't shrink while focused, and
	// onContentSizeChange doesn't fire reliably.
	const [inputWidth, setInputWidth] = useState(0);
	const [textHeight, setTextHeight] = useState(LINE_HEIGHT);
	const inputHeight = Math.min(
		MAX_INPUT_HEIGHT,
		Math.max(MIN_INPUT_HEIGHT, Math.ceil(textHeight)),
	);

	// Animate every height change — line-by-line growth while typing and the
	// snap back to a pill on clear/send.
	const animatedHeight = useSharedValue(MIN_INPUT_HEIGHT);
	useEffect(() => {
		animatedHeight.value = withTiming(inputHeight, {
			duration: 180,
			easing: Easing.out(Easing.quad),
		});
	}, [inputHeight, animatedHeight]);
	const inputHeightStyle = useAnimatedStyle(() => ({
		height: animatedHeight.value,
	}));
	const canSend = useMemo(
		() => text.trim().length > 0 && !isStreaming,
		[text, isStreaming],
	);

	const clearText = () => {
		setText("");
		setTextHeight(LINE_HEIGHT);
	};

	const handleSend = async () => {
		const trimmed = text.trim();
		if (!trimmed || isStreaming) return;
		const accepted = await onSend(trimmed);
		if (accepted !== false) {
			clearText();
			// Drop the keyboard so the reply streams with the full screen —
			// leaving it up kept the input floating mid-screen.
			Keyboard.dismiss();
		}
	};

	const handleStop = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onStop?.();
	};

	return (
		<View style={styles.container}>
			<View
				style={[
					styles.inputRow,
					{
						backgroundColor: t.glass.elevatedFill,
						borderColor: t.glass.elevatedBorder,
					},
					t.glass.shadow,
				]}
			>
				{/* Hidden mirror of the draft; its measured height drives the
				    input's height (see comment on textHeight above). */}
				{inputWidth > 0 && (
					<Text
						style={[styles.ghost, { width: inputWidth }]}
						onLayout={({ nativeEvent }) =>
							setTextHeight(nativeEvent.layout.height)
						}
						accessibilityElementsHidden
						importantForAccessibility="no-hide-descendants"
					>
						{text || " "}
					</Text>
				)}
				<AnimatedTextInput
					style={[
						styles.input,
						{ color: t.text.primary },
						inputHeightStyle,
					]}
					onLayout={({ nativeEvent }) =>
						setInputWidth(nativeEvent.layout.width)
					}
					placeholder="Ask River anything…"
					placeholderTextColor={t.text.secondary}
					value={text}
					onChangeText={setText}
					onFocus={onFocus}
					onSubmitEditing={handleSend}
					returnKeyType="send"
					multiline
					submitBehavior="submit"
					maxLength={250}
					accessibilityLabel="Message input"
					accessibilityHint="Type your message to River"
				/>
				{text.length > 0 && (
					<Pressable
						onPress={clearText}
						hitSlop={8}
						style={styles.clearButton}
					>
						<SymbolView
							name="xmark.circle"
							size={18}
							tintColor={t.text.secondary}
							weight="medium"
						/>
					</Pressable>
				)}
				{/* While streaming, the send button becomes a ChatGPT-style
				    stop button; typing stays enabled so the next question can
				    be drafted while River answers. */}
				<CardPressable
					onPress={isStreaming ? handleStop : handleSend}
					disabled={!isStreaming && !canSend}
					accessibilityLabel={
						isStreaming ? "Stop response" : "Send message"
					}
					accessibilityRole="button"
					pressScale={0.95}
					style={[
						styles.sendButton,
						{
							backgroundColor: t.accent,
							opacity: isStreaming || canSend ? 1 : 0.45,
						},
						isStreaming || canSend ? t.buttonGlow : null,
					]}
				>
					<SymbolView
						name={isStreaming ? "stop.fill" : "arrow.up"}
						size={isStreaming ? 14 : 18}
						tintColor="#FFFFFF"
						weight="semibold"
					/>
				</CardPressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: spacing.screen,
		paddingTop: 6,
	},
	inputRow: {
		flexDirection: "row",
		// Bottom-align so the buttons hug the last line as the input grows.
		alignItems: "flex-end",
		// Half the single-line height (50pt): reads as a pill at one line,
		// but stays a rounded rect (not a giant capsule) as the input grows.
		borderRadius: 25,
		borderWidth: 1,
		paddingLeft: 18,
		paddingRight: 5,
		paddingVertical: 5,
	},
	input: {
		flex: 1,
		fontSize: 17,
		lineHeight: LINE_HEIGHT,
		// Height is set inline, derived from the ghost measurement. Vertical
		// gaps are margins, NOT padding: padding would scroll with the text
		// (it's the UITextView's content inset), leaving lines clipped hard
		// against the edges mid-scroll. Margins keep the gap even always.
		marginTop: 9,
		marginBottom: 9,
		marginRight: 8,
		paddingTop: 0,
		paddingBottom: 0,
		textAlignVertical: "top",
	},
	// Must match the input's font metrics exactly so it wraps identically.
	ghost: {
		position: "absolute",
		top: 0,
		left: 0,
		opacity: 0,
		fontSize: 17,
		lineHeight: LINE_HEIGHT,
		pointerEvents: "none",
	},
	clearButton: {
		marginRight: 10,
		marginBottom: 11,
	},
	sendButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
});
