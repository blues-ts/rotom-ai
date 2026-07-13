import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useRiverTheme } from "@/constants/theme";
import HeaderIconButton from "@/components/HeaderIconButton";

/**
 * Accent-tinted back chevron for stack headers. The native iOS 26 Liquid
 * Glass back button ignores `headerTintColor` (react-native-screens 4.25.2),
 * so screens render this as `headerLeft` instead — the system bar still
 * wraps it in the glass capsule, matching custom headerRight items.
 * HeaderIconButton supplies the equivalent circle underlay on older iOS.
 */
export function HeaderBackButton() {
	const t = useRiverTheme();
	return (
		<HeaderIconButton
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
		</HeaderIconButton>
	);
}
