import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, TextInput } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import { SymbolView, type SFSymbol } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";

import { useRiverTheme } from "@/constants/theme";
import type { LegacyMenuAction } from "@/components/LegacyToolbarMenu";
import { openMenuSheetSlot, updateMenuSheetActions } from "@/lib/menuSheet";

// Our own floating search bar — replaces Stack.SearchBar so there is NO
// UISearchController session at all. That session was the source of every
// search-page chrome bug: it hides nav-bar items, suppresses SwiftUI glass
// hosts, collapses the header on its own schedule, and can't be unfocused
// without native commands. A plain TextInput in a frosted capsule has none
// of those behaviors, works identically on every iOS version, and can embed
// whatever we want — like the trailing sort/filter menu button, which
// presents the shared /menu-sheet route (a NATIVE form sheet, the same
// presentation create-collection and configure use).

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
	/** Presented in the /menu-sheet form sheet from the trailing button. */
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

	// Identifies this bar as the presenter, so republishing below can't stomp
	// on a sheet opened by another screen still mounted in the stack.
	const [slotOwner] = useState(() => Symbol("menuSheet"));

	const openMenu = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		Keyboard.dismiss();
		// Function props can't ride router params — deposit, then present.
		openMenuSheetSlot(slotOwner, menuActions ?? []);
		router.push({
			pathname: "/menu-sheet",
			params: { title: menuTitle ?? "Sort by" },
		});
	};

	// Rows that keep the sheet open need it to re-render against the new sort;
	// the screen rebuilds `menuActions` on that state change, so hand the
	// fresh list over. Ignored unless this bar owns the open sheet.
	useEffect(() => {
		updateMenuSheetActions(slotOwner, menuActions ?? []);
	}, [menuActions, slotOwner]);

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
});
