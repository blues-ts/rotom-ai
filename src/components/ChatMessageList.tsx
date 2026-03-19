import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { FlatList, StyleSheet } from "react-native";

import type { Message } from "@/types/chat";

import ChatMessage from "./ChatMessage";
import StreamingMessage from "./StreamingMessage";
import TypingIndicator from "./TypingIndicator";

interface ChatMessageListProps {
	messages: Message[];
	streamingContent: string;
	isStreaming: boolean;
}

export interface ChatMessageListRef {
	scrollToBottom: () => void;
}

const ChatMessageList = forwardRef<ChatMessageListRef, ChatMessageListProps>(
	({ messages, streamingContent, isStreaming }, ref) => {
		const listRef = useRef<FlatList<Message>>(null);

		useImperativeHandle(ref, () => ({
			scrollToBottom: () => {
				listRef.current?.scrollToOffset({ offset: 0, animated: true });
			},
		}));

		const data: Message[] = useMemo(() => {
			return [...messages].reverse();
		}, [messages]);

		const headerComponent = useMemo(() => {
			if (isStreaming && streamingContent) {
				return <StreamingMessage content={streamingContent} />;
			}
			if (isStreaming) {
				return <TypingIndicator />;
			}
			return null;
		}, [isStreaming, streamingContent]);

		return (
			<FlatList
				ref={listRef}
				inverted
				data={data}
				keyExtractor={(item) => item.id}
				renderItem={({ item }) => <ChatMessage message={item} />}
				ListHeaderComponent={headerComponent}
				style={styles.list}
				contentContainerStyle={styles.content}
				showsVerticalScrollIndicator={false}
				keyboardDismissMode="on-drag"
				maxToRenderPerBatch={10}
				windowSize={10}
				maintainVisibleContentPosition={{
					minIndexForVisible: 0,
					autoscrollToTopThreshold: 150,
				}}
			/>
		);
	},
);

ChatMessageList.displayName = "ChatMessageList";

export default ChatMessageList;

const styles = StyleSheet.create({
	list: {
		flex: 1,
	},
	content: {
		flexGrow: 1,
		paddingVertical: 8,
	},
});
