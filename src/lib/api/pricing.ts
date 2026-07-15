/**
 * Typed wrappers for rotom-ai-server pricing endpoints.
 * Callers pass the axios instance from useApi().
 */
import type { AxiosInstance } from "axios";
import type {
  ApiItemResponse,
  ApiListResponse,
  ScrydexCard,
  ScrydexListing,
  ScrydexPriceHistoryDay,
  ScrydexSealedProduct,
} from "@/types/scrydex";

export async function searchCards(
  api: AxiosInstance,
  opts: {
    q: string;
    page?: number;
    pageSize?: number;
    includePrices?: boolean;
    orderBy?: string;
  },
): Promise<ApiListResponse<ScrydexCard>> {
  const params: Record<string, string | number> = {
    q: opts.q,
    page: opts.page ?? 1,
    page_size: opts.pageSize ?? 30,
  };
  if (opts.includePrices) params.include = "prices";
  if (opts.orderBy) params.order_by = opts.orderBy;
  const res = await api.get<ApiListResponse<ScrydexCard>>("/api/pricing/cards", {
    params,
  });
  return res.data;
}

export async function getCard(api: AxiosInstance, id: string): Promise<ScrydexCard> {
  const res = await api.get<ApiItemResponse<ScrydexCard>>(
    `/api/pricing/cards/${encodeURIComponent(id)}`,
  );
  return res.data.data;
}

/**
 * Prices for many cards/sealed products in a single request. The server fans
 * out to Scrydex with a bounded concurrency, so a large collection refresh is
 * one round trip instead of one call per card.
 */
export async function getPricedBatch(
  api: AxiosInstance,
  ids: {
    cardIds: string[];
    sealedIds: string[];
    /**
     * Skip the server's raw-USD price_history backfill so each card is a single
     * GET /cards/{id}. The scanner collection-add sets this — the NM price on the
     * card response is enough to store.
     */
    skipRawBackfill?: boolean;
  },
): Promise<{ cards: ScrydexCard[]; sealed: ScrydexSealedProduct[] }> {
  const res = await api.post<{
    success: boolean;
    cards: ScrydexCard[];
    sealed: ScrydexSealedProduct[];
  }>("/api/pricing/batch", ids);
  return { cards: res.data.cards ?? [], sealed: res.data.sealed ?? [] };
}

export async function getCardHistory(
  api: AxiosInstance,
  id: string,
  tier: string,
  days: number,
): Promise<ScrydexPriceHistoryDay[]> {
  const res = await api.get<ApiListResponse<ScrydexPriceHistoryDay>>(
    `/api/pricing/cards/${encodeURIComponent(id)}/history/${encodeURIComponent(tier)}`,
    { params: { days } },
  );
  return res.data.data;
}

export async function searchSealed(
  api: AxiosInstance,
  opts: {
    q: string;
    page?: number;
    pageSize?: number;
    includePrices?: boolean;
    orderBy?: string;
  },
): Promise<ApiListResponse<ScrydexSealedProduct>> {
  const params: Record<string, string | number> = {
    q: opts.q,
    page: opts.page ?? 1,
    page_size: opts.pageSize ?? 30,
  };
  if (opts.includePrices) params.include = "prices";
  if (opts.orderBy) params.order_by = opts.orderBy;
  const res = await api.get<ApiListResponse<ScrydexSealedProduct>>(
    "/api/pricing/sealed",
    { params },
  );
  return res.data;
}

export async function getSealedProduct(
  api: AxiosInstance,
  id: string,
): Promise<ScrydexSealedProduct> {
  const res = await api.get<ApiItemResponse<ScrydexSealedProduct>>(
    `/api/pricing/sealed/${encodeURIComponent(id)}`,
  );
  return res.data.data;
}

export async function getCardListings(
  api: AxiosInstance,
  id: string,
  opts: {
    page?: number;
    pageSize?: number;
    company?: string;
    grade?: string;
    orderBy?: string;
  } = {},
): Promise<ScrydexListing[]> {
  const params: Record<string, string | number> = {
    page: opts.page ?? 1,
    page_size: opts.pageSize ?? 25,
    order_by: opts.orderBy ?? "-sold_at",
  };
  if (opts.company) params.company = opts.company;
  if (opts.grade) params.grade = opts.grade;
  const res = await api.get<ApiListResponse<ScrydexListing>>(
    `/api/pricing/cards/${encodeURIComponent(id)}/listings`,
    { params },
  );
  return res.data.data;
}
