import { Pressable } from "react-native";
import { palette, useRiverTheme } from "@/constants/theme";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect, router, Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";

export default function CameraLayout() {
	const t = useRiverTheme();
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
				headerTintColor: t.accentOn,
				headerTitle: "",
				contentStyle: { backgroundColor: "transparent" },
				headerLeft: () => (
					<Pressable
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							router.back();
						}}
					>
						{/* Soft accent regardless of mode — the scanner is always dark. */}
						<SymbolView
							name="xmark"
							size={20}
							tintColor={palette.accentSoft}
							weight="medium"
						/>
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
					// Bottom sheets get the larger 28pt top radius.
					sheetCornerRadius: 28,
					headerShown: true,
					headerTransparent: false,
					headerStyle: { backgroundColor: t.glass.sheetFill },
					headerTintColor: t.text.primary,
					headerShadowVisible: false,
					headerLeft: () => null,
					contentStyle: { backgroundColor: t.glass.sheetFill },
				}}
			/>
		</Stack>
	);
}
