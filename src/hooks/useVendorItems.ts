import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { getDatabase } from "@/lib/database";
import { useApi } from "@/lib/axios";
import { getPricedBatch } from "@/lib/api/pricing";
import { selectPrice, type PriceSelector } from "@/lib/scrydex";
import type { ScrydexCard, ScrydexSealedProduct } from "@/types/scrydex";
import { useToast } from "@/context/ToastContext";
import { useRevenueCat } from "@/context/RevenueCatContext";
import type { VendorItem } from "@/types/vendor";

const VENDOR_KEY = ["vendorItems"] as const;

interface VendorItemRow {
  id: string;
  card_id: string;
  card_name: string;
  card_number: string | null;
  set_name: string | null;
  card_image_url: string;
  market_value: number;
  market_value_updated_at: string | null;
  pricing_type: string;
  product_type: string;
  variant: string;
  condition: string;
  graded_company: string | null;
  graded_grade: string | null;
  quantity: number;
  asking_price: number | null;
  status: string;
  sold_price: number | null;
  sold_at: string | null;
  created_at: string;
}

export interface AddVendorItemInput {
  cardId: string;
  cardName: string;
  cardNumber?: string;
  setName?: string;
  cardImageUrl: string;
  /** Market value at add time — becomes the default asking anchor. */
  marketValue: number;
  pricingType?: string;
  productType?: string;
  variant?: string;
  condition?: string;
  gradedCompany?: string;
  gradedGrade?: string;
  quantity?: number;
}

function mapRow(row: VendorItemRow): VendorItem {
  return {
    id: row.id,
    cardId: row.card_id,
    cardName: row.card_name,
    cardNumber: row.card_number ?? undefined,
    setName: row.set_name ?? undefined,
    cardImageUrl: row.card_image_url,
    marketValue: row.market_value,
    marketValueUpdatedAt: row.market_value_updated_at ?? undefined,
    pricingType: row.pricing_type,
    productType: row.product_type,
    variant: row.variant,
    condition: row.condition,
    gradedCompany: row.graded_company ?? undefined,
    gradedGrade: row.graded_grade ?? undefined,
    quantity: row.quantity,
    askingPrice: row.asking_price ?? undefined,
    status: row.status === "sold" ? "sold" : "listed",
    soldPrice: row.sold_price ?? undefined,
    soldAt: row.sold_at ?? undefined,
    createdAt: row.created_at,
  };
}

