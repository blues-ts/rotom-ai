import { Pressable } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect, router, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

export default function CameraLayout() {
	const { colors } = useTheme();
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
				headerTintColor: colors.foreground,
				headerTitle: "",
				contentStyle: { backgroundColor: colors.background },
				headerLeft: () => (
					<Pressable
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							router.back();
						}}
					>
						<Ionicons name="close" size={24} color="#fff" />
					</Pressable>
				),
			}}
		>
			<Stack.Screen
				name="scanner-tips"
				options={{
					presentation: "formSheet",
					sheetAllowedDetents: [0.6, 1.0],
					sheetGrabberVisible: true,
					sheetCornerRadius: 20,
					headerShown: true,
					headerTransparent: false,
					headerStyle: { backgroundColor: colors.card },
					headerTintColor: colors.foreground,
					headerShadowVisible: false,
					headerLeft: () => null,
					contentStyle: { backgroundColor: colors.card },
				}}
			/>
		</Stack>
	);
}
