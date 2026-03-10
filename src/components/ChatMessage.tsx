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
			{isUser ? (
				<View
					style={[
						styles.bubble,
						styles.bubbleUser,
						{ backgroundColor: colors.primary },
					]}
				>
					<Text
						style={[
							styles.text,
							{ color: colors.primaryForeground },
						]}
					>
						{message.content}
					</Text>
				</View>
			) : (
				<Text
					style={[
						styles.text,
						{ color: colors.foreground },
					]}
				>
					{message.content}
				</Text>
			)}
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
	bubbleUser: {},
	text: {
		fontSize: 16,
		lineHeight: 22,
	},
});
