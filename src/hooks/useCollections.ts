import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDatabase } from "@/lib/database";
import { useApi } from "@/lib/axios";
import { recordCollectionValueSnapshot } from "@/lib/collectionValueHistory";
import type { Collection, CollectionCard } from "@/types/collection";

const STALE_TTL_MS = 24 * 60 * 60 * 1000;

const COLLECTIONS_KEY = ["collections"] as const;
const COLLECTION_SNAPSHOT_KEY = ["collectionSnapshot"] as const;

interface CollectionRow {
  id: string;
  name: string;
  created_at: string;
  card_count: number;
  total_value: number;
  card_images: string | null;
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

  const query = useQuery({
    queryKey: COLLECTIONS_KEY,
    queryFn: () => {
      const rows = db.getAllSync<CollectionRow>(`
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
  });

  const addCardToCollection = useMutation({
    mutationFn: ({
      collectionId,
      cardId,
      cardName,
      cardNumber,
      setName,
      cardImageUrl,
      cardValue,
      pricingType = "Raw",
      source = "TCGPlayer",
      condition = "NEAR_MINT",
      gradedCompany,
      gradedGrade,
      pricePaid,
    }: {
      collectionId: string;
      cardId: string;
      cardName: string;
      cardNumber?: string;
      setName?: string;
      cardImageUrl: string;
      cardValue: number;
      pricingType?: string;
      source?: string;
      condition?: string;
      gradedCompany?: string;
      gradedGrade?: string;
      pricePaid?: number;
    }) => {
      // Check if this exact config already exists
      const existing = db.getFirstSync<{ id: string }>(
        `SELECT id FROM collection_cards
         WHERE collection_id = ? AND card_id = ? AND pricing_type = ? AND source = ? AND condition = ?
         AND COALESCE(graded_company, '') = ? AND COALESCE(graded_grade, '') = ?`,
        [collectionId, cardId, pricingType, source, condition, gradedCompany ?? "", gradedGrade ?? ""],
      );
      if (existing) {
        if (pricePaid !== undefined) {
          db.runSync(
            "UPDATE collection_cards SET quantity = quantity + 1, price_paid = ? WHERE id = ?",
            [pricePaid, existing.id],
          );
        } else {
          db.runSync(
            "UPDATE collection_cards SET quantity = quantity + 1 WHERE id = ?",
            [existing.id],
          );
        }
      } else {
        const id = Date.now().toString();
        db.runSync(
          "INSERT INTO collection_cards (id, collection_id, card_id, card_name, card_number, set_name, card_image_url, card_value, pricing_type, source, condition, graded_company, graded_grade, quantity, price_paid, card_value_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
          [id, collectionId, cardId, cardName, cardNumber ?? null, setName ?? null, cardImageUrl, cardValue, pricingType, source, condition, gradedCompany ?? null, gradedGrade ?? null, pricePaid ?? null, new Date().toISOString()],
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
  });

  const incrementCardQuantity = useMutation({
    mutationFn: ({
      collectionId,
      cardId,
      pricingType = "Raw",
      source = "TCGPlayer",
      condition = "NEAR_MINT",
      gradedCompany,
      gradedGrade,
    }: {
      collectionId: string;
      cardId: string;
      pricingType?: string;
      source?: string;
      condition?: string;
      gradedCompany?: string;
      gradedGrade?: string;
    }) => {
      db.runSync(
        `UPDATE collection_cards SET quantity = quantity + 1
         WHERE collection_id = ? AND card_id = ? AND pricing_type = ? AND source = ? AND condition = ?
         AND COALESCE(graded_company, '') = ? AND COALESCE(graded_grade, '') = ?`,
        [collectionId, cardId, pricingType, source, condition, gradedCompany ?? "", gradedGrade ?? ""],
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
  });

  const decrementCardQuantity = useMutation({
    mutationFn: ({
      collectionId,
      cardId,
      pricingType = "Raw",
      source = "TCGPlayer",
      condition = "NEAR_MINT",
      gradedCompany,
      gradedGrade,
    }: {
      collectionId: string;
      cardId: string;
      pricingType?: string;
      source?: string;
      condition?: string;
      gradedCompany?: string;
      gradedGrade?: string;
    }) => {
      db.runSync(
        `UPDATE collection_cards SET quantity = quantity - 1
         WHERE collection_id = ? AND card_id = ? AND pricing_type = ? AND source = ? AND condition = ?
         AND COALESCE(graded_company, '') = ? AND COALESCE(graded_grade, '') = ?`,
        [collectionId, cardId, pricingType, source, condition, gradedCompany ?? "", gradedGrade ?? ""],
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
  });

  const updateCardPricePaid = useMutation({
    mutationFn: ({
      collectionId,
      cardId,
      pricingType = "Raw",
      source = "TCGPlayer",
      condition = "NEAR_MINT",
      gradedCompany,
      gradedGrade,
      pricePaid,
    }: {
      collectionId: string;
      cardId: string;
      pricingType?: string;
      source?: string;
      condition?: string;
      gradedCompany?: string;
      gradedGrade?: string;
      pricePaid: number | null;
    }) => {
      db.runSync(
        `UPDATE collection_cards SET price_paid = ?
         WHERE collection_id = ? AND card_id = ? AND pricing_type = ? AND source = ? AND condition = ?
         AND COALESCE(graded_company, '') = ? AND COALESCE(graded_grade, '') = ?`,
        [pricePaid, collectionId, cardId, pricingType, source, condition, gradedCompany ?? "", gradedGrade ?? ""],
      );
      return Promise.resolve();
    },
    onSuccess: (_data, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
    },
  });

  return {
    collections: query.data ?? [],
    isLoading: query.isLoading,
    createCollection,
    deleteCollection,
    renameCollection,
    addCardToCollection,
    removeCardFromCollection,
    incrementCardQuantity,
    decrementCardQuantity,
    updateCardPricePaid,
  };
}

export function useCollectionDetail(id: string) {
  const db = getDatabase();

  return useQuery({
    queryKey: ["collection", id],
    queryFn: () => {
      const row = db.getFirstSync<CollectionRow>(
        `SELECT
          c.id,
          c.name,
          c.created_at,
          COALESCE(SUM(cc.quantity), 0) as card_count,
          COALESCE(SUM(cc.card_value * cc.quantity), 0) as total_value,
          GROUP_CONCAT(cc.card_image_url) as card_images
        FROM collections c
        LEFT JOIN collection_cards cc ON cc.collection_id = c.id
        WHERE c.id = ?
        GROUP BY c.id`,
        [id],
      );
      return row ? mapRow(row) : null;
    },
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
  source: string;
  condition: string;
  graded_company: string | null;
  graded_grade: string | null;
  quantity: number;
  price_paid: number | null;
  card_value_updated_at: string | null;
}

function resolvePriceForRow(card: any, row: CollectionCardRow): number | undefined {
  if (!card?.prices) return undefined;
  if (row.pricing_type === "Graded" && row.graded_company && row.graded_grade) {
    const tierKey = `${row.graded_company.toUpperCase()}_${row.graded_grade.replace(/\./g, "_")}`;
    return (
      card.prices.ebay?.[tierKey]?.avg ??
      card.prices.tcgplayer?.[tierKey]?.avg
    );
  }
  const sourceKey = row.source === "eBay" ? "ebay" : "tcgplayer";
  return card.prices[sourceKey]?.[row.condition]?.avg;
}

export function useRefreshCollectionPrices() {
  const queryClient = useQueryClient();
  const db = getDatabase();
  const api = useApi();

  return useMutation({
    mutationFn: async (collectionId?: string) => {
      const rows = collectionId
        ? db.getAllSync<CollectionCardRow>(
            "SELECT * FROM collection_cards WHERE collection_id = ?",
            [collectionId],
          )
        : db.getAllSync<CollectionCardRow>("SELECT * FROM collection_cards");

      if (rows.length === 0) return { updated: 0 };

      const uniqueCardIds = Array.from(new Set(rows.map((r) => r.card_id)));
      const results = await Promise.all(
        uniqueCardIds.map(async (cardId) => {
          try {
            const res = await api.get(`/api/pricing/cards/${cardId}`);
            return [cardId, res.data?.data] as const;
          } catch {
            return [cardId, null] as const;
          }
        }),
      );
      const cardMap = new Map(results);

      const now = new Date().toISOString();
      let updated = 0;
      for (const row of rows) {
        const card = cardMap.get(row.card_id);
        if (!card) continue;

        // Backfill card_number if missing and the API returned one.
        if (!row.card_number && card.cardNumber) {
          db.runSync(
            "UPDATE collection_cards SET card_number = ? WHERE id = ?",
            [card.cardNumber, row.id],
          );
        }

        // Backfill set_name if missing and the API returned one.
        if (!row.set_name && card.set?.name) {
          db.runSync(
            "UPDATE collection_cards SET set_name = ? WHERE id = ?",
            [card.set.name, row.id],
          );
        }

        const price = resolvePriceForRow(card, row);
        if (price === undefined || price === null) continue;
        db.runSync(
          "UPDATE collection_cards SET card_value = ?, card_value_updated_at = ? WHERE id = ?",
          [price, now, row.id],
        );
        updated += 1;
      }
      return { updated };
    },
    onSuccess: (_data, collectionId) => {
      recordCollectionValueSnapshot();
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: COLLECTION_SNAPSHOT_KEY });
      queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
      if (collectionId) {
        queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
        queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
      }
    },
  });
}

export function useCollectionCards(collectionId: string) {
  const db = getDatabase();

  return useQuery({
    queryKey: ["collectionCards", collectionId],
    queryFn: () => {
      const rows = db.getAllSync<CollectionCardRow>(
        `SELECT * FROM collection_cards WHERE collection_id = ? ORDER BY added_at DESC`,
        [collectionId],
      );
      return rows.map((row): CollectionCard => ({
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
        source: row.source,
        condition: row.condition,
        gradedCompany: row.graded_company ?? undefined,
        gradedGrade: row.graded_grade ?? undefined,
        quantity: row.quantity,
        pricePaid: row.price_paid ?? undefined,
      }));
    },
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
