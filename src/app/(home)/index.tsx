import { useEffect, useRef } from "react";
import { Alert, InteractionManager, StyleSheet, View } from "react-native";

import { router, Stack, useLocalSearchParams } from "expo-router";

import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
	interpolate,
	useAnimatedStyle,
} from "react-native-reanimated";
import {
	KeyboardAvoidingView,
	useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ChatInput from "@/components/ChatInput";
import ChatMessageList, {
	type ChatMessageListRef,
} from "@/components/ChatMessageList";
import ChatSuggestions from "@/components/ChatSuggestions";
import EmptyChat from "@/components/EmptyChat";
import { useRiverTheme } from "@/constants/theme";
import { useChat } from "@/hooks/useChat";
import { warmScanner } from "@/lib/scannerWarmup";

export default function Home() {
	const t = useRiverTheme();
	const { bottom } = useSafeAreaInsets();
	const chatListRef = useRef<ChatMessageListRef>(null);
	const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

	// Auto-send the question when arriving via "Chat about this card" on the
	// card detail screen. Waits for any in-flight stream to finish (sendMessage
	// no-ops while streaming), and clears the param only once sent so the same
	// card can be asked about again later.
	const { chatPrefill } = useLocalSearchParams<{ chatPrefill?: string }>();

	// Warm the ~66 MB on-device scanner index once we're home — deferred until
	// after the entry transition/animations settle so the heavy native load never
	// janks the splash exit or this screen's mount. Idempotent (see scannerWarmup).
	useEffect(() => {
		const task = InteractionManager.runAfterInteractions(() => {
			void warmScanner();
		});
		return () => task.cancel();
	}, []);

	const bottomSpacerStyle = useAnimatedStyle(() => ({
		marginBottom: interpolate(
			keyboardHeight.value,
			[0, -1],
			[bottom, 4],
			"clamp",
		),
	}));

	const {
		messages,
		streamingContent,
		isStreaming,
		sendMessage,
		retryLast,
		startNewChat,
	} = useChat();

	useEffect(() => {
		if (!chatPrefill || isStreaming) return;
		router.setParams({ chatPrefill: "" });
		void sendMessage(chatPrefill);
	}, [chatPrefill, isStreaming, sendMessage]);

	const handleNewChat = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

		if (messages.length > 0) {
			Alert.alert(
				"New Chat",
				"Start a new conversation? Your current chat will be cleared.",
				[
					{ text: "Cancel", style: "cancel" },
					{
						text: "New Chat",
						onPress: startNewChat,
					},
				],
			);
		}
	};

	const handleInputFocus = () => {
		chatListRef.current?.scrollToBottom();
	};

	return (
		<>
			{/* "Glass on deep water" background — one vertical gradient per screen,
			    always visible (never stacked with a second gradient). */}
			<LinearGradient
				colors={t.background.colors}
				locations={t.background.locations}
				accessibilityRespondsToUserInteraction={false}
				pointerEvents="none"
				style={StyleSheet.absoluteFill}
			/>

			{/* Toolbar — native Liquid Glass chrome, accent-tinted per the design
			    system (rule 5: never rebuild chrome as custom glass). Tint goes on
			    each button: the Toolbar-level tintColor is dropped for header
			    (left/right) placements on iOS in this expo-router version. */}
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon={"square.and.pencil"}
					tintColor={t.accentOn}
					onPress={handleNewChat}
				/>
			</Stack.Toolbar>

			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon="gearshape"
					tintColor={t.accentOn}
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push("/(settings)");
					}}
				/>
				<Stack.Toolbar.Button
					icon={"folder"}
					tintColor={t.accentOn}
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push("/(collections)");
					}}
				/>
				<Stack.Toolbar.Button
					icon={"magnifyingglass"}
					tintColor={t.accentOn}
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push("/(search)");
					}}
				/>
			</Stack.Toolbar>

			{/* Chat Area */}
			<KeyboardAvoidingView
				style={styles.flex}
				behavior="padding"
				keyboardVerticalOffset={0}
			>
				{messages.length === 0 && !isStreaming ? (
					<View style={styles.emptyWrap}>
						<EmptyChat />
						<ChatSuggestions onSelect={sendMessage} />
					</View>
				) : (
					<View style={styles.flex}>
						<ChatMessageList
							ref={chatListRef}
							messages={messages}
							streamingContent={streamingContent}
							isStreaming={isStreaming}
							onRetry={retryLast}
						/>
					</View>
				)}

				{/* Chat Input */}
				<ChatInput
					onSend={sendMessage}
					disabled={isStreaming}
					onFocus={handleInputFocus}
				/>
				<Animated.View style={bottomSpacerStyle} />
			</KeyboardAvoidingView>
		</>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	// Center the empty-state hero + suggestion cards as a single group so the
	// cards sit directly under the tagline rather than at the bottom of the screen.
	emptyWrap: {
		flex: 1,
		justifyContent: "center",
	},
});
