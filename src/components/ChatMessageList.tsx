import { useRef } from "react";
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent, StyleSheet } from "react-native";

import type { Message } from "@/types/chat";

import ChatMessage from "./ChatMessage";

interface ChatMessageListProps {
	messages: Message[];
	streamingContent: string;
	isStreaming: boolean;
	bottomPadding?: number;
}

export default function ChatMessageList({
	messages,
	streamingContent,
	isStreaming,
	bottomPadding = 0,
}: ChatMessageListProps) {
	const listRef = useRef<FlatList<Message>>(null);
	const isNearBottom = useRef(true);
	const contentHeight = useRef(0);
	const layoutHeight = useRef(0);

	const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
		const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
		isNearBottom.current = distanceFromBottom < 100;
	};

	const scrollToBottom = () => {
		if (isNearBottom.current && contentHeight.current > layoutHeight.current) {
			const offset = contentHeight.current - layoutHeight.current;
			listRef.current?.scrollToOffset({ offset, animated: true });
		}
	};

	const data: Message[] = isStreaming
		? [
				...messages,
				{
					id: "streaming",
					role: "assistant",
					content: streamingContent || "...",
					createdAt: new Date().toISOString(),
				},
			]
		: messages;

	return (
		<FlatList
			ref={listRef}
			data={data}
			keyExtractor={(item) => item.id}
			renderItem={({ item }) => <ChatMessage message={item} />}
			style={styles.list}
			contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
			showsVerticalScrollIndicator={false}
			keyboardDismissMode="on-drag"
			onScroll={handleScroll}
			scrollEventThrottle={16}
			onLayout={(e) => {
				layoutHeight.current = e.nativeEvent.layout.height;
			}}
			onContentSizeChange={(_w, h) => {
				contentHeight.current = h;
				scrollToBottom();
			}}
		/>
	);
}

const styles = StyleSheet.create({
	list: {
		flex: 1,
	},
	content: {
		paddingVertical: 8,
	},
});
