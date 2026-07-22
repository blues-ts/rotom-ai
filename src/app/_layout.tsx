import AuthSync from "@/components/AuthSync";
import { HeaderBackButton } from "@/components/HeaderBackButton";
import { SheetDoneButton } from "@/components/SheetDoneButton";
import { usePrefetchExpansions } from "@/hooks/usePrefetchExpansions";
import { queryClient } from "@/config/queryClient";
import {
	createQueryPersister,
	HEAVY_QUERY_KEYS,
	QUERY_CACHE_BUSTER,
	QUERY_CACHE_MAX_AGE,
} from "@/config/storage";
import { RevenueCatProvider, useRevenueCat } from "@/context/RevenueCatContext";
import { ColorwayProvider } from "@/context/ColorwayContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { ScanSessionProvider } from "@/context/ScanSessionContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import { useVendingEnabled } from "@/lib/vendorPrefs";
import { maybeRunSqliteBenchmarkFromFlag } from "@/lib/devPerfBench";
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
import { SymbolView } from "expo-symbols";
import { LinearGradient } from "expo-linear-gradient";
import { radius, useRiverTheme } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import HeaderIconButton, {
	HeaderButtonGroup,
} from "@/components/HeaderIconButton";
import {
	initialWindowMetrics,
	SafeAreaProvider,
} from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

// This can render when providers have crashed, so it only leans on
// useRiverTheme (useColorScheme + a context with a safe River default, so it
// works unprovided) and module imports — no ThemeProvider, toasts, or
// CardPressable.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
	const t = useRiverTheme();
	if (__DEV__) {
		console.error("[ErrorBoundary]", error);
	}

	return (
		<View style={errorStyles.container}>
			<LinearGradient
				colors={t.background.colors}
				locations={t.background.locations}
				pointerEvents="none"
				style={StyleSheet.absoluteFill}
			/>
			<View
				style={[errorStyles.iconChip, { backgroundColor: t.accentIconFill }]}
			>
				<SymbolView
					name="exclamationmark.triangle.fill"
					size={30}
					tintColor={t.accentOn}
					weight="semibold"
				/>
			</View>
			<Text style={[errorStyles.title, { color: t.text.primary }]}>
				Something went wrong
			</Text>
			<Text style={[errorStyles.subtitle, { color: t.text.secondary }]}>
				An unexpected error occurred. Please try again.
			</Text>
			{__DEV__ ? (
				<View
					style={[
						errorStyles.detailCard,
						{
							backgroundColor: t.glass.surfaceFill,
							borderColor: t.glass.surfaceBorder,
						},
					]}
				>
					<Text
						style={[errorStyles.detailText, { color: t.text.secondary }]}
						numberOfLines={8}
					>
						{error.message}
					</Text>
				</View>
			) : null}
			<Pressable
				onPress={() => {
					Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					retry();
				}}
				style={({ pressed }) => [
					errorStyles.button,
					{ backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
					t.buttonGlow,
				]}
			>
				<SymbolView
					name="arrow.clockwise"
					size={15}
					tintColor="#FFFFFF"
					weight="semibold"
				/>
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
	},
	iconChip: {
		width: 64,
		height: 64,
		borderRadius: 32,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 6,
	},
	title: {
		fontSize: 20,
		fontWeight: "700",
	},
	subtitle: {
		fontSize: 15,
		textAlign: "center",
		lineHeight: 21,
	},
	// Dev-only: the actual error, so a crash in the sim is debuggable
	// without digging through Metro logs.
	detailCard: {
		borderRadius: radius.tile,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 10,
		marginTop: 6,
		maxWidth: "100%",
	},
	detailText: {
		fontSize: 12,
		lineHeight: 17,
		fontFamily: "Menlo",
	},
	button: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 22,
		paddingVertical: 13,
		borderRadius: radius.pill,
		marginTop: 10,
	},
	buttonText: {
		fontSize: 15,
		fontWeight: "700",
		color: "#FFFFFF",
	},
});

