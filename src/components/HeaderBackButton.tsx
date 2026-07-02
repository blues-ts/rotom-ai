import { Pressable } from "react-native";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useRiverTheme } from "@/constants/theme";

/**
 * Accent-tinted back chevron for stack headers. The native iOS 26 Liquid
 * Glass back button ignores `headerTintColor` (react-native-screens 4.25.2),
 * so screens render this as `headerLeft` instead — the system bar still
 * wraps it in the glass capsule, matching custom headerRight items.
 */
export function HeaderBackButton() {
	const t = useRiverTheme();
	return (
		<Pressable
			hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
			onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				router.back();
			}}
		>
			<SymbolView
				name="chevron.backward"
				size={20}
				tintColor={t.accentOn}
				weight="semibold"
			/>
		</Pressable>
	);
}
