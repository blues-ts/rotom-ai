import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/context/ThemeContext";
import type { Message } from "@/types/chat";
import { ColoredRenderer } from "./ColoredRenderer";
import { MarkdownBlock } from "./MarkdownBlocks";
import { splitMarkdownBlocks } from "./chatMarkdown";

interface ChatMessageProps {
	message: Message;
	onRetry?: () => void;
}

function ChatMessage({ message, onRetry }: ChatMessageProps) {
	const { colors } = useTheme();
	const isUser = message.role === "user";

	const renderer = useMemo(() => new ColoredRenderer(), []);

	// Same block-split + memoized-block path as StreamingMessage, so the
	// instant a stream finalizes into a message nothing re-lays-out.
	const blocks = useMemo(
		() => (isUser ? [] : splitMarkdownBlocks(message.content)),
		[isUser, message.content],
	);

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
				<View style={styles.markdownContainer}>
					{blocks.map((block, i) => (
						<MarkdownBlock
							key={i}
							text={block}
							colors={colors}
							renderer={renderer}
						/>
					))}
					{message.status === "error" && onRetry ? (
						<Pressable
							style={[
								styles.retryButton,
								{
									backgroundColor: colors.card,
									borderColor: colors.border,
								},
							]}
							onPress={onRetry}
						>
							<Ionicons
								name="refresh"
								size={14}
								color={colors.foreground}
							/>
							<Text
								style={[
									styles.retryText,
									{ color: colors.foreground },
								]}
							>
								Retry
							</Text>
						</Pressable>
					) : null}
				</View>
			)}
		</View>
	);
}

export default React.memo(ChatMessage);

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
	text: {
		fontSize: 16,
		lineHeight: 22,
	},
	markdownContainer: {
		width: "100%",
	},
	retryButton: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 16,
		borderWidth: 1,
		marginTop: 8,
	},
	retryText: {
		fontSize: 13,
		fontWeight: "600",
	},
});
