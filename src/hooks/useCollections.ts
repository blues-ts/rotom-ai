import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { getDatabase } from "@/lib/database";
import { useApi } from "@/lib/axios";
import { getPricedBatch } from "@/lib/api/pricing";
import { getCardImage, getCardNumber, getExpansionDisplayName, selectPrice, type PriceSelector } from "@/lib/scrydex";
import type { ScrydexCard, ScrydexSealedProduct } from "@/types/scrydex";
import { recordCollectionValueSnapshot } from "@/lib/collectionValueHistory";
import { useToast } from "@/context/ToastContext";
import { useRevenueCat } from "@/context/RevenueCatContext";
import type { Collection, CollectionCard } from "@/types/collection";

const STALE_TTL_MS = 24 * 60 * 60 * 1000;

const COLLECTIONS_KEY = ["collections"] as const;
// Must match useCollectionSnapshot.ts (v2: topCards carry set/number).
const COLLECTION_SNAPSHOT_KEY = ["collectionSnapshot", 2] as const;

interface CollectionRow {
  id: string;
  name: string;
  created_at: string;
  card_count: number;
  total_value: number;
  card_images: string | null;
}

export interface AddCollectionCardInput {
  collectionId: string;
  cardId: string;
  cardName: string;
  cardNumber?: string;
  setName?: string;
  cardImageUrl: string;
  cardValue: number;
  pricingType?: string;
  productType?: string;
  variant?: string;
  condition?: string;
  gradedCompany?: string;
  gradedGrade?: string;
  pricePaid?: number;
  /** Copies to add (default 1) — the scan review screen's quantity stepper. */
  quantity?: number;
}

