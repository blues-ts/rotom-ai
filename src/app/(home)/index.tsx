import { useCallback, useEffect, useRef, useState } from "react";
import {
	Alert,
	InteractionManager,
	Keyboard,
	Pressable,
	StyleSheet,
	View,
} from "react-native";

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import {
	KeyboardEvents,
	useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Host, Image as UIImage, VStack } from "@expo/ui/swift-ui";
import {
	buttonStyle,
	frame,
	glassEffect,
	padding,
} from "@expo/ui/swift-ui/modifiers";

import ChatInput from "@/components/ChatInput";
import ChatMessageList, {
	type ChatMessageListRef,
} from "@/components/ChatMessageList";
import ChatSuggestions from "@/components/ChatSuggestions";
import EmptyChat from "@/components/EmptyChat";
import { useRiverTheme } from "@/constants/theme";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { useChat } from "@/hooks/useChat";
import { IOS_MAJOR_VERSION } from "@/lib/platform";
import {
	paywallResultUnlocked,
	presentProPaywallIfNeeded,
} from "@/lib/revenuecat";
import { warmScanner } from "@/lib/scannerWarmup";

export default function Home() {
	const t = useRiverTheme();
	const { top, bottom } = useSafeAreaInsets();
	// glassEffect is a no-op below iOS 26, which left these buttons as bare
	// icons over the chat — paint the circle/capsule there instead. sheetFill
	// (near-opaque), not elevatedFill: without real blur behind it, a thin
	// glass tint leaves chat text readable through the buttons.
	const legacyGlass = IOS_MAJOR_VERSION < 26 && {
		backgroundColor: t.glass.sheetFill,
		borderWidth: 1,
		borderColor: t.glass.elevatedBorder,
		borderRadius: 22,
	};
	// No nav bar — the floating glass buttons form the top chrome row, starting
	// just under the status bar.
	const chromeTop = top + 8;
	const chromeBottom = chromeTop + 44; // one 44pt button row
	const chatListRef = useRef<ChatMessageListRef>(null);
	const { height: keyboardHeight, progress: keyboardProgress } =
		useReanimatedKeyboardAnimation();

	// Auto-send the question when arriving via "Chat about this card" on the
	// card detail screen. Waits for any in-flight stream to finish (sendMessage
	// no-ops while streaming), and clears the param only once sent so the same
	// card can be asked about again later.
	const { chatPrefill } = useLocalSearchParams<{ chatPrefill?: string }>();

	// The suggestion cards fade with the keyboard's own animation progress —
	// they stay mounted so the hero above never re-centers (no layout jump),
	// but go untappable while hidden. Will-events flip the state early enough
	// that pointerEvents is off before the fade lands.
	const [keyboardShown, setKeyboardShown] = useState(false);
	useEffect(() => {
		const show = KeyboardEvents.addListener("keyboardWillShow", () =>
			setKeyboardShown(true),
		);
		const hide = KeyboardEvents.addListener("keyboardWillHide", () =>
			setKeyboardShown(false),
		);
		return () => {
			show.remove();
			hide.remove();
		};
	}, []);

	const emptyFadeStyle = useAnimatedStyle(() => ({
		opacity: 1 - keyboardProgress.value,
	}));

	// Warm the ~66 MB on-device scanner index once we're home — deferred until
	// after the entry transition/animations settle so the heavy native load never
	// janks the splash exit or this screen's mount. Idempotent (see scannerWarmup).
	useEffect(() => {
		const task = InteractionManager.runAfterInteractions(() => {
			void warmScanner();
		});
		return () => task.cancel();
	}, []);

	// RNKC's shared value can itself stick at keyboard height when a hide
	// lands around a navigation (e.g. tapping a card image mid-stream and
	// coming back left the input floating mid-screen). RN's own Keyboard
	// observer is an INDEPENDENT native signal: while it says hidden, the
	// avoidance clamps to zero no matter what the stuck value claims, so
	// the screen self-heals on return.
	const keyboardVisible = useSharedValue(0);
	useEffect(() => {
		const show = Keyboard.addListener("keyboardWillShow", () => {
			keyboardVisible.value = 1;
		});
		const hide = Keyboard.addListener("keyboardWillHide", () => {
			keyboardVisible.value = 0;
		});
		return () => {
			show.remove();
			hide.remove();
		};
	}, [keyboardVisible]);

	// Self-heal on return: a native modal round-trip (card detail, paywall)
	// can end with an unpaired willShow — iOS restores the still-first-responder
	// input's keyboard during the dismiss transition, then cancels it without
	// ever firing willHide (the notification only fires for a keyboard that
	// actually appeared). Reconcile against the real keyboard state once the
	// transition settles so the padding can't stay stuck at keyboard height.
	useFocusEffect(
		useCallback(() => {
			const task = InteractionManager.runAfterInteractions(() => {
				if (!Keyboard.isVisible()) {
					keyboardVisible.value = 0;
				}
			});
			return () => task.cancel();
		}, [keyboardVisible]),
	);

	const bottomSpacerStyle = useAnimatedStyle(() => ({
		marginBottom:
			keyboardVisible.value === 0
				? withTiming(bottom, { duration: 250 })
				: interpolate(
						keyboardHeight.value,
						[0, -1],
						[bottom, 4],
						"clamp",
					),
	}));

	// Keyboard avoidance driven straight off the shared value instead of
	// RNKC's <KeyboardAvoidingView>, gated by the independent visibility
	// flag above.
	const keyboardPadStyle = useAnimatedStyle(() => ({
		paddingBottom:
			keyboardVisible.value === 0
				? withTiming(0, { duration: 250 })
				: Math.max(0, -keyboardHeight.value),
	}));

	const {
		messages,
		streamingContent,
		streamingLeadStore,
		isStreaming,
		sendMessage,
		retryLast,
		stopStreaming,
		startNewChat,
	} = useChat();
	const { isPro } = useRevenueCat();

	// Pro gate lives HERE, before the send: non-Pro users get the paywall
	// instead of a send — nothing enters the transcript, and ChatInput
	// keeps the drafted text when this returns false. Unlocking (purchase/
	// restore, or the entitlement being active despite a stale local
	// isPro) proceeds with the send immediately.
	const handleChatSend = useCallback(
		async (text: string): Promise<boolean> => {
			if (!isPro) {
				// Dismiss BEFORE the paywall's native modal presents: a
				// keyboard hide that happens underneath the modal never
				// reaches the keyboard-controller's shared value, leaving
				// the input stuck padded mid-screen after dismissal.
				Keyboard.dismiss();
				const result = await presentProPaywallIfNeeded();
				if (!paywallResultUnlocked(result)) return false;
			}
			void sendMessage(text);
			return true;
		},
		[isPro, sendMessage],
	);

	useEffect(() => {
		if (!chatPrefill || isStreaming) return;
		router.setParams({ chatPrefill: "" });
		void handleChatSend(chatPrefill);
	}, [chatPrefill, isStreaming, handleChatSend]);

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

			{/* Empty-state hero + suggestions live OUTSIDE the keyboard-avoiding
			    layout and fade out as one with the keyboard's progress — nothing
			    re-lays-out, so nothing can stutter. (Compensating the KAV squeeze
			    with a transform jittered: layout and transform updates land on
			    different frames.) */}
			{messages.length === 0 && !isStreaming && (
				<>
					<Animated.View
						style={[
							styles.emptyLayer,
							// Hero sits high on the screen: a fixed gap below the
							// top chrome row rather than vertically centered.
							{ paddingTop: chromeBottom + 96 },
							emptyFadeStyle,
						]}
						pointerEvents={keyboardShown ? "none" : "box-none"}
					>
						<EmptyChat />
					</Animated.View>
					{/* While typing, anywhere above the input dismisses. */}
					{keyboardShown && (
						<Pressable
							style={styles.dismissLayer}
							onPress={Keyboard.dismiss}
						/>
					)}
				</>
			)}

			{/* Chat Area — box-none so taps in the empty region reach the hero
			    layer behind (its Pressable dismisses the keyboard). */}
			<Animated.View
				style={[styles.flex, keyboardPadStyle]}
				pointerEvents="box-none"
			>
				{messages.length === 0 && !isStreaming ? (
					<View style={styles.flex} pointerEvents="box-none" />
				) : (
					<View style={styles.flex}>
						<ChatMessageList
							ref={chatListRef}
							messages={messages}
							streamingContent={streamingContent}
							streamingLeadStore={streamingLeadStore}
							isStreaming={isStreaming}
							onRetry={retryLast}
							topInset={chromeBottom + 8}
						/>
					</View>
				)}

				{/* Prompt carousel — compact chips directly above the input,
				    only while the conversation is empty. Lives in the keyboard-
				    avoiding column so it rides up with the input. */}
				{messages.length === 0 && !isStreaming && (
					<ChatSuggestions
						onSelect={(text) => void handleChatSend(text)}
					/>
				)}

				{/* Chat Input */}
				<ChatInput
					onSend={handleChatSend}
					onStop={stopStreaming}
					isStreaming={isStreaming}
					onFocus={handleInputFocus}
				/>
				<Animated.View style={bottomSpacerStyle} />
			</Animated.View>

			{/* Floating chrome — no nav bar on this screen (its scroll-edge effect
			    dimmed content outside the bar). New-chat floats top-left; settings /
			    collections / search stack as a vertical glass column top-right.
			    Same circle-glass recipe as the scanner toolbar. Rendered last so
			    the chat list underneath can't swallow their taps. */}
			<View
				style={[styles.newChatButton, { top: chromeTop }]}
				pointerEvents="box-none"
			>
				<Host style={[styles.newChatHost, legacyGlass]}>
					<Button onPress={handleNewChat} modifiers={[buttonStyle("plain")]}>
						<UIImage
							systemName="square.and.pencil"
							size={20}
							color={t.accentOn}
							modifiers={[
								frame({ width: 44, height: 44 }),
								glassEffect({
									shape: "circle",
									glass: { variant: "regular", interactive: true },
								}),
							]}
						/>
					</Button>
				</Host>
			</View>
			<View
				style={[styles.navColumn, { top: chromeTop }]}
				pointerEvents="box-none"
			>
				<Host style={[styles.navColumnHost, legacyGlass]}>
					{/* One capsule of glass around the whole stack (Maps-style
					    grouped controls) — the buttons inside are plain. */}
					<VStack
						spacing={0}
						modifiers={[
							padding({ vertical: 6 }),
							glassEffect({
								shape: "capsule",
								glass: { variant: "regular", interactive: true },
							}),
						]}
					>
						<Button
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								router.push("/(settings)");
							}}
							modifiers={[buttonStyle("plain")]}
						>
							<UIImage
								systemName="gearshape"
								size={20}
								color={t.accentOn}
								modifiers={[frame({ width: 44, height: 44 })]}
							/>
						</Button>
						<Button
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								router.push("/(collections)");
							}}
							modifiers={[buttonStyle("plain")]}
						>
							<UIImage
								systemName="folder"
								size={20}
								color={t.accentOn}
								modifiers={[frame({ width: 44, height: 44 })]}
							/>
						</Button>
						<Button
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								router.push("/(search)");
							}}
							modifiers={[buttonStyle("plain")]}
						>
							<UIImage
								systemName="magnifyingglass"
								size={20}
								color={t.accentOn}
								modifiers={[frame({ width: 44, height: 44 })]}
							/>
						</Button>
						<Button
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								// Scanning is Pro — paywall instead of the scanner, same
								// gate as the search header's camera button.
								if (!isPro) {
									void presentProPaywallIfNeeded();
									return;
								}
								router.push("/(camera)");
							}}
							modifiers={[buttonStyle("plain")]}
						>
							<UIImage
								systemName="camera.viewfinder"
								size={20}
								color={t.accentOn}
								modifiers={[frame({ width: 44, height: 44 })]}
							/>
						</Button>
					</VStack>
				</Host>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	// Empty-state hero, anchored below the top chrome (paddingTop set inline).
	// Absolute so the keyboard-avoiding layout never squeezes it.
	emptyLayer: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		justifyContent: "flex-start",
	},
	// Sits behind the (box-none) chat area, so the input stays tappable while
	// every other touch lands here.
	dismissLayer: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	newChatButton: {
		position: "absolute",
		left: 14,
	},
	newChatHost: {
		width: 44,
		height: 44,
	},
	// Pinned under the status bar (top set inline from insets), opposite the
	// new-chat button.
	navColumn: {
		position: "absolute",
		right: 14,
	},
	navColumnHost: {
		width: 44,
		height: 44 * 4 + 12, // four rows + the capsule's vertical padding
	},
});
