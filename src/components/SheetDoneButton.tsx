import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useTheme } from "@/context/ThemeContext";

/**
 * The shared confirm/dismiss button for form-sheet headers. Every form sheet
 * uses the same centered native title with this checkmark on the right, so the
 * design stays consistent. Defaults to dismissing the sheet; pass `onPress` for
 * sheets whose checkmark commits an action (e.g. create), and `disabled` to gate
 * it (the icon dims to the muted color).
 */
export function SheetDoneButton({
	onPress,
	disabled = false,
}: {
	onPress?: () => void;
	disabled?: boolean;
}) {
	const { colors } = useTheme();
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
			<Ionicons
				name="checkmark"
				size={26}
				color={disabled ? colors.mutedForeground : colors.primary}
			/>
		</Pressable>
	);
}
