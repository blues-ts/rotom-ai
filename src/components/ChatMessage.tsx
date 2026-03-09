import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import type { Message } from "@/types/chat";

interface ChatMessageProps {
	message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
	const { colors } = useTheme();
	const isUser = message.role === "user";

	return (
		<View
			style={[
				styles.row,
				isUser ? styles.rowUser : styles.rowAssistant,
			]}
		>
			<View
				style={[
					styles.bubble,
					isUser
						? [
								styles.bubbleUser,
								{ backgroundColor: colors.primary },
							]
						: [
								styles.bubbleAssistant,
								{
									backgroundColor: colors.card,
									borderColor: colors.border,
								},
							],
				]}
			>
				<Text
					style={[
						styles.text,
						{
							color: isUser
								? colors.primaryForeground
								: colors.foreground,
						},
					]}
				>
					{message.content}
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		paddingHorizontal: 16,
		marginVertical: 4,
	},
	rowUser: {
		alignItems: "flex-end",
	},
	rowAssistant: {
		alignItems: "flex-start",
	},
	bubble: {
		maxWidth: "80%",
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 18,
	},
	bubbleUser: {
		borderBottomRightRadius: 4,
	},
	bubbleAssistant: {
		borderBottomLeftRadius: 4,
		borderWidth: StyleSheet.hairlineWidth,
	},
	text: {
		fontSize: 16,
		lineHeight: 22,
	},
});