// Insert-or-increment for one card config. Shared by the single add and the
// batch add so the dedupe rules can't drift apart.
async function upsertCollectionCard(
  db: ReturnType<typeof getDatabase>,
  {
    collectionId,
    cardId,
    cardName,
    cardNumber,
    setName,
    cardImageUrl,
    cardValue,
    pricingType = "Raw",
    productType = "card",
    variant = "normal",
    condition = "NM",
    gradedCompany,
    gradedGrade,
    pricePaid,
    quantity,
  }: AddCollectionCardInput,
): Promise<void> {
  const qty = Math.min(99, Math.max(1, Math.round(quantity ?? 1)));
  // Check if this exact config already exists
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM collection_cards
     WHERE collection_id = ? AND card_id = ? AND pricing_type = ? AND variant = ? AND condition = ?
     AND COALESCE(graded_company, '') = ? AND COALESCE(graded_grade, '') = ?`,
    [collectionId, cardId, pricingType, variant, condition, gradedCompany ?? "", gradedGrade ?? ""],
  );
  if (existing) {
    if (pricePaid !== undefined) {
      await db.runAsync(
        "UPDATE collection_cards SET quantity = quantity + ?, price_paid = ? WHERE id = ?",
        [qty, pricePaid, existing.id],
      );
    } else {
      await db.runAsync(
        "UPDATE collection_cards SET quantity = quantity + ? WHERE id = ?",
        [qty, existing.id],
      );
    }
  } else {
    // Random suffix: batch-adding several cards calls this in the same
    // millisecond, so a bare Date.now() id collides on the PRIMARY KEY and
    // only one row survives. Keep it unique per insert.
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await db.runAsync(
      "INSERT INTO collection_cards (id, collection_id, card_id, card_name, card_number, set_name, card_image_url, card_value, pricing_type, product_type, variant, condition, graded_company, graded_grade, quantity, price_paid, card_value_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, collectionId, cardId, cardName, cardNumber ?? null, setName ?? null, cardImageUrl, cardValue, pricingType, productType, variant, condition, gradedCompany ?? null, gradedGrade ?? null, qty, pricePaid ?? null, new Date().toISOString()],
    );
  }
}

function mapRow(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    cardCount: row.card_count,
    totalValue: row.total_value,
    cardImages: row.card_images ? row.card_images.split(",") : [],
  };
}

export function useCollections() {
  const queryClient = useQueryClient();
  const db = getDatabase();
  const toast = useToast();

  const onMutationError = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    toast.show("Couldn't save change. Please try again.");
  }, [toast]);

  const query = useQuery({
    queryKey: COLLECTIONS_KEY,
    // Async read: refetches run after every mutation, and the sync API would
    // block the JS thread for the duration on big collections.
    queryFn: async () => {
      const rows = await db.getAllAsync<CollectionRow>(`
        SELECT
          c.id,
          c.name,
          c.created_at,
          COALESCE(SUM(cc.quantity), 0) as card_count,
          COALESCE(SUM(cc.card_value * cc.quantity), 0) as total_value,
          (SELECT GROUP_CONCAT(card_image_url) FROM (
            SELECT card_image_url FROM collection_cards
            WHERE collection_id = c.id
            ORDER BY card_value DESC
            LIMIT 4
          )) as card_images
        FROM collections c
        LEFT JOIN collection_cards cc ON cc.collection_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at ASC
      `);
      return rows.map(mapRow);
    },
    staleTime: Infinity,
  });

  const createCollection = useMutation({
    mutationFn: (name: string) => {
      const id = Date.now().toString();
      db.runSync("INSERT INTO collections (id, name) VALUES (?, ?)", [
        id,
        name,
      ]);
      return Promise.resolve(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
    },
    onError: onMutationError,
  });

  const deleteCollection = useMutation({
    mutationFn: (id: string) => {
      db.runSync("DELETE FROM collections WHERE id = ?", [id]);
      return Promise.resolve();
    },
    onSuccess: () => {
      recordCollectionValueSnapshot();
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
      queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
    },
    onError: onMutationError,
  });

  const renameCollection = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => {
      db.runSync("UPDATE collections SET name = ? WHERE id = ?", [name, id]);
      return Promise.resolve(id);
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", id] });
    },
    onError: onMutationError,
  });

  // "Added to {name}" — one confirmation for every add path (picker sheet,
  // card/sealed detail quick-adds, scanner batch).
  const showAddedToast = useCallback(
    (collectionId: string) => {
      const name = query.data?.find((c) => c.id === collectionId)?.name;
      toast.show(name ? `Added to ${name}` : "Added to collection", "success");
    },
    [query.data, toast],
  );

  const addCardToCollection = useMutation({
    mutationFn: (input: AddCollectionCardInput) => upsertCollectionCard(db, input),
    onSuccess: (_data, { collectionId }) => {
      showAddedToast(collectionId);
      recordCollectionValueSnapshot();
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
    },
    onError: onMutationError,
  });

  // Batch add (scanner library). One transaction for all rows and ONE
  // snapshot + invalidation pass at the end — per-card mutates fired a full
  // refetch storm for every card in the batch.
  const addCardsToCollection = useMutation({
    mutationFn: async ({
      collectionId,
      cards,
    }: {
      collectionId: string;
      cards: Omit<AddCollectionCardInput, "collectionId">[];
    }) => {
      await db.withTransactionAsync(async () => {
        for (const card of cards) {
          await upsertCollectionCard(db, { collectionId, ...card });
        }
      });
    },
    onSuccess: (_data, { collectionId }) => {
      showAddedToast(collectionId);
      recordCollectionValueSnapshot();
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
    },
    onError: onMutationError,
  });

  const removeCardFromCollection = useMutation({
    mutationFn: ({ collectionId, cardId }: { collectionId: string; cardId: string }) => {
      db.runSync(
        "DELETE FROM collection_cards WHERE collection_id = ? AND card_id = ?",
        [collectionId, cardId],
      );
      return Promise.resolve();
    },
    onSuccess: (_data, { collectionId }) => {
      recordCollectionValueSnapshot();
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
    },
    onError: onMutationError,
  });

  // Delete specific rows by their unique id (multi-select). Unlike
  // removeCardFromCollection (which keys on card_id and drops every variant), this
  // removes exactly the selected tiles.
  const removeCardRows = useMutation({
    mutationFn: ({ ids }: { collectionId: string; ids: string[] }) => {
      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        db.runSync(
          `DELETE FROM collection_cards WHERE id IN (${placeholders})`,
          ids,
        );
      }
      return Promise.resolve();
    },
    onSuccess: (_data, { collectionId }) => {
      recordCollectionValueSnapshot();
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
    },
    onError: onMutationError,
  });

  // Move specific rows (multi-select) into another collection. If the target
  // already holds the same config (card + pricing + variant + condition +
  // grade), merge quantities instead of leaving duplicate rows behind.
  const moveCardRows = useMutation({
    mutationFn: async ({
      toCollectionId,
      ids,
    }: {
      fromCollectionId: string;
      toCollectionId: string;
      ids: string[];
    }) => {
      if (ids.length === 0) return;
      await db.withTransactionAsync(async () => {
        for (const rowId of ids) {
          const row = await db.getFirstAsync<{
            collection_id: string;
            card_id: string;
            pricing_type: string;
            variant: string;
            condition: string;
            graded_company: string | null;
            graded_grade: string | null;
            quantity: number;
          }>("SELECT * FROM collection_cards WHERE id = ?", [rowId]);
          if (!row || row.collection_id === toCollectionId) continue;
          const existing = await db.getFirstAsync<{ id: string }>(
            `SELECT id FROM collection_cards
             WHERE collection_id = ? AND card_id = ? AND pricing_type = ? AND variant = ? AND condition = ?
             AND COALESCE(graded_company, '') = ? AND COALESCE(graded_grade, '') = ?`,
            [toCollectionId, row.card_id, row.pricing_type, row.variant, row.condition, row.graded_company ?? "", row.graded_grade ?? ""],
          );
          if (existing) {
            await db.runAsync(
              "UPDATE collection_cards SET quantity = quantity + ? WHERE id = ?",
              [row.quantity, existing.id],
            );
            await db.runAsync("DELETE FROM collection_cards WHERE id = ?", [
              rowId,
            ]);
          } else {
            await db.runAsync(
              "UPDATE collection_cards SET collection_id = ? WHERE id = ?",
              [toCollectionId, rowId],
            );
          }
        }
      });
    },
    onSuccess: (_data, { fromCollectionId, toCollectionId }) => {
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
      for (const cid of [fromCollectionId, toCollectionId]) {
        queryClient.invalidateQueries({ queryKey: ["collection", cid] });
        queryClient.invalidateQueries({ queryKey: ["collectionCards", cid] });
      }
    },
    onError: onMutationError,
  });

  const incrementCardQuantity = useMutation({
    mutationFn: ({
      collectionId,
      cardId,
      pricingType = "Raw",
      variant = "normal",
      condition = "NM",
      gradedCompany,
      gradedGrade,
    }: {
      collectionId: string;
      cardId: string;
      pricingType?: string;
      variant?: string;
      condition?: string;
      gradedCompany?: string;
      gradedGrade?: string;
    }) => {
      db.runSync(
        `UPDATE collection_cards SET quantity = quantity + 1
         WHERE collection_id = ? AND card_id = ? AND pricing_type = ? AND variant = ? AND condition = ?
         AND COALESCE(graded_company, '') = ? AND COALESCE(graded_grade, '') = ?`,
        [collectionId, cardId, pricingType, variant, condition, gradedCompany ?? "", gradedGrade ?? ""],
      );
      return Promise.resolve();
    },
    onSuccess: (_data, { collectionId }) => {
      recordCollectionValueSnapshot();
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
    },
    onError: onMutationError,
  });

  const decrementCardQuantity = useMutation({
    mutationFn: ({
      collectionId,
      cardId,
      pricingType = "Raw",
      variant = "normal",
      condition = "NM",
      gradedCompany,
      gradedGrade,
    }: {
      collectionId: string;
      cardId: string;
      pricingType?: string;
      variant?: string;
      condition?: string;
      gradedCompany?: string;
      gradedGrade?: string;
    }) => {
      db.runSync(
        `UPDATE collection_cards SET quantity = quantity - 1
         WHERE collection_id = ? AND card_id = ? AND pricing_type = ? AND variant = ? AND condition = ?
         AND COALESCE(graded_company, '') = ? AND COALESCE(graded_grade, '') = ?`,
        [collectionId, cardId, pricingType, variant, condition, gradedCompany ?? "", gradedGrade ?? ""],
      );
      return Promise.resolve();
    },
    onSuccess: (_data, { collectionId }) => {
      recordCollectionValueSnapshot();
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
    },
    onError: onMutationError,
  });

  const updateCardPricePaid = useMutation({
    mutationFn: ({
      collectionId,
      cardId,
      pricingType = "Raw",
      variant = "normal",
      condition = "NM",
      gradedCompany,
      gradedGrade,
      pricePaid,
    }: {
      collectionId: string;
      cardId: string;
      pricingType?: string;
      variant?: string;
      condition?: string;
      gradedCompany?: string;
      gradedGrade?: string;
      pricePaid: number | null;
    }) => {
      db.runSync(
        `UPDATE collection_cards SET price_paid = ?
         WHERE collection_id = ? AND card_id = ? AND pricing_type = ? AND variant = ? AND condition = ?
         AND COALESCE(graded_company, '') = ? AND COALESCE(graded_grade, '') = ?`,
        [pricePaid, collectionId, cardId, pricingType, variant, condition, gradedCompany ?? "", gradedGrade ?? ""],
      );
      return Promise.resolve();
    },
    onSuccess: (_data, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
    },
    onError: onMutationError,
  });

  return {
    collections: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    createCollection,
    deleteCollection,
    renameCollection,
    addCardToCollection,
    addCardsToCollection,
    removeCardFromCollection,
    removeCardRows,
    moveCardRows,
    incrementCardQuantity,
    decrementCardQuantity,
    updateCardPricePaid,
  };
}

export function useCollectionDetail(id: string) {
  const db = getDatabase();

  const detailSql = `SELECT
        c.id,
        c.name,
        c.created_at,
        COALESCE(SUM(cc.quantity), 0) as card_count,
        COALESCE(SUM(cc.card_value * cc.quantity), 0) as total_value,
        (SELECT GROUP_CONCAT(card_image_url) FROM (
          SELECT card_image_url FROM collection_cards
          WHERE collection_id = c.id
          ORDER BY card_value DESC
          LIMIT 4
        )) as card_images
      FROM collections c
      LEFT JOIN collection_cards cc ON cc.collection_id = c.id
      WHERE c.id = ?
      GROUP BY c.id`;

  return useQuery({
    queryKey: ["collection", id],
    // Refetches (post-mutation invalidations) read off the JS thread.
    queryFn: async () => {
      const row = await db.getFirstAsync<CollectionRow>(detailSql, [id]);
      return row ? mapRow(row) : null;
    },
    // First render hydrates from a one-time sync read so the summary banner
    // doesn't flicker in a frame later.
    initialData: id
      ? () => {
          const row = db.getFirstSync<CollectionRow>(detailSql, [id]);
          return row ? mapRow(row) : null;
        }
      : undefined,
    enabled: !!id,
  });
}

interface CollectionCardRow {
  id: string;
  collection_id: string;
  card_id: string;
  card_name: string;
  card_number: string | null;
  set_name: string | null;
  card_image_url: string;
  card_value: number;
  added_at: string;
  pricing_type: string;
  product_type: string;
  variant: string;
  condition: string;
  graded_company: string | null;
  graded_grade: string | null;
  quantity: number;
  price_paid: number | null;
  card_value_updated_at: string | null;
}

function resolvePriceForRow(
  card: ScrydexCard | ScrydexSealedProduct,
  row: CollectionCardRow,
): number | undefined {
  // Sealed products price on the raw "Unopened" (U) row. A quick-add stores the
  // generic "normal"/"NM" variant+condition, which matches neither the sealed
  // product's variant nor its U condition — so look up the U price directly
  // (any variant) instead of the stored selector, which leaves the row at $0.
  if (row.product_type === "sealed") {
    return selectPrice(card, undefined, { kind: "raw", condition: "U" })?.value;
  }
  const selector: PriceSelector =
    row.pricing_type === "Graded" && row.graded_company && row.graded_grade
      ? { kind: "graded", company: row.graded_company, grade: row.graded_grade }
      : { kind: "raw", condition: row.condition };
  return selectPrice(card, row.variant, selector)?.value;
}

export function useRefreshCollectionPrices() {
  const queryClient = useQueryClient();
  const db = getDatabase();
  const api = useApi();
  const toast = useToast();
  const { isPro } = useRevenueCat();

  return useMutation({
    mutationFn: async (collectionId?: string) => {
      // Pricing is a Pro feature — non-Pro never hits the pricing API. Skip
      // silently (this also runs on an auto-refresh, so no surprise paywall).
      if (!isPro) return { updated: 0 };
      // Async read: this can be the whole table, and the sync API would block
      // the JS thread (dead taps) for the duration on big collections.
      const rows = collectionId
        ? await db.getAllAsync<CollectionCardRow>(
            "SELECT * FROM collection_cards WHERE collection_id = ?",
            [collectionId],
          )
        : await db.getAllAsync<CollectionCardRow>("SELECT * FROM collection_cards");

      if (rows.length === 0) return { updated: 0 };

      const productTypeById = new Map(rows.map((r) => [r.card_id, r.product_type]));
      const uniqueCardIds = Array.from(new Set(rows.map((r) => r.card_id)));
      const cardIds: string[] = [];
      const sealedIds: string[] = [];
      for (const cardId of uniqueCardIds) {
        if (productTypeById.get(cardId) === "sealed") sealedIds.push(cardId);
        else cardIds.push(cardId);
      }

      // One request for the whole set of unique items — the server fans out to
      // Scrydex with bounded concurrency instead of us firing N parallel calls.
      const batch = await getPricedBatch(api, { cardIds, sealedIds });
      const cardMap = new Map<string, ScrydexCard | ScrydexSealedProduct>();
      for (const c of batch.cards) cardMap.set(c.id, c);
      for (const s of batch.sealed) cardMap.set(s.id, s);

      // If we asked for items but got nothing back we're offline (or the API is
      // down) — surface it instead of silently reporting a no-op refresh.
      if (uniqueCardIds.length > 0 && cardMap.size === 0) {
        throw new Error("Price refresh failed for all cards");
      }

      const now = new Date().toISOString();
      let updated = 0;
      // One transaction for the whole sweep — a single disk sync instead of one
      // per statement — and the async API keeps the statements off the JS
      // thread, so the UI stays responsive while thousands of rows update.
      await db.withTransactionAsync(async () => {
        for (const row of rows) {
          const card = cardMap.get(row.card_id);
          if (!card) continue;

          // Backfill card_number if missing and the API returned one
          // (sealed products have no card number).
          const freshNumber = "number" in card ? getCardNumber(card) : undefined;
          if (!row.card_number && freshNumber) {
            await db.runAsync(
              "UPDATE collection_cards SET card_number = ? WHERE id = ?",
              [freshNumber, row.id],
            );
          }

          // Backfill set_name if missing and the API returned one.
          if (!row.set_name && card.expansion?.name) {
            await db.runAsync(
              "UPDATE collection_cards SET set_name = ? WHERE id = ?",
              [getExpansionDisplayName(card.expansion), row.id],
            );
          }

          // Refresh the stored image URL so stale links self-heal.
          const freshImage = getCardImage(card, row.variant, "medium");
          if (freshImage && freshImage !== row.card_image_url) {
            await db.runAsync(
              "UPDATE collection_cards SET card_image_url = ? WHERE id = ?",
              [freshImage, row.id],
            );
          }

          const price = resolvePriceForRow(card, row);
          if (price === undefined || price === null) continue;
          await db.runAsync(
            "UPDATE collection_cards SET card_value = ?, card_value_updated_at = ? WHERE id = ?",
            [price, now, row.id],
          );
          updated += 1;
        }
      });
      return { updated };
    },
    onSuccess: () => {
      recordCollectionValueSnapshot();
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
      queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
      // Prefix-invalidate so EVERY collection's detail and card list refetches —
      // covers per-collection pull-to-refresh AND the all-collections sweep
      // (24h auto-refresh and the collections-list pull-to-refresh).
      queryClient.invalidateQueries({ queryKey: ["collection"] });
      queryClient.invalidateQueries({ queryKey: ["collectionCards"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show("Couldn't refresh prices — check your connection.");
    },
  });
}

export function useCollectionCards(collectionId: string) {
  const db = getDatabase();

  const cardsSql = `SELECT * FROM collection_cards WHERE collection_id = ? ORDER BY added_at DESC`;

  const mapRows = (rows: CollectionCardRow[]) =>
    rows.map((row): CollectionCard => ({
      id: row.id,
      collectionId: row.collection_id,
      cardId: row.card_id,
      cardName: row.card_name,
      cardNumber: row.card_number ?? undefined,
      setName: row.set_name ?? undefined,
      cardImageUrl: row.card_image_url,
      cardValue: row.card_value,
      addedAt: row.added_at,
      pricingType: row.pricing_type,
      productType: row.product_type,
      variant: row.variant,
      condition: row.condition,
      gradedCompany: row.graded_company ?? undefined,
      gradedGrade: row.graded_grade ?? undefined,
      quantity: row.quantity,
      pricePaid: row.price_paid ?? undefined,
      valueUpdatedAt: row.card_value_updated_at ?? undefined,
    }));

  return useQuery({
    queryKey: ["collectionCards", collectionId],
    // Refetches (post-mutation invalidations) read off the JS thread.
    queryFn: async () =>
      mapRows(
        await db.getAllAsync<CollectionCardRow>(cardsSql, [collectionId]),
      ),
    // First render hydrates from a one-time sync read so the grid doesn't
    // flash a loading state.
    initialData: collectionId
      ? () => mapRows(db.getAllSync<CollectionCardRow>(cardsSql, [collectionId]))
      : undefined,
    enabled: !!collectionId,
  });
}

export function useAutoRefreshStalePrices() {
  const db = getDatabase();
  const refresh = useRefreshCollectionPrices();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const checkAndRefresh = useCallback(() => {
    const current = refreshRef.current;
    if (current.isPending) return;
    const cutoff = new Date(Date.now() - STALE_TTL_MS).toISOString();
    const stale = db.getFirstSync<{ id: string }>(
      `SELECT id FROM collection_cards
       WHERE card_value_updated_at IS NULL OR card_value_updated_at < ?
       LIMIT 1`,
      [cutoff],
    );
    if (stale) {
      current.mutate(undefined);
    }
  }, [db]);

  useEffect(() => {
    checkAndRefresh();
  }, [checkAndRefresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") checkAndRefresh();
    });
    return () => sub.remove();
  }, [checkAndRefresh]);

  return refresh;
}
