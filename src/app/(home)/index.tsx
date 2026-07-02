import { useEffect, useRef } from "react";
import { Alert, InteractionManager, StyleSheet, View } from "react-native";

import { router, Stack } from "expo-router";

import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
	FadeIn,
	FadeOut,
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
import { useTheme } from "@/context/ThemeContext";
import { useChat } from "@/hooks/useChat";
import { warmScanner } from "@/lib/scannerWarmup";

export default function Home() {
	const { colors } = useTheme();
	const { bottom } = useSafeAreaInsets();
	const chatListRef = useRef<ChatMessageListRef>(null);
	const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

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

	const hasMessages = messages.length > 0 || isStreaming;

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
			{/* Background Gradient — fades in on empty state, out when messages exist */}
			{!hasMessages && (
				<Animated.View
					style={StyleSheet.absoluteFill}
					entering={FadeIn.duration(500)}
					exiting={FadeOut.duration(500)}
					pointerEvents="none"
				>
					<LinearGradient
						colors={[colors.primary, colors.background]}
						accessibilityRespondsToUserInteraction={false}
						style={StyleSheet.absoluteFill}
					/>
				</Animated.View>
			)}

			{/* Toolbar — explicit tint: untinted native bar items fall back to
			    system blue on pre-26 iOS (26's glass toolbars use label color). */}
			<Stack.Toolbar placement="left" tintColor={colors.foreground}>
				<Stack.Toolbar.Button
					icon={"square.and.pencil"}
					onPress={handleNewChat}
				/>
			</Stack.Toolbar>

			<Stack.Toolbar placement="right" tintColor={colors.foreground}>
				<Stack.Toolbar.Button
					icon="gearshape"
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push("/(settings)");
					}}
				/>
				<Stack.Toolbar.Button
					icon={"folder"}
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push("/(collections)");
					}}
				/>
				<Stack.Toolbar.Button
					icon={"magnifyingglass"}
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
