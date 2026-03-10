import { useEffect, useRef } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { router, Stack } from "expo-router";

import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ChatInput from "@/components/ChatInput";
import ChatMessageList, { type ChatMessageListRef } from "@/components/ChatMessageList";
import EmptyChat from "@/components/EmptyChat";
import { useTheme } from "@/context/ThemeContext";
import { useChat } from "@/hooks/useChat";

export default function Home() {
	const { colors } = useTheme();
	const { bottom } = useSafeAreaInsets();
	const chatListRef = useRef<ChatMessageListRef>(null);
	const gradientOpacity = useSharedValue(1);

	const {
		messages,
		streamingContent,
		isStreaming,
		sendMessage,
		startNewChat,
	} = useChat();

	const hasMessages = messages.length > 0 || isStreaming;

	useEffect(() => {
		gradientOpacity.value = withTiming(hasMessages ? 0 : 1, { duration: 500 });
	}, [hasMessages]);

	const gradientStyle = useAnimatedStyle(() => ({
		opacity: gradientOpacity.value,
	}));

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
			{/* Background Gradient */}
			<Animated.View style={[StyleSheet.absoluteFill, gradientStyle]}>
				<LinearGradient
					colors={[colors.primary, colors.background]}
					style={StyleSheet.absoluteFill}
				/>
			</Animated.View>

			{/* Toolbar */}
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon={"square.and.pencil"}
					onPress={handleNewChat}
				/>
			</Stack.Toolbar>

			<Stack.Toolbar placement="left">
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
						Alert.alert("Collections");
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
					<EmptyChat />
				) : (
					<View style={styles.flex}>
						<ChatMessageList
							ref={chatListRef}
							messages={messages}
							streamingContent={streamingContent}
							isStreaming={isStreaming}
						/>
					</View>
				)}

				{/* Chat Input */}
				<View style={{ paddingBottom: bottom }}>
					<ChatInput onSend={sendMessage} disabled={isStreaming} onFocus={handleInputFocus} />
				</View>
			</KeyboardAvoidingView>
		</>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
});
