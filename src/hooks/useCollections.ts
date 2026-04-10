import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDatabase } from "@/lib/database";
import type { Collection, CollectionCard } from "@/types/collection";

const COLLECTIONS_KEY = ["collections"] as const;

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
    },
  });

  const deleteCollection = useMutation({
    mutationFn: (id: string) => {
      db.runSync("DELETE FROM collections WHERE id = ?", [id]);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
    },
  });

  const renameCollection = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => {
      db.runSync("UPDATE collections SET name = ? WHERE id = ?", [name, id]);
      return Promise.resolve(id);
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", id] });
    },
  });

  const addCardToCollection = useMutation({
    mutationFn: ({
      collectionId,
      cardId,
      cardName,
      cardImageUrl,
      cardValue,
      pricingType = "Raw",
      source = "TCGPlayer",
      condition = "NEAR_MINT",
      gradedCompany,
      gradedGrade,
    }: {
      collectionId: string;
      cardId: string;
      cardName: string;
      cardImageUrl: string;
      cardValue: number;
      pricingType?: string;
      source?: string;
      condition?: string;
      gradedCompany?: string;
      gradedGrade?: string;
    }) => {
      const id = Date.now().toString();
      db.runSync(
        "INSERT OR IGNORE INTO collection_cards (id, collection_id, card_id, card_name, card_image_url, card_value, pricing_type, source, condition, graded_company, graded_grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, collectionId, cardId, cardName, cardImageUrl, cardValue, pricingType, source, condition, gradedCompany ?? null, gradedGrade ?? null],
      );
      return Promise.resolve();
    },
    onSuccess: (_data, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
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
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
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
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["collectionCards", collectionId] });
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
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] });
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
  card_image_url: string;
  card_value: number;
  added_at: string;
  pricing_type: string;
  source: string;
  condition: string;
  graded_company: string | null;
  graded_grade: string | null;
  quantity: number;
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
        cardImageUrl: row.card_image_url,
        cardValue: row.card_value,
        addedAt: row.added_at,
        pricingType: row.pricing_type,
        source: row.source,
        condition: row.condition,
        gradedCompany: row.graded_company ?? undefined,
        gradedGrade: row.graded_grade ?? undefined,
        quantity: row.quantity,
      }));
    },
    enabled: !!collectionId,
  });
}
