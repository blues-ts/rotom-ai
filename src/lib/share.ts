import { formatCurrency } from "@/lib/format";

/**
 * Builds the shareable card link. rivertcg.com is our domain (riverai.app is
 * NOT). Devices with the app open the card directly (universal link routed by
 * app/card/[id].tsx); everyone else hits the Cloudflare worker on /card/*
 * (rotom-ai-web/worker), which turns the query params into Open Graph tags so
 * the link unfurls in iMessage as the card image + "name — price". The params
 * exist only for that preview; the app itself fetches by id.
 */
export function buildCardShareUrl(opts: {
	cardId: string;
	name: string;
	price: number | undefined;
	selectionLabel: string;
	imageUrl: string;
}): string {
	const params = [
		`n=${encodeURIComponent(opts.name)}`,
		opts.price !== undefined
			? `p=${encodeURIComponent(formatCurrency(opts.price))}`
			: null,
		opts.selectionLabel ? `s=${encodeURIComponent(opts.selectionLabel)}` : null,
		`i=${encodeURIComponent(opts.imageUrl)}`,
	]
		.filter(Boolean)
		.join("&");
	return `https://rivertcg.com/card/${encodeURIComponent(opts.cardId)}?${params}`;
}
