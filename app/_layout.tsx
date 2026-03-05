import AuthSync from "@/components/AuthSync";
import { queryClient } from "@/config/queryClient";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { ClerkLoaded, ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import {
	Inter_100Thin,
	Inter_200ExtraLight,
	Inter_300Light,
	Inter_400Regular,
	Inter_500Medium,
	Inter_600SemiBold,
	Inter_700Bold,
	Inter_800ExtraBold,
	Inter_900Black,
} from "@expo-google-fonts/inter";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { router, SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import "react-native-reanimated";

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function AppContent() {
	const { isLoaded: isClerkLoaded } = useAuth();
	const { isDark, colors } = useTheme();

	if (!isClerkLoaded) {
		return null;
	}

	return (
		<View style={{ flex: 1 }}>
			<AuthSync />
			<StatusBar style={isDark ? "light" : "dark"} />
			<Stack
				screenOptions={{
					headerShown: false,
					contentStyle: { backgroundColor: colors.background },
					headerTitleStyle: {
						fontFamily: "Inter_400Regular",
					},
				}}
			>
				<Stack.Screen name="index" />
				<Stack.Screen
					name="(onboarding)"
					options={{ animation: "fade" }}
				/>
				<Stack.Screen name="(auth)" options={{ animation: "fade" }} />
				<Stack.Screen
					name="(tabs)"
					options={{
						animation: "fade",
						headerShown: true,
						headerTitle: "",
						headerStyle: { backgroundColor: "transparent" },
						headerTransparent: true,
						headerTintColor: colors.foreground,
						headerRight: () => (
							<Pressable
								onPress={() => router.push("/settings")}
								style={{
									padding: 8,
									minWidth: 44,
									minHeight: 44,
									justifyContent: "center",
									alignItems: "center",
									marginRight: 8,
								}}
							>
								<Ionicons
									name="settings-outline"
									size={22}
									color={colors.foreground}
								/>
							</Pressable>
						),
					}}
				/>
				<Stack.Screen
					name="settings"
					options={{
						animation: "slide_from_right",
						headerShown: true,
						headerTitle: "Settings",
						headerStyle: { backgroundColor: colors.background },
						headerBackTitle: "Back",
						headerTintColor: colors.foreground,
						headerTitleStyle: {
							color: colors.foreground,
							fontWeight: "600",
							fontFamily: "Inter_600SemiBold",
						},
						headerShadowVisible: false,
					}}
				/>
			</Stack>
		</View>
	);
}

function AppProviders() {
	const [loaded, error] = useFonts({
		Inter_100Thin,
		Inter_200ExtraLight,
		Inter_300Light,
		Inter_400Regular,
		Inter_500Medium,
		Inter_600SemiBold,
		Inter_700Bold,
		Inter_800ExtraBold,
		Inter_900Black,
		...FontAwesome.font,
	});

	const [fontsReady, setFontsReady] = useState(false);

	useEffect(() => {
		if (loaded || error) {
			SplashScreen.hideAsync()
				.then(() => setFontsReady(true))
				.catch(() => setFontsReady(true));
		}
	}, [loaded, error]);

	if (!fontsReady) {
		return null;
	}

	if (!publishableKey) {
		throw new Error(
			"Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file",
		);
	}

	return (
		<QueryClientProvider client={queryClient}>
			<ClerkProvider
				publishableKey={publishableKey}
				tokenCache={tokenCache}
			>
				<ClerkLoaded>
					<AppContent />
				</ClerkLoaded>
			</ClerkProvider>
		</QueryClientProvider>
	);
}

export default function RootLayout() {
	return (
		<ThemeProvider>
			<AppProviders />
		</ThemeProvider>
	);
}
