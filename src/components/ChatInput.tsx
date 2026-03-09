import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, TextInput, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";

interface ChatInputProps {
	onSend: (text: string) => void;
	disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
	const { colors } = useTheme();
	const [text, setText] = useState("");

	const handleSend = () => {
		const trimmed = text.trim();
		if (!trimmed || disabled) return;
		onSend(trimmed);
		setText("");
		Keyboard.dismiss();
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
					onSubmitEditing={handleSend}
					returnKeyType="send"
					blurOnSubmit
					maxLength={2000}
					editable={!disabled}
				/>
				<Pressable
					onPress={handleSend}
					disabled={!text.trim() || disabled}
					style={[
						styles.sendButton,
						{
							backgroundColor:
								text.trim() && !disabled
									? colors.primary
									: colors.muted,
						},
					]}
				>
					<Ionicons
						name="arrow-up"
						size={20}
						color={
							text.trim() && !disabled
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
	},
	inputRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		borderRadius: 22,
		borderWidth: 1,
		paddingLeft: 16,
		paddingRight: 6,
		paddingVertical: 6,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.4,
		shadowRadius: 8,
		elevation: 4,
	},
	input: {
		flex: 1,
		fontSize: 16,
		lineHeight: 22,
		maxHeight: 100,
		paddingTop: 6,
		paddingBottom: 6,
	},
	sendButton: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
});
