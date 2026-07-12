import { Pressable } from "react-native";
import { Redirect, router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useRiverTheme } from "@/constants/theme";
import { legacyHeaderBlur } from "@/lib/platform";
import { useAuth } from "@clerk/clerk-expo";

export default function SealedLayout() {
	const t = useRiverTheme();
	const { isSignedIn, isLoaded } = useAuth();

	if (!isLoaded) return null;
	if (!isSignedIn) {
		return <Redirect href="/(auth)" />;
	}

	return (
		<Stack
			screenOptions={{
				headerShown: true,
				headerShadowVisible: false,
				headerTransparent: true,
				headerStyle: { backgroundColor: "transparent" },
				...legacyHeaderBlur(t.isDark),
				// Native chrome tinted with the accent per the design system.
				headerTintColor: t.accentOn,
				contentStyle: { backgroundColor: "transparent" },
				headerLeft: () => (
					<Pressable
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							router.back();
						}}
					>
						<SymbolView
							name="xmark"
							size={20}
							tintColor={t.accentOn}
							weight="medium"
						/>
					</Pressable>
				),
				headerRight: () => null,
			}}
		/>
	);
}