function AppContent() {
	const { theme, colors } = useTheme();
	const t = useRiverTheme();
	const { isPro } = useRevenueCat();
	const vendingEnabled = useVendingEnabled();

	// Warm the expansions list + set logos in the background at launch.
	usePrefetchExpansions();

	// Dev-only: host-triggered SQLite benchmark (see devPerfBench).
	React.useEffect(() => {
		if (__DEV__) void maybeRunSqliteBenchmarkFromFlag();
	}, []);

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
					// Native chrome (back chevrons, untinted bar items) falls back
					// to the theme primary — keep it on the design-system accent.
					primary: t.accentOn,
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
							headerTintColor: t.accentOn,
							headerShadowVisible: false,
							headerLeft: () => <HeaderBackButton />,
							headerRight: () => (
								<HeaderButtonGroup>
									{/* Vending shelf lives beside the add button — the
									    vendor tool's nav entry point. Hidden by the
									    Settings toggle; the flow itself is Pro. */}
									{vendingEnabled && (
										<HeaderIconButton
											onPress={() => {
												Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
												if (!isPro) {
													void presentProPaywallIfNeeded();
													return;
												}
												router.push("/(vendor)");
											}}
										>
											<SymbolView
												name="storefront"
												size={20}
												tintColor={t.accentOn}
												weight="medium"
											/>
										</HeaderIconButton>
									)}
									<HeaderIconButton
										onPress={() => {
											Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
											if (!isPro) {
												void presentProPaywallIfNeeded();
												return;
											}
											router.push("/create-collection");
										}}
									>
										<SymbolView
											name="plus"
											size={22}
											tintColor={t.accentOn}
											weight="medium"
										/>
									</HeaderIconButton>
								</HeaderButtonGroup>
							),
					}}
				/>
				<Stack.Screen
					name="(favorites)"
					options={{
						// Header (and its dynamic Select/Cancel buttons) is drawn by
						// the inner (favorites) stack, like (search) — so the screen can
						// override headerRight/headerLeft from selection state.
						animation: "slide_from_right",
						headerShown: false,
					}}
				/>
				<Stack.Screen
					name="(vendor)"
					options={{
						animation: "slide_from_right",
						headerShown: true,
						headerTitle: "Vending",
						headerBackButtonDisplayMode: "minimal",
						headerTransparent: true,
						headerStyle: { backgroundColor: "transparent" },
						headerTintColor: t.accentOn,
						headerShadowVisible: false,
						headerLeft: () => <HeaderBackButton />,
						// Search and scan side by side — both roads onto the shelf end
						// at the add sheet's Vending row.
						headerRight: () => (
							<HeaderButtonGroup>
								<HeaderIconButton
									onPress={() => {
										Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										router.push("/(search)");
									}}
								>
									<SymbolView
										name="magnifyingglass"
										size={20}
										tintColor={t.accentOn}
										weight="medium"
									/>
								</HeaderIconButton>
								<HeaderIconButton
									onPress={() => {
										Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										// Scanning is Pro — same gate as every other entry.
										if (!isPro) {
											void presentProPaywallIfNeeded();
											return;
										}
										router.push("/(camera)");
									}}
								>
									<SymbolView
										name="camera.viewfinder"
										size={20}
										tintColor={t.accentOn}
										weight="medium"
									/>
								</HeaderIconButton>
								{/* New group — same form-sheet pattern as the
								    collections header's plus. */}
								<HeaderIconButton
									onPress={() => {
										Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										router.push("/create-vendor-group");
									}}
								>
									<SymbolView
										name="plus"
										size={22}
										tintColor={t.accentOn}
										weight="medium"
									/>
								</HeaderIconButton>
							</HeaderButtonGroup>
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
						headerTintColor: t.accentOn,
						headerShadowVisible: false,
						headerLeft: () => <HeaderBackButton />,
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
						headerTintColor: t.accentOn,
						headerShadowVisible: false,
					}}
				/>
				<Stack.Screen
					name="pokemon-cards"
					options={{
						animation: "slide_from_right",
						headerShown: true,
						headerTitle: "",
						headerBackButtonDisplayMode: "minimal",
						headerTransparent: true,
						headerStyle: { backgroundColor: "transparent" },
						headerTintColor: t.accentOn,
						headerShadowVisible: false,
					}}
				/>
				<Stack.Screen
					name="create-collection"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.35],
						sheetGrabberVisible: true,
						// Bottom sheets get the larger 28pt top radius.
						sheetCornerRadius: 28,
						headerShown: true,
						headerTransparent: false,
						headerTitle: "New Collection",
						headerStyle: { backgroundColor: t.glass.sheetFill },
						headerTintColor: t.text.primary,
						headerShadowVisible: false,
						headerLeft: () => null,
						contentStyle: { backgroundColor: t.glass.sheetFill },
					}}
				/>
				<Stack.Screen
					name="add-to-collection"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.55, 1.0],
						sheetGrabberVisible: true,
						// Bottom sheets get the larger 28pt top radius.
						sheetCornerRadius: 28,
						sheetExpandsWhenScrolledToEdge: true,
						headerShown: true,
						headerTransparent: false,
						headerTitle: "Add to Collection",
						headerStyle: { backgroundColor: t.glass.sheetFill },
						headerTintColor: t.text.primary,
						headerShadowVisible: false,
						headerLeft: () => null,
						headerRight: () => <SheetDoneButton />,
						contentStyle: { backgroundColor: t.glass.sheetFill },
					}}
				/>
				<Stack.Screen
					name="menu-sheet"
					options={({ route }) => ({
						presentation: "formSheet",
						sheetAllowedDetents: "fitToContents",
						sheetGrabberVisible: true,
						// Bottom sheets get the larger 28pt top radius.
						sheetCornerRadius: 28,
						headerShown: true,
						headerTransparent: false,
						headerTitle:
							(route.params as { title?: string } | undefined)?.title ??
							"Sort by",
						headerStyle: { backgroundColor: t.glass.sheetFill },
						headerTintColor: t.text.primary,
						headerShadowVisible: false,
						headerLeft: () => null,
						headerRight: () => <SheetDoneButton />,
						contentStyle: { backgroundColor: t.glass.sheetFill },
					})}
				/>
				<Stack.Screen
					name="create-vendor-group"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.35],
						sheetGrabberVisible: true,
						// Bottom sheets get the larger 28pt top radius.
						sheetCornerRadius: 28,
						headerShown: true,
						headerTransparent: false,
						headerTitle: "New Group",
						headerStyle: { backgroundColor: t.glass.sheetFill },
						headerTintColor: t.text.primary,
						headerShadowVisible: false,
						headerLeft: () => null,
						contentStyle: { backgroundColor: t.glass.sheetFill },
					}}
				/>
				<Stack.Screen
					name="vendor-shelf"
					options={{
						animation: "slide_from_right",
						headerShown: true,
						// Title + headerRight come from the screen (live group name).
						headerTitle: "",
						headerBackButtonDisplayMode: "minimal",
						headerTransparent: true,
						headerStyle: { backgroundColor: "transparent" },
						headerTintColor: t.accentOn,
						headerShadowVisible: false,
						headerLeft: () => <HeaderBackButton />,
					}}
				/>
				<Stack.Screen
					name="vendor-group-sheet"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: "fitToContents",
						sheetGrabberVisible: true,
						// Bottom sheets get the larger 28pt top radius.
						sheetCornerRadius: 28,
						headerShown: true,
						headerTransparent: false,
						headerTitle: "Move to Group",
						headerStyle: { backgroundColor: t.glass.sheetFill },
						headerTintColor: t.text.primary,
						headerShadowVisible: false,
						headerLeft: () => null,
						headerRight: () => <SheetDoneButton />,
						contentStyle: { backgroundColor: t.glass.sheetFill },
					}}
				/>
				<Stack.Screen
					name="vendor-item-sheet"
					options={({ route }) => ({
						presentation: "formSheet",
						sheetAllowedDetents: "fitToContents",
						sheetGrabberVisible: true,
						// Bottom sheets get the larger 28pt top radius.
						sheetCornerRadius: 28,
						headerShown: true,
						headerTransparent: false,
						// The tapped card's name rides in as the title.
						headerTitle:
							(route.params as { title?: string } | undefined)?.title ??
							"Card",
						headerStyle: { backgroundColor: t.glass.sheetFill },
						headerTintColor: t.text.primary,
						headerShadowVisible: false,
						headerLeft: () => null,
						headerRight: () => <SheetDoneButton />,
						contentStyle: { backgroundColor: t.glass.sheetFill },
					})}
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
						headerTransparent: true,
						headerStyle: { backgroundColor: "transparent" },
						headerTintColor: t.accentOn,
						headerShadowVisible: false,
						headerLeft: () => <HeaderBackButton />,
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
				<ColorwayProvider>
					<ThemeProvider>
						<KeyboardProvider>
							{persister ? (
								<PersistQueryClientProvider
									client={queryClient}
									persistOptions={{
										persister,
										maxAge: QUERY_CACHE_MAX_AGE,
										buster: QUERY_CACHE_BUSTER,
										dehydrateOptions: {
											// Whole-card-list payloads (up to ~1000 full card
											// objects each) are cheap to refetch but expensive
											// to deserialize on EVERY cold start — keep them
											// in-memory only.
											shouldDehydrateQuery: (query) =>
												query.state.status === "success" &&
												!HEAVY_QUERY_KEYS.has(String(query.queryKey[0])),
										},
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
				</ColorwayProvider>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}
