import AuthSync from "@/components/AuthSync";
import { queryClient } from "@/config/queryClient";
import { RevenueCatProvider, useRevenueCat } from "@/context/RevenueCatContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { PRO_ENTITLEMENT_ID } from "@/lib/revenuecat";
import { ClerkLoaded, ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider as NavigationThemeProvider,
} from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { router, SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Alert, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import RevenueCatUI from "react-native-purchases-ui";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function AppContent() {
	const { theme, colors } = useTheme();
	const { isPro } = useRevenueCat();

	const navigationTheme = theme === "dark" ? DarkTheme : DefaultTheme;

	return (
		<NavigationThemeProvider
			value={{
				...navigationTheme,
				colors: {
					...navigationTheme.colors,
					background: colors.background,
					card: colors.background,
					text: colors.foreground,
					border: colors.border,
					primary: colors.primary,
				},
			}}
		>
			<AuthSync />
			<StatusBar style={theme === "dark" ? "light" : "dark"} />
			<Stack
				screenOptions={{
					headerShown: false,
					contentStyle: { backgroundColor: colors.background },
				}}
			>
				<Stack.Screen name="index" />
				<Stack.Screen
					name="(onboarding)"
					options={{
						animation: "fade",
						gestureEnabled: false,
					}}
				/>
				<Stack.Screen name="(auth)" options={{ animation: "fade" }} />
				<Stack.Screen
					name="(home)"
					options={{
						animation: "fade",
						headerTitle: "Home",
						headerShown: false,
					}}
				/>
				<Stack.Screen
					name="(collections)"
					options={{
							animation: "slide_from_right",
							headerShown: true,
							headerTitle: "Collections",
							headerBackButtonDisplayMode: "minimal",
							headerStyle: { backgroundColor: colors.background },
							headerTintColor: colors.foreground,
							headerShadowVisible: false,
							headerRight: () => (
								<Pressable
									onPress={() => {
										Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										if (!isPro) {
											Alert.alert(
												"River AI Pro required",
												"Creating collections is a Pro feature. Unlock River AI Pro to keep building your collection.",
												[
													{ text: "Maybe later", style: "cancel" },
													{
														text: "Unlock",
														onPress: () => {
															void RevenueCatUI.presentPaywallIfNeeded({
																requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
															});
														},
													},
												],
											);
											return;
										}
										router.push("/create-collection");
									}}
								>
									<Ionicons name="add" size={26} color={colors.foreground} />
								</Pressable>
							),
					}}
				/>
				<Stack.Screen
					name="collection-detail"
					options={{
						animation: "slide_from_right",
						headerShown: true,
						headerTitle: "",
						headerBackButtonDisplayMode: "minimal",
						headerStyle: { backgroundColor: colors.background },
						headerTintColor: colors.foreground,
						headerShadowVisible: false,
					}}
				/>
				<Stack.Screen
					name="create-collection"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.35],
						sheetGrabberVisible: true,
						sheetCornerRadius: 20,
						headerShown: false,
						contentStyle: { backgroundColor: colors.card },
					}}
				/>
				<Stack.Screen
					name="add-to-collection"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.55, 1.0],
						sheetGrabberVisible: true,
						sheetCornerRadius: 20,
						sheetExpandsWhenScrolledToEdge: true,
						headerShown: false,
						contentStyle: { backgroundColor: colors.card },
					}}
				/>
				<Stack.Screen
					name="(camera)"
					options={{
						presentation: "fullScreenModal",
						headerShown: false,
					}}
				/>
				<Stack.Screen
					name="(search)"
					options={{
						presentation: "fullScreenModal",
						headerShown: false,
					}}
				/>
				<Stack.Screen
					name="(card)"
					options={{
						presentation: "modal",
						headerShown: false,
					}}
				/>
				<Stack.Screen
					name="(settings)"
					options={{
						animation: "slide_from_right",
						headerShown: true,
						headerTitle: "Settings",
						headerBackButtonDisplayMode: "minimal",
						headerStyle: { backgroundColor: colors.background },
						headerTintColor: colors.foreground,
						headerShadowVisible: false,
					}}
				/>
			</Stack>
		</NavigationThemeProvider>
	);
}

export default function RootLayout() {

	if (!publishableKey) {
		throw new Error(
			"Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file",
		);
	}

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<ThemeProvider>
				<KeyboardProvider>
					<QueryClientProvider client={queryClient}>
						<ClerkProvider
							publishableKey={publishableKey}
							tokenCache={tokenCache}
						>
							<ClerkLoaded>
								<RevenueCatProvider>
									<AppContent />
								</RevenueCatProvider>
							</ClerkLoaded>
						</ClerkProvider>
					</QueryClientProvider>
				</KeyboardProvider>
			</ThemeProvider>
		</GestureHandlerRootView>
	);
}
