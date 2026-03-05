import Text from "@/components/Text";
import { useTheme } from "@/context/ThemeContext";
import { Link, Stack } from "expo-router";
import { View } from "react-native";

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Text style={{ fontSize: 18, marginBottom: 16 }}>This screen doesn't exist.</Text>
        <Link href="/" style={{ color: colors.mutedForeground }}>
          Go to home screen
        </Link>
      </View>
    </>
  );
}
