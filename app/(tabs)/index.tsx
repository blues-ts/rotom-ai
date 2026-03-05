import Text from "@/components/Text";
import { useUser } from "@clerk/clerk-expo";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function HomeScreen() {
	const { user } = useUser();
	const insets = useSafeAreaInsets();

	return (
		<View
			className="flex-1 bg-background"
			style={{ paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}
		>
			<View className="flex-1 items-center justify-center px-6">
				<Text className="text-2xl font-bold text-white mb-2">
					Welcome{user?.firstName ? `, ${user.firstName}` : ""}!
				</Text>
				<Text className="text-muted-foreground text-center">
					Your app content goes here.
				</Text>
			</View>
		</View>
	);
}
