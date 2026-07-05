import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	FlatList,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	StyleSheet,
	View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";

import { useRiverTheme } from "@/constants/theme";
import type { LeadStore } from "@/hooks/useChat";
import type { Message } from "@/types/chat";

import CardPressable from "./CardPressable";
import ChatMessage from "./ChatMessage";
import StreamingMessage from "./StreamingMessage";
import TypingIndicator from "./TypingIndicator";

interface ChatMessageListProps {
	messages: Message[];
	streamingContent: string;
	streamingLeadStore?: LeadStore;
	isStreaming: boolean;
	onRetry?: () => void;
}

export interface ChatMessageListRef {
	scrollToBottom: () => void;
}

// Scrolled this far above the latest content → show the jump-back chevron.
const AWAY_FROM_LATEST_PX = 240;

// Bottom-anchored (iMessage/Claude-style) chat: the conversation hugs the
// input, new messages and the streaming reply appear at the bottom and push
// older content up. offset 0 in the inverted list is always "latest". (This
// replaced the ChatGPT pin-to-top model — its reserved response area left a
// screen of dead space under every short reply.)
const ChatMessageList = forwardRef<ChatMessageListRef, ChatMessageListProps>(
	(
		{ messages, streamingContent, streamingLeadStore, isStreaming, onRetry },
		ref,
	) => {
		const t = useRiverTheme();
		const listRef = useRef<FlatList<Message>>(null);
		const [awayFromLatest, setAwayFromLatest] = useState(false);
		// Tail-follow: attached means the view tracks new content at the
		// bottom. A deliberate drag detaches; returning to the bottom,
		// sending, or tapping the chevron re-attaches. State (not just a
		// ref) because attachment decides the mVCP prop below.
		const [attached, setAttachedState] = useState(true);
		const attachedRef = useRef(true);
		const setAttached = useCallback((value: boolean) => {
			if (attachedRef.current === value) return;
			attachedRef.current = value;
			setAttachedState(value);
		}, []);
		// True while the user's finger is on the list. The follow must
		// never scroll, and the near-bottom rule must never re-attach,
		// mid-drag — otherwise a drag that starts at the bottom gets
		// snatched straight back down while the finger is still moving.
		const draggingRef = useRef(false);
		const contentHeightRef = useRef(0);

		const scrollToLatest = useCallback((animated: boolean) => {
			listRef.current?.scrollToOffset({ offset: 0, animated });
		}, []);

		useImperativeHandle(ref, () => ({
			scrollToBottom: () => scrollToLatest(true),
		}));

		const data: Message[] = useMemo(() => {
			return [...messages].reverse();
		}, [messages]);

		// Sending re-attaches the follow and brings the new message into
		// view even if the user was deep in history.
		const lastMessageId = data[0]?.id;
		const lastMessageRole = data[0]?.role;
		useEffect(() => {
			if (lastMessageRole !== "user") return;
			setAttached(true);
			scrollToLatest(true);
		}, [lastMessageId, lastMessageRole, scrollToLatest, setAttached]);

		const handleScroll = useCallback(
			(e: NativeSyntheticEvent<NativeScrollEvent>) => {
				const offsetY = e.nativeEvent.contentOffset.y;
				// Settling back at the bottom re-attaches the follow — but
				// only once the finger is up.
				if (!draggingRef.current && offsetY <= 60) setAttached(true);
				const away = offsetY > AWAY_FROM_LATEST_PX;
				setAwayFromLatest((prev) => (prev === away ? prev : away));
			},
			[setAttached],
		);

		// While attached, the inverted list sticks to the newest content at
		// offset 0 natively (mVCP is OFF — see the prop below). This is
		// just a corrective nudge for small drift (keyboard bounce, an
		// interrupted fling that settled near the bottom).
		const handleContentSizeChange = useCallback(
			(_w: number, h: number) => {
				const delta = h - contentHeightRef.current;
				contentHeightRef.current = h;
				if (draggingRef.current || !attachedRef.current || delta <= 0)
					return;
				scrollToLatest(false);
			},
			[scrollToLatest],
		);

		// The streaming reply (or the pre-first-token typing dots) renders
		// in the header — the visual bottom of the inverted list, directly
		// above the input.
		const headerComponent = useMemo(() => {
			if (!isStreaming) return null;
			return streamingContent ? (
				<StreamingMessage
					content={streamingContent}
					leadStore={streamingLeadStore}
				/>
			) : (
				<TypingIndicator />
			);
		}, [isStreaming, streamingContent, streamingLeadStore]);

		return (
			<View style={styles.wrap}>
				<FlatList
					ref={listRef}
					inverted
					data={data}
					keyExtractor={(item) => item.id}
					renderItem={({ item, index }) => (
						<ChatMessage
							message={item}
							// Only the most recent message (index 0, inverted list)
							// is retryable.
							onRetry={index === 0 ? onRetry : undefined}
						/>
					)}
					ListHeaderComponent={headerComponent}
					style={styles.list}
					contentContainerStyle={styles.content}
					showsVerticalScrollIndicator={false}
					keyboardDismissMode="on-drag"
					onScroll={handleScroll}
					onScrollBeginDrag={() => {
						// A deliberate drag detaches the follow until the
						// user returns to the bottom (or taps the chevron).
						draggingRef.current = true;
						setAttached(false);
					}}
					onScrollEndDrag={(e) => {
						draggingRef.current = false;
						// Released right at the bottom (no momentum will
						// follow): re-attach immediately.
						if (e.nativeEvent.contentOffset.y <= 60) {
							setAttached(true);
						}
					}}
					onContentSizeChange={handleContentSizeChange}
					scrollEventThrottle={64}
					maxToRenderPerBatch={10}
					windowSize={10}
					// The anchor mode flips with attachment. Attached: NO
					// mVCP — an inverted list at offset 0 sticks to the
					// newest content natively, which IS the follow; leaving
					// mVCP on here made it fight the follow by scrolling
					// away from the bottom on every growth to hold the old
					// view still. Detached: mVCP anchors the transcript so
					// growth below never shifts what the user is reading.
					maintainVisibleContentPosition={
						attached ? undefined : { minIndexForVisible: 0 }
					}
				/>
				{awayFromLatest ? (
					<CardPressable
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							// offset 0 is the true end of the conversation in
							// every state — mid-stream it's the growing tail
							// (and this re-attaches the follow), idle it's
							// the last line of the reply.
							setAttached(true);
							scrollToLatest(true);
						}}
						pressScale={0.92}
						baseColor={t.glass.elevatedFill}
						pressedColor={t.glass.pressedFill}
						style={[
							styles.jumpToLatest,
							{ borderColor: t.glass.elevatedBorder },
						]}
					>
						<SymbolView
							name="chevron.down"
							size={16}
							tintColor={t.text.primary}
							weight="semibold"
						/>
					</CardPressable>
				) : null}
			</View>
		);
	},
);

ChatMessageList.displayName = "ChatMessageList";

export default ChatMessageList;

const styles = StyleSheet.create({
	wrap: {
		flex: 1,
	},
	list: {
		flex: 1,
	},
	content: {
		flexGrow: 1,
		paddingVertical: 8,
	},
	jumpToLatest: {
		position: "absolute",
		bottom: 12,
		alignSelf: "center",
		width: 36,
		height: 36,
		borderRadius: 18,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
});
