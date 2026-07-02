import { View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useRiverTheme } from "@/constants/theme";

export default function HomeLayout() {
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
				headerTransparent: false,
				headerShadowVisible: false,
				headerTitle: "",
				// Anything the system tints in this header (pre-26 iOS defaults
				// to blue) follows the theme instead.
				headerTintColor: t.accentOn,
				headerStyle: {
					backgroundColor: "transparent",
				},
				headerBackground: () => (
					<View style={{ backgroundColor: "transparent", flex: 1 }} />
				),
			}}
		/>
	);
}
