import Text from "@/components/Text";
import { ThemePreference, useTheme } from "@/context/ThemeContext";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
];

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { colors, preference, setPreference } = useTheme();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)");
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <View className="flex-1 px-6 pt-6" style={{ gap: 32 }}>

        {/* Account */}
        <View style={{ gap: 4 }}>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Inter_600SemiBold",
              color: colors.mutedForeground,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Account
          </Text>
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
            }}
          >
            <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular" }}>
              {user?.primaryEmailAddress?.emailAddress ?? "—"}
            </Text>
          </View>
        </View>

        {/* Appearance */}
        <View style={{ gap: 4 }}>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Inter_600SemiBold",
              color: colors.mutedForeground,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Appearance
          </Text>
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
            }}
          >
            {THEME_OPTIONS.map((opt, i) => (
              <Pressable
                key={opt.value}
                onPress={() => setPreference(opt.value)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 16,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular" }}>
                  {opt.label}
                </Text>
                {preference === opt.value && (
                  <MaterialCommunityIcons name="check" size={20} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Debug — only visible in development */}
        {__DEV__ && (
          <View style={{ gap: 4 }}>
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
                color: colors.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Debug
            </Text>
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: "hidden",
              }}
            >
              <Pressable
                onPress={() => router.push("/(onboarding)/welcome")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 16,
                }}
              >
                <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular" }}>
                  View Onboarding
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Sign out */}
        <Pressable
          onPress={handleSignOut}
          style={{
            backgroundColor: colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.destructive, fontFamily: "Inter_500Medium" }}>
            Sign Out
          </Text>
        </Pressable>

      </View>
    </SafeAreaView>
  );
}
