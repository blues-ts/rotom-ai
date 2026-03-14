import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useTheme } from "@/context/ThemeContext";

export default function SearchLayout() {
	const { isSignedIn, isLoaded } = useAuth();
	const { colors } = useTheme();

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
				headerStyle: { backgroundColor: colors.background },
				headerTintColor: colors.foreground,
			}}
		/>
	);
}
