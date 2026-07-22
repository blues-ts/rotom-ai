import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { getDatabase } from "@/lib/database";
import { useToast } from "@/context/ToastContext";

export const FAVORITES_KEY = ["favorites"] as const;

interface FavoriteRow {
	card_id: string;
	product_type: string;
	card_name: string;
	card_number: string | null;
	set_name: string | null;
	card_image_url: string;
	variant: string;
	condition: string;
	created_at: string;
}

export interface Favorite {
	cardId: string;
	productType: "card" | "sealed";
	cardName: string;
	cardNumber?: string;
	setName?: string;
	cardImageUrl: string;
	variant: string;
	condition: string;
	createdAt: string;
}

/** Everything needed to store a favorite and later re-open its detail screen. */
export interface FavoriteInput {
	cardId: string;
	productType?: "card" | "sealed";
	cardName: string;
	cardNumber?: string;
	setName?: string;
	cardImageUrl: string;
	variant?: string;
	condition?: string;
}

function mapRow(row: FavoriteRow): Favorite {
	return {
		cardId: row.card_id,
		productType: row.product_type === "sealed" ? "sealed" : "card",
		cardName: row.card_name,
		cardNumber: row.card_number ?? undefined,
		setName: row.set_name ?? undefined,
		cardImageUrl: row.card_image_url,
		variant: row.variant,
		condition: row.condition,
		createdAt: row.created_at,
	};
}

/**
 * Non-reactive favorite check. Reading favorite state through useIsFavorited
 * subscribes the caller to the favorites query, re-rendering it on every
 * favorite change — fine for the detail-screen star, but fatal inside a native
 * context menu, whose lifted-preview snapshot collapses the card image on ANY
 * re-render. Surfaces in that situation read with this instead.
 */
export function readIsFavorited(
	cardId: string,
	productType: "card" | "sealed" = "card",
): boolean {
	return !!getDatabase().getFirstSync(
		"SELECT 1 FROM favorites WHERE card_id = ? AND product_type = ?",
		[cardId, productType],
	);
}

/**
 * Insert-or-delete one favorite synchronously, returning what happened. Shared
 * by the detail-screen star and the context-menu action so the SQL can't drift.
 * Callers own the toast/haptics + FAVORITES_KEY invalidation.
 */
export function toggleFavoriteRow(input: FavoriteInput): "added" | "removed" {
	const db = getDatabase();
	const productType = input.productType ?? "card";
	if (readIsFavorited(input.cardId, productType)) {
		db.runSync(
			"DELETE FROM favorites WHERE card_id = ? AND product_type = ?",
			[input.cardId, productType],
		);
		return "removed";
	}
	db.runSync(
		`INSERT OR REPLACE INTO favorites
		 (card_id, product_type, card_name, card_number, set_name, card_image_url, variant, condition)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			input.cardId,
			productType,
			input.cardName,
			input.cardNumber ?? null,
			input.setName ?? null,
			input.cardImageUrl,
			input.variant ?? "normal",
			input.condition ?? "NM",
		],
	);
	return "added";
}

/**
 * The starred-cards list surfaced on the search screen. Mirrors useCollections:
 * SQLite reads/writes wrapped in React Query, mutations invalidate the whole
 * FAVORITES_KEY prefix (so the list AND the membership hook below refresh).
 */
export function useFavorites() {
	const db = getDatabase();
	const queryClient = useQueryClient();
	const toast = useToast();

	const query = useQuery({
		queryKey: FAVORITES_KEY,
		// Async read: refetches after every mutation, kept off the JS thread.
		queryFn: async () => {
			const rows = await db.getAllAsync<FavoriteRow>(
				"SELECT * FROM favorites ORDER BY created_at DESC",
			);
			return rows.map(mapRow);
		},
		staleTime: Infinity,
	});

	const onMutationError = useCallback(() => {
		Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
		toast.show("Couldn't save change. Please try again.");
	}, [toast]);

	const invalidate = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: FAVORITES_KEY });
	}, [queryClient]);

	const addFavorite = useMutation({
		mutationFn: (input: FavoriteInput) => {
			// INSERT OR REPLACE on the (card_id, product_type) PK: re-favoriting an
			// existing card just refreshes its stored display fields.
			db.runSync(
				`INSERT OR REPLACE INTO favorites
				 (card_id, product_type, card_name, card_number, set_name, card_image_url, variant, condition)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					input.cardId,
					input.productType ?? "card",
					input.cardName,
					input.cardNumber ?? null,
					input.setName ?? null,
					input.cardImageUrl,
					input.variant ?? "normal",
					input.condition ?? "NM",
				],
			);
			return Promise.resolve();
		},
		onSuccess: invalidate,
		onError: onMutationError,
	});

	const removeFavorite = useMutation({
		mutationFn: ({
			cardId,
			productType = "card",
		}: {
			cardId: string;
			productType?: "card" | "sealed";
		}) => {
			db.runSync(
				"DELETE FROM favorites WHERE card_id = ? AND product_type = ?",
				[cardId, productType],
			);
			return Promise.resolve();
		},
		onSuccess: invalidate,
		onError: onMutationError,
	});

	// Bulk delete for the favorites-screen multi-select — one transaction for
	// the whole selection, then a single invalidation pass.
	const removeFavorites = useMutation({
		mutationFn: async ({
			items,
		}: {
			items: { cardId: string; productType: "card" | "sealed" }[];
		}) => {
			if (items.length === 0) return;
			await db.withTransactionAsync(async () => {
				for (const { cardId, productType } of items) {
					await db.runAsync(
						"DELETE FROM favorites WHERE card_id = ? AND product_type = ?",
						[cardId, productType],
					);
				}
			});
		},
		onSuccess: invalidate,
		onError: onMutationError,
	});

	return {
		favorites: query.data ?? [],
		isLoading: query.isLoading,
		isError: query.isError,
		refetch: query.refetch,
		addFavorite,
		removeFavorite,
		removeFavorites,
	};
}

/**
 * O(1) membership for the detail-screen star, without loading the whole list.
 * Returns the current state plus a toggle that flips it. Reuses FAVORITES_KEY's
 * data (populated by useFavorites) so the star and the list stay in lockstep.
 */
export function useIsFavorited(input: FavoriteInput) {
	const db = getDatabase();
	const queryClient = useQueryClient();
	const toast = useToast();
	const { productType = "card", cardId } = input;

	// A tiny id-only query — cheaper than mapping the full list, and shares the
	// prefix so every add/remove invalidation refreshes it.
	const { data: keys } = useQuery({
		queryKey: [...FAVORITES_KEY, "keys"],
		queryFn: async () => {
			const rows = await db.getAllAsync<{
				card_id: string;
				product_type: string;
			}>("SELECT card_id, product_type FROM favorites");
			return rows.map((r) => `${r.product_type}:${r.card_id}`);
		},
		staleTime: Infinity,
	});

	const isFavorited = (keys ?? []).includes(`${productType}:${cardId}`);

	const toggle = useCallback(() => {
		const result = toggleFavoriteRow(input);
		if (result === "removed") {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			toast.show("Removed from Favorites");
		} else {
			Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
			toast.show("Added to Favorites", "success");
		}
		queryClient.invalidateQueries({ queryKey: FAVORITES_KEY });
	}, [input, queryClient, toast]);

	return { isFavorited, toggle };
}
