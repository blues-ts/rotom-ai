import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";

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
	const { colors } = useTheme();
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
		<View style={[styles.container, { borderTopColor: colors.border }]}>
			<View
				style={[
					styles.inputRow,
					{
						backgroundColor: colors.input,
						borderColor: colors.border,
					},
				]}
			>
				<TextInput
					style={[styles.input, { color: colors.foreground }]}
					placeholder="Ask River"
					placeholderTextColor={colors.mutedForeground}
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
				<Pressable
					onPress={handleSend}
					disabled={!canSend}
					accessibilityLabel="Send message"
					accessibilityRole="button"
					style={[
						styles.sendButton,
						{
							backgroundColor: canSend
								? colors.primary
								: colors.muted,
						},
					]}
				>
					<Ionicons
						name="arrow-up"
						size={20}
						color={
							canSend
								? colors.primaryForeground
								: colors.mutedForeground
						}
					/>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: 12,
		paddingTop: 6,
	},
	inputRow: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 22,
		borderWidth: 1,
		paddingLeft: 16,
		paddingRight: 6,
		paddingVertical: 6,
		// shadowColor: "#000",
		// shadowOffset: { width: 0, height: 2 },
		// shadowOpacity: 0.2,
		// shadowRadius: 8,
		// elevation: 4,
	},
	input: {
		flex: 1,
		fontSize: 16,
		minHeight: 34,
		maxHeight: 100,
		marginRight: 8,
	},
	sendButton: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
});
