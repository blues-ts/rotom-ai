import { Alert, StyleSheet, View } from "react-native";

import { router, Stack } from "expo-router";

import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ChatInput from "@/components/ChatInput";
import ChatMessageList from "@/components/ChatMessageList";
import EmptyChat from "@/components/EmptyChat";
import { useTheme } from "@/context/ThemeContext";
import { useChat } from "@/hooks/useChat";

export default function Home() {
	const { colors } = useTheme();
	const { bottom, top } = useSafeAreaInsets();

	const {
		messages,
		streamingContent,
		isStreaming,
		sendMessage,
		startNewChat,
	} = useChat();

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

	return (
		<>
			{/* Background Gradient */}
			<LinearGradient
				colors={[colors.primary, colors.background]}
				style={StyleSheet.absoluteFill}
			/>

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
			{messages.length === 0 && !isStreaming ? (
					<EmptyChat />
			) : (
				<View style={{ flex: 1 }}>
					<ChatMessageList
						messages={messages}
						streamingContent={streamingContent}
						isStreaming={isStreaming}
						bottomPadding={bottom + 70}
					/>
				</View>
			)}

			{/* Chat Input */}
			<View style={{ position: "absolute", bottom: bottom, left: 0, right: 0 }}>
				<ChatInput onSend={sendMessage} disabled={isStreaming} />
			</View>
		</>
	);
}
