import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";

export default function VendorLayout() {
	const { isSignedIn, isLoaded } = useAuth();

	if (!isLoaded) return null;
	if (!isSignedIn) {
		return <Redirect href="/(auth)" />;
	}

	return <Stack screenOptions={{ headerShown: false }} />;
}
