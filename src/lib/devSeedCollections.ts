/**
 * Dev-only: seed two demo collections with well-known chase cards so the
 * collections UI has real data to render. Metadata, images, and prices come
 * from the live pricing batch endpoint — ids that don't resolve are skipped
 * rather than inserted with made-up data, and cards already in the target
 * collection are left alone so re-tapping the button is idempotent.
 */
import type { AxiosInstance } from "axios";
import { getPricedBatch } from "@/lib/api/pricing";
import { recordCollectionValueSnapshot } from "@/lib/collectionValueHistory";
import { getDatabase } from "@/lib/database";
import {
	getCardImage,
	getCardNumber,
	getExpansionDisplayName,
	getVariantNames,
	selectPrice,
} from "@/lib/scrydex";
import type { ScrydexCard } from "@/types/scrydex";

const SEED_COLLECTIONS: { name: string; cardIds: string[] }[] = [
	{
		name: "Chase Binder",
		cardIds: [
			"swsh7-215", // Umbreon VMAX alt (Moonbreon)
			"swsh7-218", // Rayquaza VMAX alt
			"swsh7-189", // Umbreon V alt
			"swsh11-186", // Giratina V alt
			"swsh4-188", // Pikachu VMAX rainbow
			"sv3-215", // Charizard ex SIR (Obsidian Flames)
			"sv2-254", // Iono SIR (Paldea Evolved)
			"sv8-238", // Pikachu ex SIR (Surging Sparks)
			"sv3pt5-151", // Mew ex (151)
		],
	},
	{
		name: "Vintage Vault",
		cardIds: [
			"base1-4", // Charizard (Base Set)
			"base1-2", // Blastoise
			"base1-15", // Venusaur
			"base1-1", // Alakazam
			"base1-10", // Mewtwo
			"base1-58", // Pikachu
			"base2-11", // Snorlax (Jungle)
			"base3-4", // Dragonite (Fossil)
			"neo1-9", // Lugia (Neo Genesis)
		],
	},
];

// NM first, walking down the condition ladder — vintage cards often have no
// NM row at all, and a $0 seed defeats the point of demo data.
const SEED_CONDITIONS = ["NM", "LP", "MP", "HP", "DM"];

function resolveSeedPricing(card: ScrydexCard): {
	value: number;
	variant: string;
	condition: string;
} {
	for (const condition of SEED_CONDITIONS) {
		const price = selectPrice(card, undefined, { kind: "raw", condition });
		if (price) {
			return { value: price.value, variant: price.variant, condition };
		}
	}
	return {
		value: 0,
		variant: getVariantNames(card)[0] ?? "normal",
		condition: "NM",
	};
}

export interface SeedCollectionsResult {
	added: number;
	skipped: number;
	missing: string[];
}

export async function seedDevCollections(
	api: AxiosInstance,
): Promise<SeedCollectionsResult> {
	const db = getDatabase();

	const allIds = SEED_COLLECTIONS.flatMap((c) => c.cardIds);
	const batch = await getPricedBatch(api, {
		cardIds: allIds,
		sealedIds: [],
		skipRawBackfill: true,
	});
	const cardsById = new Map(batch.cards.map((c) => [c.id, c]));
	if (cardsById.size === 0) {
		throw new Error("Pricing batch returned no cards — is the server up?");
	}

	let added = 0;
	let skipped = 0;
	const missing: string[] = [];

	await db.withTransactionAsync(async () => {
		for (const seed of SEED_COLLECTIONS) {
			const existingCollection = await db.getFirstAsync<{ id: string }>(
				"SELECT id FROM collections WHERE name = ?",
				[seed.name],
			);
			let collectionId = existingCollection?.id;
			if (!collectionId) {
				collectionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
				await db.runAsync("INSERT INTO collections (id, name) VALUES (?, ?)", [
					collectionId,
					seed.name,
				]);
			}

			for (const cardId of seed.cardIds) {
				const card = cardsById.get(cardId);
				if (!card) {
					missing.push(cardId);
					continue;
				}

				const alreadyOwned = await db.getFirstAsync<{ id: string }>(
					"SELECT id FROM collection_cards WHERE collection_id = ? AND card_id = ?",
					[collectionId, cardId],
				);
				if (alreadyOwned) {
					skipped += 1;
					continue;
				}

				const { value, variant, condition } = resolveSeedPricing(card);
				const rowId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
				await db.runAsync(
					`INSERT INTO collection_cards
					   (id, collection_id, card_id, card_name, card_number, set_name,
					    card_image_url, card_value, pricing_type, product_type, variant,
					    condition, quantity, card_value_updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Raw', 'card', ?, ?, 1, ?)`,
					[
						rowId,
						collectionId,
						cardId,
						card.name,
						getCardNumber(card),
						card.expansion ? getExpansionDisplayName(card.expansion) : null,
						getCardImage(card, variant, "medium") ?? "",
						value,
						variant,
						condition,
						new Date().toISOString(),
					],
				);
				added += 1;
			}
		}
	});

	recordCollectionValueSnapshot();
	return { added, skipped, missing };
}
