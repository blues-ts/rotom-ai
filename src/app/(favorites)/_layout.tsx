import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";
import { useRiverTheme } from "@/constants/theme";
import { HeaderBackButton } from "@/components/HeaderBackButton";

export default function FavoritesLayout() {
	const { isSignedIn, isLoaded } = useAuth();
	const t = useRiverTheme();

	if (!isLoaded) return null;
	if (!isSignedIn) {
		return <Redirect href="/(auth)" />;
	}

	return (
		<Stack
			// Header is drawn here (not the root stack) so the index screen can
			// swap headerRight/headerLeft from selection state, the way (search)
			// overrides its own header.
			screenOptions={{
				headerShown: true,
				headerTitle: "Favorites",
				headerBackButtonDisplayMode: "minimal",
				headerTransparent: true,
				headerStyle: { backgroundColor: "transparent" },
				headerTintColor: t.accentOn,
				headerShadowVisible: false,
				headerLeft: () => <HeaderBackButton />,
			}}
		/>
	);
}
