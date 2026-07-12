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
			// No nav bar at all — its scroll-edge effect dimmed everything outside
			// the bar. The new-chat and nav buttons float as glass over the screen
			// itself, and the transcript owns the full height.
			screenOptions={{
				headerShown: false,
			}}
		/>
	);
}
