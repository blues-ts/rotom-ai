import { Pressable } from "react-native";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useRiverTheme } from "@/constants/theme";

/**
 * The shared confirm/dismiss button for form-sheet headers. On iOS 26 the
 * navigation bar wraps bar items in its own Liquid Glass capsule, so this
 * renders ONLY an accent checkmark — the system capsule provides the circle
 * (drawing our own filled circle doubles the chrome and gets clipped by the
 * bar height). Defaults to dismissing the sheet; pass `onPress` for sheets
 * whose checkmark commits an action (e.g. create), and `disabled` to gate it
 * (the checkmark dims).
 */
export function SheetDoneButton({
	onPress,
	disabled = false,
}: {
	onPress?: () => void;
	disabled?: boolean;
}) {
	const t = useRiverTheme();
	return (
		<Pressable
			hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
			disabled={disabled}
			onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				if (onPress) onPress();
				else router.back();
			}}
		>
			<SymbolView
				name="checkmark"
				size={18}
				tintColor={disabled ? t.text.tertiary : t.accentOn}
				weight="semibold"
			/>
		</Pressable>
	);
}
