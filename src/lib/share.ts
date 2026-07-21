import { formatCurrency } from "@/lib/format";

/**
 * Builds the shareable card link. rivertcg.com is our domain (riverai.app is
 * NOT). Devices with the app open the card directly (universal link routed by
 * app/card/[id].tsx); everyone else hits the Cloudflare worker on /card/*
 * (rotom-ai-web/worker), which turns the query params into Open Graph tags so
 * the link unfurls in iMessage as the card image + "name — price".
 *
 * Two kinds of params ride on the URL:
 *  - n/p/s/i — display-only, consumed by the worker to build the OG preview.
 *  - pricingType/variant/condition/gradedCompany/gradedGrade — the structured
 *    selection, so a recipient with the app installed opens the card in the
 *    exact config the sender was viewing (e.g. a PSA 10 link lands on PSA 10).
 *    The redirect route (app/card/[id].tsx) forwards these into the detail
 *    stack, whose seed() reads them under these same names. The worker ignores
 *    them. The app itself still fetches card data by id.
 */
export function buildCardShareUrl(opts: {
	cardId: string;
	name: string;
	price: number | undefined;
	selectionLabel: string;
	imageUrl: string;
	config: {
		pricingType: string;
		variant?: string | null;
		condition?: string | null;
		gradedCompany?: string | null;
		gradedGrade?: string | null;
	};
}): string {
	const { config } = opts;
	const isGraded = config.pricingType === "Graded";
	const params = [
		// OG preview params.
		`n=${encodeURIComponent(opts.name)}`,
		opts.price !== undefined
			? `p=${encodeURIComponent(formatCurrency(opts.price))}`
			: null,
		opts.selectionLabel ? `s=${encodeURIComponent(opts.selectionLabel)}` : null,
		`i=${encodeURIComponent(opts.imageUrl)}`,
		// Structured selection, restored in-app by the redirect route.
		`pricingType=${encodeURIComponent(config.pricingType)}`,
		config.variant && config.variant !== "normal"
			? `variant=${encodeURIComponent(config.variant)}`
			: null,
		isGraded
			? config.gradedCompany
				? `gradedCompany=${encodeURIComponent(config.gradedCompany)}`
				: null
			: config.condition
				? `condition=${encodeURIComponent(config.condition)}`
				: null,
		isGraded && config.gradedGrade
			? `gradedGrade=${encodeURIComponent(config.gradedGrade)}`
			: null,
	]
		.filter(Boolean)
		.join("&");
	return `https://rivertcg.com/card/${encodeURIComponent(opts.cardId)}?${params}`;
}
