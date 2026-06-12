/**
 * Typed wrappers for rotom-ai-server pricing endpoints.
 * Callers pass the axios instance from useApi().
 */
import type { AxiosInstance } from "axios";
import type {
  ApiItemResponse,
  ApiListResponse,
  ScrydexCard,
  ScrydexExpansion,
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

export async function searchSets(
  api: AxiosInstance,
  opts: { q: string; page?: number; pageSize?: number; orderBy?: string },
): Promise<ApiListResponse<ScrydexExpansion>> {
  const params: Record<string, string | number> = {
    q: opts.q,
    page: opts.page ?? 1,
    page_size: opts.pageSize ?? 100,
  };
  if (opts.orderBy) params.order_by = opts.orderBy;
  const res = await api.get<ApiListResponse<ScrydexExpansion>>(
    "/api/pricing/sets",
    { params },
  );
  return res.data;
}

export async function getCard(api: AxiosInstance, id: string): Promise<ScrydexCard> {
  const res = await api.get<ApiItemResponse<ScrydexCard>>(
    `/api/pricing/cards/${encodeURIComponent(id)}`,
  );
  return res.data.data;
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
  opts: { q: string; page?: number; pageSize?: number; includePrices?: boolean },
): Promise<ApiListResponse<ScrydexSealedProduct>> {
  const params: Record<string, string | number> = {
    q: opts.q,
    page: opts.page ?? 1,
    page_size: opts.pageSize ?? 30,
  };
  if (opts.includePrices) params.include = "prices";
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
