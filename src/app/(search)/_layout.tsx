import { Pressable } from "react-native";
import { Redirect, router, Stack } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
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
				headerLeft: () => (
					<Pressable
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							router.back();
						}}
					>
						<Ionicons name="close" size={24} color={colors.foreground} />
					</Pressable>
				),
			}}
		/>
	);
}
