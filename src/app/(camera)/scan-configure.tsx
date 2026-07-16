import { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { SheetDoneButton } from "@/components/SheetDoneButton";
import { useRiverTheme } from "@/constants/theme";
import { formatCurrency } from "@/lib/format";
import {
	CONDITION_LABELS,
	formatVariantLabel,
	getConditionOptions,
	getGradedOptions,
	getVariantNames,
} from "@/lib/scrydex";
import {
	useScanSession,
	type ScanCardConfig,
} from "@/context/ScanSessionContext";
import {
	defaultScanConfig,
	scanConfigPrice,
	useScanReviewBatch,
} from "@/hooks/useScanReviewBatch";
import {
	LabeledPillToggle,
	PillToggle,
	TabBar,
	ToggleLabel,
} from "@/components/PricingToggles";

/**
 * Per-scan pricing configuration, opened from a review-screen row. Mirrors the
 * card-detail configure sheet but writes straight into the scan session, so
 * the row behind updates live as options change.
 */
export default function ScanConfigureSheet() {
	const t = useRiverTheme();
	const { cardId, cardIds } = useLocalSearchParams<{
		cardId: string;
		cardIds: string;
	}>();
	const { scans, setScanConfig } = useScanSession();

	// Same id list (and so the same query key) as the review screen — this is
	// a cache read, not a second batch fetch.
	const ids = useMemo(
		() => (cardIds ? cardIds.split(",").filter(Boolean) : []),
		[cardIds],
	);
	const { data: cards } = useScanReviewBatch(ids);
	const card = useMemo(
		() => (cards ?? []).find((c) => c.id === cardId),
		[cards, cardId],
	);

	const stored = scans.find((s) => s.id === cardId)?.config;
	const config: ScanCardConfig | undefined =
		stored ?? (card ? defaultScanConfig(card) : undefined);

	const update = useCallback(
		(patch: Partial<ScanCardConfig>) => {
			if (!cardId || !config) return;
			setScanConfig(cardId, { ...config, ...patch });
		},
		[cardId, config, setScanConfig],
	);

	const variantNames = useMemo(
		() => (card ? getVariantNames(card) : []),
		[card],
	);

	const conditionOptions = useMemo(() => {
		const conditions =
			card && config ? getConditionOptions(card, config.variant) : [];
		if (conditions.length === 0) return [{ label: "Near Mint", value: "NM" }];
		return conditions.map((c) => ({
			label: CONDITION_LABELS[c] ?? c,
			value: c,
		}));
	}, [card, config]);

	const gradedOptions = useMemo(
		() => (card && config ? getGradedOptions(card, config.variant) : []),
		[card, config],
	);
	const gradedCompanies = useMemo(
		() => gradedOptions.map((o) => o.company),
		[gradedOptions],
	);
	const gradedCompany = config?.gradedCompany;
	const gradedGrades = useMemo(() => {
		if (!gradedCompany) return [];
		return (
			gradedOptions.find((o) => o.company === gradedCompany)?.grades ?? []
		);
	}, [gradedOptions, gradedCompany]);

	const hasGraded = gradedCompanies.length > 0;

	// Picking a variant re-anchors condition (and drops a graded pick the new
	// variant doesn't offer) so the config never points at an unpriced tier.
	const selectVariant = (variant: string) => {
		if (!card || !config) return;
		const conditions = getConditionOptions(card, variant);
		const condition = conditions.includes(config.condition)
			? config.condition
			: (conditions[0] ?? "NM");
		const graded = getGradedOptions(card, variant);
		const company = graded.find((o) => o.company === config.gradedCompany)
			? config.gradedCompany
			: undefined;
		const grade =
			company &&
			graded
				.find((o) => o.company === company)
				?.grades.includes(config.gradedGrade ?? "")
				? config.gradedGrade
				: undefined;
		update({
			variant,
			condition,
			gradedCompany: company,
			gradedGrade: grade,
			pricingType:
				config.pricingType === "Graded" && graded.length === 0
					? "Raw"
					: config.pricingType,
		});
	};

	// Picking a company re-anchors the grade to that company's first option.
	const selectGradedCompany = (company: string) => {
		const grades =
			gradedOptions.find((o) => o.company === company)?.grades ?? [];
		update({ gradedCompany: company, gradedGrade: grades[0] });
	};

	const selectPricingTab = (tab: string) => {
		if (tab === "Graded" && !config?.gradedCompany) {
			// First flip to Graded: anchor to the first company + grade so the
			// sheet never shows the tab with nothing selected.
			const first = gradedOptions[0];
			update({
				pricingType: "Graded",
				gradedCompany: first?.company,
				gradedGrade: first?.grades[0],
			});
			return;
		}
		update({ pricingType: tab === "Graded" ? "Graded" : "Raw" });
	};

	const price = card && config ? scanConfigPrice(card, config) : undefined;

	return (
		<View style={styles.container}>
			<Stack.Screen
				options={{
					headerRight: () => <SheetDoneButton />,
				}}
			/>

			<ScrollView
				contentContainerStyle={styles.content}
				showsVerticalScrollIndicator={false}
			>
				{/* Live price for the current pick — the whole point of the sheet. */}
				<View style={styles.priceRow}>
					<Text style={[styles.priceLabel, { color: t.text.secondary }]}>
						{config
							? config.pricingType === "Graded" &&
								config.gradedCompany &&
								config.gradedGrade
								? `${config.gradedCompany} ${config.gradedGrade}`
								: (CONDITION_LABELS[config.condition] ?? config.condition)
							: ""}
					</Text>
					<Text style={[styles.priceValue, { color: t.text.primary }]}>
						{price !== undefined ? formatCurrency(price) : "No price"}
					</Text>
				</View>

				{variantNames.length > 1 && config && (
					<View>
						<ToggleLabel>Variant</ToggleLabel>
						<LabeledPillToggle
							options={variantNames.map((v) => ({
								label: formatVariantLabel(v),
								value: v,
							}))}
							selected={config.variant}
							onSelect={selectVariant}
						/>
					</View>
				)}

				{hasGraded && config && (
					<View>
						<ToggleLabel>Pricing</ToggleLabel>
						<TabBar
							tabs={["Raw", "Graded"]}
							selected={config.pricingType}
							onSelect={selectPricingTab}
						/>
					</View>
				)}

				{config && config.pricingType === "Graded" && hasGraded ? (
					<View>
						<ToggleLabel>Grading Company</ToggleLabel>
						<PillToggle
							options={gradedCompanies}
							selected={config.gradedCompany ?? ""}
							onSelect={selectGradedCompany}
						/>
						{gradedGrades.length > 0 && (
							<>
								<ToggleLabel style={{ marginTop: 12 }}>Grade</ToggleLabel>
								<LabeledPillToggle
									options={gradedGrades.map((g) => ({ label: g, value: g }))}
									selected={config.gradedGrade ?? null}
									onSelect={(g) => update({ gradedGrade: g })}
									columns={5}
								/>
							</>
						)}
					</View>
				) : config ? (
					<View>
						<ToggleLabel>Condition</ToggleLabel>
						<LabeledPillToggle
							options={conditionOptions}
							selected={config.condition}
							onSelect={(c) => update({ condition: c })}
						/>
					</View>
				) : null}
			</ScrollView>
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
	priceRow: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
	},
	priceLabel: {
		fontSize: 13,
		fontWeight: "600",
	},
	priceValue: {
		fontSize: 22,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
});
