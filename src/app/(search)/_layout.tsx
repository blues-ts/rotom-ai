import { Pressable } from "react-native";
import { Redirect, router, Stack } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useRiverTheme } from "@/constants/theme";

export default function SearchLayout() {
	const { isSignedIn, isLoaded } = useAuth();
	const t = useRiverTheme();

	if (!isLoaded) {
		return null;
	}

	if (!isSignedIn) {
		return <Redirect href="/(auth)" />;
	}

	return (
		<Stack
			screenOptions={{
				headerShown: true,
				headerTitle: "Search",
				headerShadowVisible: false,
				headerTransparent: true,
				headerStyle: { backgroundColor: "transparent" },
				// Native chrome tinted with the accent per the design system.
				headerTintColor: t.accentOn,
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
			}}
		/>
	);
}
