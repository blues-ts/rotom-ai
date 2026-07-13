import { createContext, useContext, type ReactNode } from "react";
import {
	Pressable,
	StyleSheet,
	View,
	type StyleProp,
	type ViewStyle,
} from "react-native";
import { darkTheme, useRiverTheme } from "@/constants/theme";
import { IOS_MAJOR_VERSION } from "@/lib/platform";

// True while rendering inside a HeaderButtonGroup — the capsule paints the
// glass, so member buttons skip their own circles.
const HeaderGroupContext = createContext(false);

function legacyGlass(forceDark: boolean, t: ReturnType<typeof useRiverTheme>) {
	const glass = forceDark ? darkTheme.glass : t.glass;
	return {
		backgroundColor: glass.sheetFill,
		borderWidth: 1,
		borderColor: glass.elevatedBorder,
	};
}

/**
 * Underlay style for header-bar icon buttons. iOS 26's system bar wraps
 * header items in its own liquid-glass capsule; older iOS renders them bare,
 * so paint the same circle the home screen's floating chrome uses —
 * sheetFill (near-opaque) + elevatedBorder, because without real blur behind
 * it a thin glass tint reads as no underlay at all. On iOS 26 (or inside a
 * HeaderButtonGroup, whose capsule supplies the glass) this is just the
 * 38pt hit target, no decoration. Pass `grouped` when the style is consumed
 * outside the group's render tree (e.g. built in the screen body).
 */
export function useHeaderGlassStyle(
	forceDark = false,
	grouped?: boolean,
): StyleProp<ViewStyle> {
	const t = useRiverTheme();
	const inGroup = useContext(HeaderGroupContext);
	if (IOS_MAJOR_VERSION >= 26 || (grouped ?? inGroup)) return styles.button;
	return [styles.button, legacyGlass(forceDark, t)];
}

export default function HeaderIconButton({
	onPress,
	disabled,
	forceDark,
	style,
	children,
}: {
	onPress?: () => void;
	disabled?: boolean;
	/** Always-dark screens (scanner) keep the dark glass in light mode. */
	forceDark?: boolean;
	style?: StyleProp<ViewStyle>;
	children: ReactNode;
}) {
	const glassStyle = useHeaderGlassStyle(forceDark);
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			hitSlop={6}
			style={[glassStyle, style]}
		>
			{children}
		</Pressable>
	);
}

/**
 * Joins several header buttons into ONE capsule on older iOS (the home
 * screen's grouped-chrome look — one glass around the stack, plain buttons
 * inside). On iOS 26 it's just the row layout; the native bar capsules the
 * whole item group itself.
 */
export function HeaderButtonGroup({
	forceDark = false,
	style,
	children,
}: {
	forceDark?: boolean;
	style?: StyleProp<ViewStyle>;
	children: ReactNode;
}) {
	const t = useRiverTheme();
	return (
		<View
			style={[
				styles.group,
				IOS_MAJOR_VERSION < 26 && legacyGlass(forceDark, t),
				style,
			]}
		>
			<HeaderGroupContext.Provider value={true}>
				{children}
			</HeaderGroupContext.Provider>
		</View>
	);
}

const styles = StyleSheet.create({
	button: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
	},
	group: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 19,
	},
});
