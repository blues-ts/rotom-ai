import { Stack } from "expo-router";
import { useTheme } from "@/context/ThemeContext";

export default function CardLayout() {
	const { colors } = useTheme();

	return (
		<Stack
			screenOptions={{
				headerShown: true,
				headerShadowVisible: false,
				headerStyle: { backgroundColor: colors.background },
				headerTintColor: colors.foreground,
				contentStyle: { backgroundColor: colors.background },
			}}
		/>
	);
}
