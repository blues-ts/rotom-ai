import { Redirect, Stack } from "expo-router";

import { useAuth } from "@clerk/clerk-expo";

export default function HomeLayout() {
	const { isSignedIn, isLoaded } = useAuth();

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
				headerTitle: "River",
				headerTitleStyle: { fontSize: 20, fontWeight: "700" },
			}}
		/>
	);
}
