import { Redirect, router, Stack } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useRiverTheme } from "@/constants/theme";
import HeaderIconButton from "@/components/HeaderIconButton";

export default function SearchLayout() {
	const { isSignedIn, isLoaded } = useAuth();
	const t = useRiverTheme();

	if (!isLoaded) {
		return null;
	}

	if (!isSignedIn) {
		return <Redirect href="/(auth)" />;
	}

	return (
		<Stack
			// Native header is safe again: the search field is our own
			// FloatingSearchBar, so there's no UISearchController to hide these
			// buttons or collapse the bar mid-search.
			screenOptions={{
				headerShown: true,
				headerTitle: "Search",
				headerShadowVisible: false,
				headerTransparent: true,
				headerStyle: { backgroundColor: "transparent" },
				// Native chrome tinted with the accent per the design system.
				headerTintColor: t.accentOn,
				headerLeft: () => (
					<HeaderIconButton
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
					</HeaderIconButton>
				),
			}}
		/>
	);
}
