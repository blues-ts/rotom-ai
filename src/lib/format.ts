/**
 * Format a numeric amount as currency with thousands separators
 * and two decimal places. Examples:
 *   formatCurrency(10367.37)            -> "$10,367.37"
 *   formatCurrency(10367.37, "EUR")     -> "€10,367.37"
 *   formatCurrency(0.5)                 -> "$0.50"
 */
export function formatCurrency(value: number, currency = "USD"): string {
	const symbol = currency === "EUR" ? "€" : "$";
	const safe = Number.isFinite(value) ? value : 0;
	const negative = safe < 0;
	const [intPart, decPart] = Math.abs(safe).toFixed(2).split(".");
	const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return `${negative ? "-" : ""}${symbol}${withCommas}.${decPart}`;
}
