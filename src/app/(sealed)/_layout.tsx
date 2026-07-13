import { Redirect, router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useRiverTheme } from "@/constants/theme";
import { useAuth } from "@clerk/clerk-expo";
import HeaderIconButton from "@/components/HeaderIconButton";

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
				// Native chrome tinted with the accent per the design system.
				headerTintColor: t.accentOn,
				contentStyle: { backgroundColor: "transparent" },
				headerLeft: () => (
					<HeaderIconButton
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
					</HeaderIconButton>
				),
				headerRight: () => null,
			}}
		/>
	);
}
