import { Pressable } from "react-native";
import { Redirect, router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useRiverTheme } from "@/constants/theme";
import { legacyHeaderBlur } from "@/lib/platform";
import { CardConfigProvider } from "@/context/CardConfigContext";
import { useAuth } from "@clerk/clerk-expo";

export default function CardLayout() {
	const t = useRiverTheme();
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
					...legacyHeaderBlur(t.isDark),
					// Native chrome tinted with the accent per the design system.
					headerTintColor: t.accentOn,
					contentStyle: { backgroundColor: "transparent" },
					headerLeft: () => (
						<Pressable
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								router.back();
							}}
						>
							<SymbolView
								name="xmark"
								size={20}
								tintColor={t.accentOn}
								weight="medium"
							/>
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
						sheetAllowedDetents: [0.6, 1.0],
						sheetExpandsWhenScrolledToEdge: true,
						sheetGrabberVisible: true,
						// Bottom sheets get the larger 28pt top radius.
						sheetCornerRadius: 28,
						headerShown: true,
						headerTransparent: false,
						headerTitle: "Configure",
						headerStyle: { backgroundColor: t.glass.sheetFill },
						headerTintColor: t.text.primary,
						headerLeft: () => null,
						contentStyle: { backgroundColor: t.glass.sheetFill },
					}}
				/>
			</Stack>
		</CardConfigProvider>
	);
}
