import Text from "@/components/Text";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@clerk/clerk-expo";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function HomeScreen() {
	const { user } = useUser();
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();

	return (
		<View
			style={{ flex: 1, backgroundColor: colors.background, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}
		>
			<View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
				<Text style={{ fontSize: 24, fontWeight: "bold", color: "#ffffff", marginBottom: 8 }}>
					Welcome{user?.firstName ? `, ${user.firstName}` : ""}!
				</Text>
				<Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
					Your app content goes here.
				</Text>
			</View>
		</View>
	);
}
