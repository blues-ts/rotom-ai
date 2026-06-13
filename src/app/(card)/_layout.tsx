import { Pressable } from "react-native";
import { Redirect, router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { CardConfigProvider } from "@/context/CardConfigContext";
import { useAuth } from "@clerk/clerk-expo";

export default function CardLayout() {
	const { colors } = useTheme();
	const { isSignedIn, isLoaded } = useAuth();

	if (!isLoaded) return null;
	if (!isSignedIn) {
		return <Redirect href="/(auth)" />;
	}

	return (
		<CardConfigProvider>
			<Stack
				screenOptions={{
					headerShown: true,
					headerShadowVisible: false,
					headerTransparent: true,
					headerStyle: { backgroundColor: "transparent" },
					headerTintColor: colors.foreground,
					contentStyle: { backgroundColor: "transparent" },
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
					headerRight: () => null,
				}}
			>
				<Stack.Screen name="[id]" />
				<Stack.Screen
					name="configure"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.6],
						sheetGrabberVisible: true,
						sheetCornerRadius: 20,
						headerShown: true,
						headerTransparent: false,
						headerTitle: "Configure",
						headerStyle: { backgroundColor: colors.card },
						headerTintColor: colors.foreground,
						headerLeft: () => null,
						contentStyle: { backgroundColor: colors.card },
					}}
				/>
			</Stack>
		</CardConfigProvider>
	);
}
