import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { SymbolView } from "expo-symbols";
import { radius, spacing, useRiverTheme } from "@/constants/theme";

interface ChatInputProps {
	onSend: (text: string) => void;
	disabled?: boolean;
	onFocus?: () => void;
}

export default function ChatInput({
	onSend,
	disabled,
	onFocus,
}: ChatInputProps) {
	const t = useRiverTheme();
	const [text, setText] = useState("");
	const canSend = useMemo(
		() => text.trim().length > 0 && !disabled,
		[text, disabled],
	);

	const handleSend = () => {
		const trimmed = text.trim();
		if (!trimmed || disabled) return;
		onSend(trimmed);
		setText("");
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
				<TextInput
					style={[styles.input, { color: t.text.primary }]}
					placeholder="Ask River anything…"
					placeholderTextColor={t.text.secondary}
					value={text}
					onChangeText={setText}
					onFocus={onFocus}
					onSubmitEditing={handleSend}
					returnKeyType="send"
					blurOnSubmit={false}
					maxLength={250}
					editable={!disabled}
					accessibilityLabel="Message input"
					accessibilityHint="Type your message to River"
				/>
				{text.length > 0 && (
					<Pressable
						onPress={() => setText("")}
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
				<Pressable
					onPress={handleSend}
					disabled={!canSend}
					accessibilityLabel="Send message"
					accessibilityRole="button"
					style={({ pressed }) => [
						styles.sendButton,
						{
							backgroundColor: t.accent,
							opacity: canSend ? 1 : 0.45,
							transform: [{ scale: pressed && canSend ? 0.97 : 1 }],
						},
						canSend && t.buttonGlow,
					]}
				>
					<SymbolView
						name="arrow.up"
						size={18}
						tintColor="#FFFFFF"
						weight="semibold"
					/>
				</Pressable>
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
		alignItems: "center",
		borderRadius: radius.pill,
		borderWidth: 1,
		paddingLeft: 18,
		paddingRight: 5,
		paddingVertical: 5,
	},
	input: {
		flex: 1,
		fontSize: 17,
		minHeight: 40,
		maxHeight: 100,
		marginRight: 8,
	},
	clearButton: {
		marginRight: 10,
	},
	sendButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
});