// Insert-or-increment for one item config — same dedupe rules as
// collection_cards, but only LISTED rows merge (sold rows are receipts and
// must never absorb new stock).
async function upsertVendorItem(
  db: ReturnType<typeof getDatabase>,
  {
    cardId,
    cardName,
    cardNumber,
    setName,
    cardImageUrl,
    marketValue,
    pricingType = "Raw",
    productType = "card",
    variant = "normal",
    condition = "NM",
    gradedCompany,
    gradedGrade,
    quantity,
  }: AddVendorItemInput,
): Promise<void> {
  const qty = Math.min(99, Math.max(1, Math.round(quantity ?? 1)));
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM vendor_items
     WHERE status = 'listed' AND card_id = ? AND pricing_type = ? AND variant = ? AND condition = ?
     AND COALESCE(graded_company, '') = ? AND COALESCE(graded_grade, '') = ?`,
    [cardId, pricingType, variant, condition, gradedCompany ?? "", gradedGrade ?? ""],
  );
  if (existing) {
    await db.runAsync(
      "UPDATE vendor_items SET quantity = quantity + ? WHERE id = ?",
      [qty, existing.id],
    );
    return;
  }
  // Random suffix: batch adds land in the same millisecond (see
  // upsertCollectionCard) — keep the id unique per insert.
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await db.runAsync(
    "INSERT INTO vendor_items (id, card_id, card_name, card_number, set_name, card_image_url, market_value, market_value_updated_at, pricing_type, product_type, variant, condition, graded_company, graded_grade, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, cardId, cardName, cardNumber ?? null, setName ?? null, cardImageUrl, marketValue, new Date().toISOString(), pricingType, productType, variant, condition, gradedCompany ?? null, gradedGrade ?? null, qty],
  );
}

export function useVendorItems() {
  const queryClient = useQueryClient();
  const db = getDatabase();
  const toast = useToast();

  const onMutationError = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    toast.show("Couldn't save change. Please try again.");
  }, [toast]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: VENDOR_KEY });
  }, [queryClient]);

  const query = useQuery({
    queryKey: VENDOR_KEY,
    queryFn: async () => {
      const rows = await db.getAllAsync<VendorItemRow>(
        // Sold receipts newest-sale-first; listings newest-listed-first.
        `SELECT * FROM vendor_items
         ORDER BY status ASC, COALESCE(sold_at, created_at) DESC, created_at DESC`,
      );
      return rows.map(mapRow);
    },
    staleTime: Infinity,
  });

  // Batch add (the add sheet's "Vending" destination) — one transaction, one
  // invalidation pass, same as addCardsToCollection.
  const addVendorItems = useMutation({
    mutationFn: async (items: AddVendorItemInput[]) => {
      await db.withTransactionAsync(async () => {
        for (const item of items) {
          await upsertVendorItem(db, item);
        }
      });
    },
    onSuccess: (_data, items) => {
      toast.show(
        `Listed ${items.length === 1 ? items[0].cardName : `${items.length} cards`} for sale`,
        "success",
      );
      invalidate();
    },
    onError: onMutationError,
  });

  // "From collections": list existing collection_cards rows for sale. The
  // rows STAY in their collection — the shelf is a sales layer, not a move —
  // so nothing here touches the collections tables or their query keys.
  const listCollectionRows = useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      if (ids.length === 0) return 0;
      const placeholders = ids.map(() => "?").join(",");
      const rows = await db.getAllAsync<{
        card_id: string;
        card_name: string;
        card_number: string | null;
        set_name: string | null;
        card_image_url: string;
        card_value: number;
        pricing_type: string;
        product_type: string;
        variant: string;
        condition: string;
        graded_company: string | null;
        graded_grade: string | null;
        quantity: number;
      }>(
        `SELECT * FROM collection_cards WHERE id IN (${placeholders})`,
        ids,
      );
      await db.withTransactionAsync(async () => {
        for (const row of rows) {
          await upsertVendorItem(db, {
            cardId: row.card_id,
            cardName: row.card_name,
            cardNumber: row.card_number ?? undefined,
            setName: row.set_name ?? undefined,
            cardImageUrl: row.card_image_url,
            marketValue: row.card_value,
            pricingType: row.pricing_type,
            productType: row.product_type,
            variant: row.variant,
            condition: row.condition,
            gradedCompany: row.graded_company ?? undefined,
            gradedGrade: row.graded_grade ?? undefined,
            quantity: row.quantity,
          });
        }
      });
      return rows.length;
    },
    onSuccess: (count) => {
      toast.show(
        `Listed ${count} ${count === 1 ? "card" : "cards"} for sale`,
        "success",
      );
      invalidate();
    },
    onError: onMutationError,
  });

  const setAskingPrice = useMutation({
    mutationFn: ({ id, askingPrice }: { id: string; askingPrice: number | null }) => {
      db.runSync("UPDATE vendor_items SET asking_price = ? WHERE id = ?", [
        askingPrice,
        id,
      ]);
      return Promise.resolve();
    },
    onSuccess: invalidate,
    onError: onMutationError,
  });

  const markSold = useMutation({
    mutationFn: ({ id, soldPrice }: { id: string; soldPrice: number }) => {
      db.runSync(
        "UPDATE vendor_items SET status = 'sold', sold_price = ?, sold_at = ? WHERE id = ?",
        [soldPrice, new Date().toISOString(), id],
      );
      return Promise.resolve();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
    onError: onMutationError,
  });

  // Undo a sale — back to the listed shelf, receipt fields cleared.
  const unmarkSold = useMutation({
    mutationFn: ({ id }: { id: string }) => {
      db.runSync(
        "UPDATE vendor_items SET status = 'listed', sold_price = NULL, sold_at = NULL WHERE id = ?",
        [id],
      );
      return Promise.resolve();
    },
    onSuccess: invalidate,
    onError: onMutationError,
  });

  const removeItem = useMutation({
    mutationFn: ({ id }: { id: string }) => {
      db.runSync("DELETE FROM vendor_items WHERE id = ?", [id]);
      return Promise.resolve();
    },
    onSuccess: invalidate,
    onError: onMutationError,
  });

  const setQuantity = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => {
      const qty = Math.min(99, Math.max(1, Math.round(quantity)));
      db.runSync("UPDATE vendor_items SET quantity = ? WHERE id = ?", [qty, id]);
      return Promise.resolve();
    },
    onSuccess: invalidate,
    onError: onMutationError,
  });

  const items = useMemo(() => query.data ?? [], [query.data]);
  const listed = useMemo(
    () => items.filter((i) => i.status === "listed"),
    [items],
  );
  const sold = useMemo(() => items.filter((i) => i.status === "sold"), [items]);

  // Revenue tracker totals. Everything is per-unit × quantity.
  const summary = useMemo(() => {
    let revenue = 0;
    let soldCount = 0;
    let soldVsMarket = 0;
    for (const i of sold) {
      const price = i.soldPrice ?? 0;
      revenue += price * i.quantity;
      soldCount += i.quantity;
      soldVsMarket += (price - i.marketValue) * i.quantity;
    }
    let listedCount = 0;
    let listedMarketValue = 0;
    let listedAskingValue = 0;
    for (const i of listed) {
      listedCount += i.quantity;
      listedMarketValue += i.marketValue * i.quantity;
      // Unpriced listings fall back to market so the shelf total stays honest.
      listedAskingValue += (i.askingPrice ?? i.marketValue) * i.quantity;
    }
    return {
      revenue,
      soldCount,
      soldVsMarket,
      listedCount,
      listedMarketValue,
      listedAskingValue,
    };
  }, [listed, sold]);

  return {
    items,
    listed,
    sold,
    summary,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    addVendorItems,
    listCollectionRows,
    setAskingPrice,
    markSold,
    unmarkSold,
    removeItem,
    setQuantity,
  };
}

function resolveVendorPrice(
  card: ScrydexCard | ScrydexSealedProduct,
  row: VendorItemRow,
): number | undefined {
  // Same conventions as the collection refresh: sealed prices on the raw
  // "Unopened" row regardless of stored variant/condition.
  if (row.product_type === "sealed") {
    return selectPrice(card, undefined, { kind: "raw", condition: "U" })?.value;
  }
  const selector: PriceSelector =
    row.pricing_type === "Graded" && row.graded_company && row.graded_grade
      ? { kind: "graded", company: row.graded_company, grade: row.graded_grade }
      : { kind: "raw", condition: row.condition };
  return selectPrice(card, row.variant, selector)?.value;
}

/**
 * Refresh market prices for LISTED vendor items (sold receipts keep the
 * market value they sold against). Mirrors useRefreshCollectionPrices:
 * Pro-gated, one batch request, one write transaction.
 */
export function useRefreshVendorPrices() {
  const queryClient = useQueryClient();
  const db = getDatabase();
  const api = useApi();
  const toast = useToast();
  const { isPro } = useRevenueCat();

  return useMutation({
    mutationFn: async () => {
      if (!isPro) return { updated: 0 };
      const rows = await db.getAllAsync<VendorItemRow>(
        "SELECT * FROM vendor_items WHERE status = 'listed'",
      );
      if (rows.length === 0) return { updated: 0 };

      const cardIds: string[] = [];
      const sealedIds: string[] = [];
      for (const row of rows) {
        const bucket = row.product_type === "sealed" ? sealedIds : cardIds;
        if (!bucket.includes(row.card_id)) bucket.push(row.card_id);
      }

      const batch = await getPricedBatch(api, { cardIds, sealedIds });
      const cardMap = new Map<string, ScrydexCard | ScrydexSealedProduct>();
      for (const c of batch.cards) cardMap.set(c.id, c);
      for (const s of batch.sealed) cardMap.set(s.id, s);
      if (cardMap.size === 0) {
        throw new Error("Price refresh failed for all vendor items");
      }

      const now = new Date().toISOString();
      let updated = 0;
      await db.withTransactionAsync(async () => {
        for (const row of rows) {
          const card = cardMap.get(row.card_id);
          if (!card) continue;
          const price = resolveVendorPrice(card, row);
          if (price === undefined || price === null) continue;
          await db.runAsync(
            "UPDATE vendor_items SET market_value = ?, market_value_updated_at = ? WHERE id = ?",
            [price, now, row.id],
          );
          updated += 1;
        }
      });
      return { updated };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VENDOR_KEY });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show("Couldn't refresh prices — check your connection.");
    },
  });
}
