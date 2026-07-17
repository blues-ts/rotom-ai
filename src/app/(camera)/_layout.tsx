import { useRiverDarkTheme } from "@/constants/theme";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect, router, Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import HeaderIconButton from "@/components/HeaderIconButton";

export default function CameraLayout() {
	// The scanner is always dark; this still follows the Appearance colorway.
	const t = useRiverDarkTheme();
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
				// Always the dark material — the scanner stays dark in light mode.
				headerTintColor: t.accentOn,
				headerTitle: "",
				contentStyle: { backgroundColor: "transparent" },
				headerLeft: () => (
					<HeaderIconButton
						forceDark
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							router.back();
						}}
					>
						{/* Soft accent regardless of mode — the scanner is always dark. */}
						<SymbolView
							name="xmark"
							size={20}
							tintColor={t.accentOn}
							weight="medium"
						/>
					</HeaderIconButton>
				),
			}}
		>
			<Stack.Screen
				name="scan-configure"
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
					headerShadowVisible: false,
					headerLeft: () => null,
					contentStyle: { backgroundColor: t.glass.sheetFill },
				}}
			/>
			<Stack.Screen
				name="scanner-tips"
				options={{
					presentation: "formSheet",
					// Full height only — no intermediate detent, a drag down dismisses.
					sheetAllowedDetents: [1.0],
					sheetGrabberVisible: true,
					// Bottom sheets get the larger 28pt top radius.
					sheetCornerRadius: 28,
					headerShown: true,
					headerTransparent: false,
					headerStyle: { backgroundColor: t.glass.sheetFill },
					headerTintColor: t.accentOn,
					headerShadowVisible: false,
					headerLeft: () => null,
					contentStyle: { backgroundColor: t.glass.sheetFill },
				}}
			/>
		</Stack>
	);
}
