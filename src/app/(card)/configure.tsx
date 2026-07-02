import { useEffect, useMemo } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { Stack } from "expo-router";
import { SheetDoneButton } from "@/components/SheetDoneButton";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/axios";
import { getCard } from "@/lib/api/pricing";
import { getCatalogCard, catalogCardToScrydex } from "@/lib/api/catalog";
import { useRevenueCat } from "@/context/RevenueCatContext";
import {
	CONDITION_LABELS,
	formatVariantLabel,
	getConditionOptions,
	getGradedOptions,
	getVariantNames,
} from "@/lib/scrydex";
import { useRiverTheme } from "@/constants/theme";
import { useCardConfig } from "@/context/CardConfigContext";
import {
	LabeledPillToggle,
	PillToggle,
	TabBar,
	ToggleLabel,
} from "@/components/PricingToggles";

const SCREEN_WIDTH = Dimensions.get("window").width;

function formatConditionLabel(condition: string): string {
	return CONDITION_LABELS[condition] ?? condition;
}

// Slides the Raw (condition) panel left/out and the Graded (company + grade)
// panel in from the right when the pricing tab changes, easing the frame
// height between the two so there's no jump.
function SlidingPanels({
	activeTab,
	rawPanel,
	gradedPanel,
}: {
	activeTab: string;
	rawPanel: React.ReactNode;
	gradedPanel: React.ReactNode;
}) {
	const slide = useSharedValue(activeTab === "Graded" ? 1 : 0);
	const rawHeight = useSharedValue(0);
	const gradedHeight = useSharedValue(0);

	useEffect(() => {
		slide.value = withTiming(activeTab === "Graded" ? 1 : 0, { duration: 250 });
	}, [activeTab]);

	const containerStyle = useAnimatedStyle(() => {
		const height = interpolate(
			slide.value,
			[0, 1],
			[rawHeight.value, gradedHeight.value],
		);
		return {
			height: height > 0 ? height : undefined,
			overflow: "hidden" as const,
		};
	});

	const rawStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: interpolate(slide.value, [0, 1], [0, -SCREEN_WIDTH]) },
		],
		opacity: interpolate(slide.value, [0, 0.5], [1, 0]),
	}));

	const gradedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: interpolate(slide.value, [0, 1], [SCREEN_WIDTH, 0]) },
		],
		opacity: interpolate(slide.value, [0.5, 1], [0, 1]),
	}));

	return (
		<Animated.View style={containerStyle}>
			<Animated.View
				style={[styles.panel, rawStyle]}
				onLayout={(e) => {
					rawHeight.value = e.nativeEvent.layout.height;
				}}
			>
				{rawPanel}
			</Animated.View>
			<Animated.View
				style={[styles.panel, gradedStyle]}
				onLayout={(e) => {
					gradedHeight.value = e.nativeEvent.layout.height;
				}}
			>
				{gradedPanel}
			</Animated.View>
		</Animated.View>
	);
}

export default function ConfigureCard() {
	const t = useRiverTheme();
	const { isPro } = useRevenueCat();
	const api = useApi();
	const {
		cardId,
		variant,
		setVariant,
		pricingTab,
		setPricingTab,
		rawCondition,
		setRawCondition,
		gradedCompany,
		setGradedCompany,
		gradedGrade,
		setGradedGrade,
	} = useCardConfig();

	// Cached by the detail screen's identical query — no extra fetch. Matches the
	// detail screen's Pro-aware source so non-Pro never hits the pricing API.
	const { data: card } = useQuery({
		queryKey: ["card", cardId],
		queryFn: () =>
			isPro ? getCard(api, cardId!) : getCatalogCard(api, cardId!).then(catalogCardToScrydex),
		enabled: !!cardId,
	});

	const variantNames = useMemo(
		() => (card ? getVariantNames(card) : []),
		[card],
	);

	const conditionOptions = useMemo(() => {
		const conditions = card && variant ? getConditionOptions(card, variant) : [];
		if (conditions.length === 0) return [{ label: "Near Mint", value: "NM" }];
		return conditions.map((c) => ({ label: formatConditionLabel(c), value: c }));
	}, [card, variant]);

	const gradedOptions = useMemo(
		() => (card && variant ? getGradedOptions(card, variant) : []),
		[card, variant],
	);
	const gradedCompanies = useMemo(
		() => gradedOptions.map((o) => o.company),
		[gradedOptions],
	);
	const gradedGrades = useMemo(() => {
		if (!gradedCompany) return [];
		return gradedOptions.find((o) => o.company === gradedCompany)?.grades ?? [];
	}, [gradedOptions, gradedCompany]);

	const hasGraded = gradedCompanies.length > 0;

	// Picking a company re-anchors the grade to that company's first option.
	const selectGradedCompany = (company: string) => {
		setGradedCompany(company);
		const grades =
			gradedOptions.find((o) => o.company === company)?.grades ?? [];
		setGradedGrade(grades[0] ?? null);
	};

	return (
		<View style={styles.container}>
			<Stack.Screen
				options={{
					headerRight: () => <SheetDoneButton />,
				}}
			/>

			<View style={styles.content}>
				{variantNames.length > 1 && (
					<View style={styles.block}>
						<ToggleLabel>Variant</ToggleLabel>
						<LabeledPillToggle
							options={variantNames.map((v) => ({
								label: formatVariantLabel(v),
								value: v,
							}))}
							selected={variant}
							onSelect={setVariant}
						/>
					</View>
				)}

				{hasGraded && (
					<View style={styles.block}>
						<ToggleLabel>Pricing</ToggleLabel>
						<TabBar
							tabs={["Raw", "Graded"]}
							selected={pricingTab}
							onSelect={setPricingTab}
						/>
					</View>
				)}

				{hasGraded ? (
					<SlidingPanels
						activeTab={pricingTab}
						rawPanel={
							<View>
								<ToggleLabel>Condition</ToggleLabel>
								<LabeledPillToggle
									options={conditionOptions}
									selected={rawCondition}
									onSelect={setRawCondition}
								/>
							</View>
						}
						gradedPanel={
							<View>
								<ToggleLabel>Grading Company</ToggleLabel>
								<PillToggle
									options={gradedCompanies}
									selected={gradedCompany ?? ""}
									onSelect={selectGradedCompany}
								/>
								{gradedGrades.length > 0 && (
									<>
										<ToggleLabel style={{ marginTop: 12 }}>
											Grade
										</ToggleLabel>
										<LabeledPillToggle
											options={gradedGrades.map((g) => ({
												label: g,
												value: g,
											}))}
											selected={gradedGrade}
											onSelect={setGradedGrade}
											columns={5}
										/>
									</>
								)}
							</View>
						}
					/>
				) : (
					<View style={styles.block}>
						<ToggleLabel>Condition</ToggleLabel>
						<LabeledPillToggle
							options={conditionOptions}
							selected={rawCondition}
							onSelect={setRawCondition}
						/>
					</View>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	content: {
		padding: 20,
		paddingBottom: 40,
		gap: 20,
	},
	block: {
		gap: 0,
	},
	panel: {
		position: "absolute",
		width: "100%",
	},
});
