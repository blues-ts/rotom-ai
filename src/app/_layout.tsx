import AuthSync from "@/components/AuthSync";
import { usePrefetchExpansions } from "@/hooks/usePrefetchExpansions";
import { queryClient } from "@/config/queryClient";
import {
	createQueryPersister,
	QUERY_CACHE_BUSTER,
	QUERY_CACHE_MAX_AGE,
} from "@/config/storage";
import { RevenueCatProvider, useRevenueCat } from "@/context/RevenueCatContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { ScanSessionProvider } from "@/context/ScanSessionContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import { ClerkLoaded, ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider as NavigationThemeProvider,
} from "expo-router/react-navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
	router,
	SplashScreen,
	Stack,
	type ErrorBoundaryProps,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
	initialWindowMetrics,
	SafeAreaProvider,
} from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

// Hardcoded colors: this can render outside ThemeProvider when the root errors.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
	if (__DEV__) {
		console.error("[ErrorBoundary]", error);
	}

	return (
		<View style={errorStyles.container}>
			<Text style={errorStyles.title}>Something went wrong</Text>
			<Text style={errorStyles.subtitle}>
				An unexpected error occurred. Please try again.
			</Text>
			<Pressable style={errorStyles.button} onPress={retry}>
				<Text style={errorStyles.buttonText}>Try Again</Text>
			</Pressable>
		</View>
	);
}

const errorStyles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
		gap: 10,
		backgroundColor: "#000000",
	},
	title: {
		fontSize: 20,
		fontWeight: "700",
		color: "#e7e9ea",
	},
	subtitle: {
		fontSize: 15,
		textAlign: "center",
		lineHeight: 21,
		color: "#8b8f94",
	},
	button: {
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 12,
		marginTop: 8,
		backgroundColor: "#1c9cf0",
	},
	buttonText: {
		fontSize: 15,
		fontWeight: "600",
		color: "#ffffff",
	},
});

function AppContent() {
	const { theme, colors } = useTheme();
	const { isPro } = useRevenueCat();

	// Warm the expansions list + set logos in the background at launch.
	usePrefetchExpansions();

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
							headerTransparent: true,
							headerStyle: { backgroundColor: "transparent" },
							headerTintColor: colors.foreground,
							headerShadowVisible: false,
							headerRight: () => (
								<Pressable
									onPress={() => {
										Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										if (!isPro) {
											void presentProPaywallIfNeeded();
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
						headerTransparent: true,
						headerStyle: { backgroundColor: "transparent" },
						headerTintColor: colors.foreground,
						headerShadowVisible: false,
					}}
				/>
				<Stack.Screen
					name="set-detail"
					options={{
						animation: "slide_from_right",
						headerShown: true,
						headerTitle: "",
						headerBackButtonDisplayMode: "minimal",
						headerTransparent: true,
						headerStyle: { backgroundColor: "transparent" },
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
					name="(sealed)"
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
	// Persist the React Query cache to MMKV so cold starts paint from disk. Null
	// when the native module isn't present yet (runs without persistence then).
	const persister = React.useMemo(() => createQueryPersister(), []);

	if (!publishableKey) {
		throw new Error(
			"Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file",
		);
	}

	const tree = (
		<ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
			<ClerkLoaded>
				<RevenueCatProvider>
					<ToastProvider>
						<ScanSessionProvider>
							<AppContent />
						</ScanSessionProvider>
					</ToastProvider>
				</RevenueCatProvider>
			</ClerkLoaded>
		</ClerkProvider>
	);

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			{/* initialMetrics from a synchronous native constant — without it,
			    useSafeAreaInsets() returns 0 on the first frame and jumps to the
			    real inset a frame later, making header-offset content pop down. */}
			<SafeAreaProvider initialMetrics={initialWindowMetrics}>
				<ThemeProvider>
					<KeyboardProvider>
						{persister ? (
							<PersistQueryClientProvider
								client={queryClient}
								persistOptions={{
									persister,
									maxAge: QUERY_CACHE_MAX_AGE,
									buster: QUERY_CACHE_BUSTER,
								}}
							>
								{tree}
							</PersistQueryClientProvider>
						) : (
							<QueryClientProvider client={queryClient}>
								{tree}
							</QueryClientProvider>
						)}
					</KeyboardProvider>
				</ThemeProvider>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}
