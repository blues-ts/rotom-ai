import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMarkdown } from "react-native-marked";

import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/colors";
import type { MarkedStyles } from "react-native-marked";
import type { Message } from "@/types/chat";
import { ColoredRenderer } from "./ColoredRenderer";

interface ChatMessageProps {
	message: Message;
	onRetry?: () => void;
}

function getMarkdownStyles(colors: ThemeColors): MarkedStyles {
	return {
		text: {
			color: colors.foreground,
			fontSize: 16,
			lineHeight: 22,
		},
		h1: {
			fontSize: 22,
			fontWeight: "700",
			color: colors.foreground,
			marginTop: 20,
			marginBottom: 8,
		},
		h2: {
			fontSize: 20,
			fontWeight: "700",
			color: colors.foreground,
			marginTop: 18,
			marginBottom: 8,
		},
		h3: {
			fontSize: 18,
			fontWeight: "700",
			color: colors.foreground,
			marginTop: 16,
			marginBottom: 6,
		},
		paragraph: {
			marginTop: 4,
			marginBottom: 4,
		},
		strong: {
			fontWeight: "700",
			color: colors.foreground,
		},
		em: {
			fontStyle: "italic",
			color: colors.foreground,
		},
		list: {
			marginLeft: 4,
		},
		li: {
			color: colors.foreground,
			fontSize: 16,
			lineHeight: 22,
			marginVertical: 2,
		},
		codespan: {
			backgroundColor: colors.card,
			color: colors.foreground,
			borderRadius: 4,
			paddingHorizontal: 5,
			paddingVertical: 2,
			fontSize: 14,
			fontFamily: "Menlo",
		},
		code: {
			backgroundColor: colors.card,
			borderRadius: 8,
			padding: 12,
			marginVertical: 8,
			borderWidth: 0,
		},
		blockquote: {
			borderLeftWidth: 3,
			borderLeftColor: colors.primary,
			paddingLeft: 12,
			marginLeft: 0,
			marginVertical: 8,
			backgroundColor: "transparent",
		},
		hr: {
			backgroundColor: colors.border,
			height: 1,
			marginVertical: 12,
		},
		link: {
			color: colors.primary,
			textDecorationLine: "none",
		},
		image: {
			borderRadius: 10,
			resizeMode: "contain" as const,
		},
	};
}

function ChatMessage({ message, onRetry }: ChatMessageProps) {
	const { colors } = useTheme();
	const isUser = message.role === "user";

	const markdownStyles = useMemo(() => getMarkdownStyles(colors), [colors]);
	const renderer = useMemo(() => new ColoredRenderer(), []);

	const elements = useMarkdown(
		isUser ? "" : message.content,
		{ styles: markdownStyles, renderer },
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
					{elements}
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
