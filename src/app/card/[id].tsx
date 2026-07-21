import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Deep-link landing route: https://rivertcg.com/card/<id> (universal link,
 * shared from the card detail screen) and riverai://card/<id> both resolve
 * here, then forward into the real (card) stack. The group route can't be
 * linked directly — stripping "(card)" would leave the ambiguous top-level
 * "/:id" — so links get this stable /card/ path.
 *
 * Name/image (n/i) and price (p) are OG-preview params for the unfurl worker
 * and are dropped here; the detail screen fetches by id. The structured
 * selection (pricingType/variant/condition/gradedCompany/gradedGrade) written
 * by buildCardShareUrl IS forwarded, so a shared PSA 10 link opens on PSA 10
 * — the detail screen's seed() reads these exact param names.
 */
export default function CardLinkRedirect() {
	const { id, pricingType, variant, condition, gradedCompany, gradedGrade } =
		useLocalSearchParams<{
			id: string;
			pricingType?: string;
			variant?: string;
			condition?: string;
			gradedCompany?: string;
			gradedGrade?: string;
		}>();
	return (
		<Redirect
			href={{
				pathname: "/(card)/[id]",
				params: {
					id,
					// Only forward keys that arrived, so a bare /card/<id> link
					// still seeds the detail screen's own defaults.
					...(pricingType ? { pricingType } : {}),
					...(variant ? { variant } : {}),
					...(condition ? { condition } : {}),
					...(gradedCompany ? { gradedCompany } : {}),
					...(gradedGrade ? { gradedGrade } : {}),
				},
			}}
		/>
	);
}
