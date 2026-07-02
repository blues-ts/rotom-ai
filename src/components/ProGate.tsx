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
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";

import { useRiverTheme } from "@/constants/theme";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";

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
	const t = useRiverTheme();

	const handleUnlock = useCallback(() => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		void presentProPaywallIfNeeded();
	}, []);

	if (isPro) {
		return <View style={style}>{children}</View>;
	}

	return (
		<View style={[style, styles.clip]}>
			<View pointerEvents="none">{children}</View>
			<BlurView
				intensity={blurIntensity}
				tint={t.isDark ? "dark" : "light"}
				style={StyleSheet.absoluteFill}
			/>
			<Pressable
				onPress={handleUnlock}
				style={[StyleSheet.absoluteFill, styles.center]}
			>
				<View
					style={[
						styles.cta,
						{ backgroundColor: t.accent },
						t.buttonGlow,
					]}
				>
					<SymbolView
						name="lock"
						size={14}
						tintColor="#FFFFFF"
						weight="medium"
					/>
					<Text style={[styles.ctaText, { color: "#FFFFFF" }]}>
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
	},
	ctaText: {
		fontSize: 13,
		fontWeight: "600",
	},
});
