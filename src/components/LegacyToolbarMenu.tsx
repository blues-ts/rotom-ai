import { ActionSheetIOS, Pressable, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { SymbolView, type SFSymbol } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRiverTheme } from "@/constants/theme";

export interface LegacyMenuAction {
	label: string;
	isOn?: boolean;
	/** Leading glyph on the menu-sheet row (no-op in the action sheet). */
	icon?: SFSymbol;
	/** Destructive styling: loss-red row / action-sheet destructive slot. */
	destructive?: boolean;
	onPress: () => void;
}

/**
 * iOS < 26 stand-in for a Stack.Toolbar.Menu in the bottom toolbar: on
 * legacy iOS the native bottom toolbar renders as a bare tinted glyph
 * floating over content (no glass, no touch-target chrome). This renders a
 * frosted-glass FAB pinned bottom-right that opens the same choices as a
 * native action sheet, with the active option check-marked.
 *
 * Render it as a child of the screen's full-size container; on iOS 26 render
 * the real Stack.Toolbar instead.
 */
export function LegacyToolbarMenu({
	icon,
	actions,
}: {
	icon: SFSymbol;
	actions: LegacyMenuAction[];
}) {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();

	const open = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		ActionSheetIOS.showActionSheetWithOptions(
			{
				options: [
					...actions.map((a) => (a.isOn ? `✓ ${a.label}` : a.label)),
					"Cancel",
				],
				cancelButtonIndex: actions.length,
				destructiveButtonIndex: actions.some((a) => a.destructive)
					? actions.findIndex((a) => a.destructive)
					: undefined,
			},
			(index) => {
				if (index != null && index < actions.length) {
					actions[index].onPress();
				}
			},
		);
	};

	return (
		<View
			style={[
				styles.fabWrap,
				{ bottom: insets.bottom + 16 },
				t.glass.shadow ?? undefined,
			]}
		>
			<Pressable
				onPress={open}
				hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
				style={[styles.fabClip, { borderColor: t.glass.elevatedBorder }]}
			>
				<BlurView
					intensity={50}
					tint={t.isDark ? "dark" : "light"}
					style={StyleSheet.absoluteFill}
				/>
				<SymbolView
					name={icon}
					size={19}
					tintColor={t.accentOn}
					weight="medium"
				/>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	// Shadow on the outer view; the inner pressable clips the blur to the
	// circle (overflow hidden would clip the shadow if on one view).
	fabWrap: {
		position: "absolute",
		right: 20,
	},
	fabClip: {
		width: 44,
		height: 44,
		borderRadius: 22,
		borderWidth: 1,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
});
