import { useRef, useState } from "react";
import {
	Keyboard,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import Animated, {
	Easing,
	FadeIn,
	FadeOut,
	runOnJS,
	runOnUI,
	SlideInDown,
	SlideOutDown,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import {
	Gesture,
	GestureDetector,
	GestureHandlerRootView,
} from "react-native-gesture-handler";
import { BlurView } from "expo-blur";
import { SymbolView, type SFSymbol } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";

import { useRiverTheme } from "@/constants/theme";
import type { LegacyMenuAction } from "@/components/LegacyToolbarMenu";

// Our own floating search bar — replaces Stack.SearchBar so there is NO
// UISearchController session at all. That session was the source of every
// search-page chrome bug: it hides nav-bar items, suppresses SwiftUI glass
// hosts, collapses the header on its own schedule, and can't be unfocused
// without native commands. A plain TextInput in a frosted capsule has none
// of those behaviors, works identically on every iOS version, and can embed
// whatever we want — like the trailing sort/filter menu button.

const BAR_HEIGHT = 50;

export default function FloatingSearchBar({
	value,
	onChangeText,
	placeholder,
	menuIcon,
	menuActions,
	menuTitle,
}: {
	value: string;
	onChangeText: (text: string) => void;
	placeholder: string;
	/** Trailing menu button glyph (defaults to the filter funnel). */
	menuIcon?: SFSymbol;
	/** Presented in a bottom form sheet from the embedded trailing button. */
	menuActions?: LegacyMenuAction[];
	/** Sheet heading above the options. */
	menuTitle?: string;
}) {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const inputRef = useRef<TextInput>(null);
	const restingBottom = insets.bottom + 12;

	// Ride the keyboard: RNKC's height is 0 at rest and -keyboardHeight when
	// open, so this lifts the bar to sit 8pt above the keyboard's top edge.
	const { height: kbHeight } = useReanimatedKeyboardAnimation();
	const rideStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateY: Math.min(0, kbHeight.value + restingBottom - 8) },
		],
	}));

	// Sheet close is two-phase so the slide-out plays before the Modal
	// unmounts (Modal kills exiting animations otherwise).
	const [modalVisible, setModalVisible] = useState(false);
	const [sheetShown, setSheetShown] = useState(false);
	// Drag-to-dismiss: the sheet follows a downward drag; past the threshold
	// (or on a flick) it dismisses, otherwise it springs back. UI-thread
	// owned, so resets go through runOnUI.
	const sheetDragY = useSharedValue(0);
	const openMenu = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		Keyboard.dismiss();
		runOnUI(() => {
			sheetDragY.value = 0;
		})();
		setModalVisible(true);
		setSheetShown(true);
	};
	const closeMenu = () => {
		setSheetShown(false);
		setTimeout(() => setModalVisible(false), 240);
	};
	const sheetPan = Gesture.Pan()
		// Vertical-only intent, downward — option taps stay taps.
		.activeOffsetY(10)
		.onUpdate((e) => {
			sheetDragY.value = Math.max(0, e.translationY);
		})
		.onEnd((e) => {
			if (e.translationY > 80 || e.velocityY > 800) {
				runOnJS(closeMenu)();
			} else {
				sheetDragY.value = withSpring(0, {
					stiffness: 380,
					damping: 30,
					mass: 0.7,
				});
			}
		});
	const sheetDragStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: sheetDragY.value }],
	}));

	return (
		<Animated.View
			style={[styles.wrap, { bottom: restingBottom }, rideStyle]}
			pointerEvents="box-none"
		>
			<BlurView
				intensity={40}
				tint={t.isDark ? "dark" : "light"}
				style={[
					styles.capsule,
					{
						borderColor: t.glass.surfaceBorder,
						backgroundColor: t.glass.elevatedFill,
					},
				]}
			>
				{/* The whole capsule focuses the input, not just the text area. */}
				<Pressable
					style={styles.inputArea}
					onPress={() => inputRef.current?.focus()}
				>
					<SymbolView
						name="magnifyingglass"
						size={17}
						tintColor={t.text.secondary}
						weight="medium"
					/>
					<TextInput
						ref={inputRef}
						style={[styles.input, { color: t.text.primary }]}
						value={value}
						onChangeText={onChangeText}
						placeholder={placeholder}
						placeholderTextColor={t.text.secondary}
						returnKeyType="search"
						autoCorrect={false}
						autoCapitalize="none"
						clearButtonMode="never"
					/>
				</Pressable>
				{value.length > 0 && (
					<Pressable
						hitSlop={8}
						onPress={() => {
							Haptics.selectionAsync();
							onChangeText("");
						}}
					>
						<SymbolView
							name="xmark.circle.fill"
							size={18}
							tintColor={t.text.tertiary}
						/>
					</Pressable>
				)}
				{menuActions && menuActions.length > 0 && (
					<Pressable hitSlop={8} onPress={openMenu} style={styles.menuButton}>
						<SymbolView
							name={menuIcon ?? "line.3.horizontal.decrease.circle"}
							size={22}
							tintColor={t.accentOn}
							weight="medium"
						/>
					</Pressable>
				)}
			</BlurView>

			{/* Sort/filter options in a bottom form sheet — the app's sheet
			    language (sheetFill, 28pt lip, grabber) instead of a system
			    action sheet. */}
			<Modal
				transparent
				visible={modalVisible}
				animationType="none"
				onRequestClose={closeMenu}
			>
				{/* Gesture handlers need their own root inside an RN Modal. */}
				<GestureHandlerRootView style={styles.modalRoot}>
				{sheetShown && (
					<>
						<Animated.View
							entering={FadeIn.duration(200)}
							exiting={FadeOut.duration(200)}
							style={styles.backdrop}
						>
							<Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
						</Animated.View>
						<GestureDetector gesture={sheetPan}>
						<Animated.View
							entering={SlideInDown.duration(320).easing(
								Easing.out(Easing.cubic),
							)}
							exiting={SlideOutDown.duration(240).easing(
								Easing.in(Easing.cubic),
							)}
							style={[
								styles.sheet,
								sheetDragStyle,
								{
									backgroundColor: t.glass.sheetFill,
									borderColor: t.glass.surfaceBorder,
									paddingBottom: insets.bottom + 16,
								},
							]}
						>
							<View style={styles.grabber} />
							<Text style={[styles.sheetTitle, { color: t.text.secondary }]}>
								{menuTitle ?? "Sort by"}
							</Text>
							{menuActions?.map((a) => (
								<Pressable
									key={a.label}
									style={({ pressed }) => [
										styles.optionRow,
										pressed && { backgroundColor: t.glass.elevatedFill },
									]}
									onPress={() => {
										Haptics.selectionAsync();
										// Dismiss FIRST, apply AFTER the slide-out: sort
										// changes can remount a heavy grid, and doing that
										// synchronously starved the exit animation (laggy
										// slide, or a hard cut past the modal-hide timeout).
										closeMenu();
										setTimeout(() => a.onPress(), 260);
									}}
								>
									<Text
										style={[
											styles.optionLabel,
											{
												color: a.isOn ? t.text.primary : t.text.body,
												fontWeight: a.isOn ? "700" : "500",
											},
										]}
									>
										{a.label}
									</Text>
									{a.isOn && (
										<SymbolView
											name="checkmark"
											size={15}
											tintColor={t.accent}
											weight="semibold"
										/>
									)}
								</Pressable>
							))}
						</Animated.View>
						</GestureDetector>
					</>
				)}
				</GestureHandlerRootView>
			</Modal>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		position: "absolute",
		left: 16,
		right: 16,
		zIndex: 20,
	},
	capsule: {
		height: BAR_HEIGHT,
		borderRadius: BAR_HEIGHT / 2,
		borderWidth: 1,
		overflow: "hidden",
		flexDirection: "row",
		alignItems: "center",
		paddingLeft: 16,
		paddingRight: 12,
		gap: 8,
	},
	inputArea: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		alignSelf: "stretch",
	},
	input: {
		flex: 1,
		fontSize: 16,
		paddingVertical: 0,
	},
	menuButton: {
		paddingLeft: 2,
	},
	modalRoot: {
		flex: 1,
	},
	backdrop: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0,0,0,0.5)",
	},
	sheet: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 8,
	},
	grabber: {
		alignSelf: "center",
		width: 36,
		height: 5,
		borderRadius: 2.5,
		backgroundColor: "rgba(255,255,255,0.25)",
		marginBottom: 12,
	},
	sheetTitle: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 1,
		textTransform: "uppercase",
		paddingHorizontal: 20,
		marginBottom: 6,
	},
	optionRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingVertical: 14,
	},
	optionLabel: {
		fontSize: 16,
	},
});
