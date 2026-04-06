import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDatabase } from "@/lib/database";
import type { Collection } from "@/types/collection";

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
          COUNT(cc.id) as card_count,
          COALESCE(SUM(cc.card_value), 0) as total_value,
          GROUP_CONCAT(cc.card_image_url) as card_images
        FROM collections c
        LEFT JOIN collection_cards cc ON cc.collection_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
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

  return {
    collections: query.data ?? [],
    isLoading: query.isLoading,
    createCollection,
    deleteCollection,
  };
}
