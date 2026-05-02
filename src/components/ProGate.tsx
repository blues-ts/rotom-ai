import { useCallback } from "react";
import {
	Pressable,
	StyleProp,
	StyleSheet,
	Text,
	View,
	ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import RevenueCatUI from "react-native-purchases-ui";

import { useTheme } from "@/context/ThemeContext";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { PRO_ENTITLEMENT_ID } from "@/lib/revenuecat";

interface ProGateProps {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
	blurIntensity?: number;
	ctaText?: string;
}

export function ProGate({
	children,
	style,
	blurIntensity = 28,
	ctaText = "Unlock with River AI Pro",
}: ProGateProps) {
	const { isPro } = useRevenueCat();
	const { colors, theme } = useTheme();

	const handleUnlock = useCallback(() => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		void RevenueCatUI.presentPaywallIfNeeded({
			requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
		});
	}, []);

	if (isPro) {
		return <View style={style}>{children}</View>;
	}

	return (
		<View style={[style, styles.clip]}>
			<View pointerEvents="none">{children}</View>
			<BlurView
				intensity={blurIntensity}
				tint={theme === "dark" ? "dark" : "light"}
				style={StyleSheet.absoluteFill}
			/>
			<Pressable
				onPress={handleUnlock}
				style={[StyleSheet.absoluteFill, styles.center]}
			>
				<View
					style={[
						styles.cta,
						{
							backgroundColor: colors.primary,
							borderColor: colors.primary,
						},
					]}
				>
					<Ionicons
						name="lock-closed"
						size={14}
						color={colors.primaryForeground}
					/>
					<Text
						style={[
							styles.ctaText,
							{ color: colors.primaryForeground },
						]}
					>
						{ctaText}
					</Text>
				</View>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	clip: {
		overflow: "hidden",
	},
	center: {
		alignItems: "center",
		justifyContent: "center",
	},
	cta: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 999,
		borderWidth: 1,
	},
	ctaText: {
		fontSize: 13,
		fontWeight: "600",
	},
});
