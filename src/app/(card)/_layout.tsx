import { Pressable } from "react-native";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";

export default function CardLayout() {
	const { colors } = useTheme();

	return (
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
				headerRight: () => (
					<Pressable
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							// TODO: add to collection action
						}}
					>
						<Ionicons name="add" size={26} color={colors.foreground} />
					</Pressable>
				),
			}}
		/>
	);
}
