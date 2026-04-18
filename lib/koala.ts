/**
 * KoalaStore API Client
 * Base URL: https://koalastore.digital/api/v1
 * Auth: X-API-Key header
 */

import { getKoalastoreApiKey } from "./store";

const BASE_URL = "https://koalastore.digital/api/v1";

function getApiKey(): string {
  return getKoalastoreApiKey();
}

async function koalaFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("KOALASTORE_API_KEY tidak diset");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new Error(json.message || `KoalaStore API error (${res.status})`);
  }

  return json;
}

// ── Types ────────────────────────────────────────────────

export interface KSBalance {
  balance: number;
  formatted_balance: string;
  total_balance: number;
  formatted_total_balance: string;
  pending_withdrawal: number;
  formatted_pending_withdrawal: string;
  total_topup: number;
  formatted_total_topup: string;
  total_spent: number;
  formatted_total_spent: string;
  total_withdrawn: number;
  formatted_total_withdrawn: string;
}

export interface KSVariant {
  code_variant: string;
  name: string;
  price: number;
  available_stock: number;
  is_manual_process: boolean;
  terms_and_conditions?: string;
  warranty_terms?: string;
  [key: string]: unknown;
}

export interface KSProduct {
  code: string;
  name: string;
  description: string;
  long_description?: string;
  category: string;
  image?: string;
  variants: KSVariant[];
  [key: string]: unknown;
}

export interface KSVariantTerms {
  code_variant: string;
  variant_name: string;
  terms_and_conditions: string;
  warranty_terms: string;
}

export interface KSCheckoutItem {
  variant_code: string;
  quantity: number;
}

export interface KSCheckoutResult {
  transaction_id: string;
  pin: number;
  total_amount: number;
  balance_used: number;
  balance_remaining: number;
  items: KSOrderItem[];
}

export interface KSOrderItem {
  variant_code?: string;
  name?: string;
  quantity?: number;
  price?: number;
  accounts?: string[];
  credentials?: string[];
  [key: string]: unknown;
}

export interface KSMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

// ── API Functions ────────────────────────────────────────

export async function ksGetBalance(): Promise<KSBalance> {
  const res = await koalaFetch<{ data: KSBalance }>("/balance");
  return res.data;
}

export async function ksGetProducts(
  page = 1,
  perPage = 50,
  status: string[] = ["available", "manual"]
): Promise<{ data: KSProduct[]; meta: KSMeta }> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  for (const s of status) params.append("status[]", s);

  const res = await koalaFetch<{ data: KSProduct[]; meta: KSMeta }>(
    `/products?${params}`
  );
  return { data: res.data, meta: res.meta };
}

export async function ksGetProductDetail(
  code: string
): Promise<KSProduct> {
  const res = await koalaFetch<{ data: KSProduct }>(`/products/${encodeURIComponent(code)}`);
  return res.data;
}

export async function ksGetVariantTerms(
  productCode: string,
  variantCode: string
): Promise<KSVariantTerms> {
  const res = await koalaFetch<{ data: KSVariantTerms }>(
    `/products/${encodeURIComponent(productCode)}/variants/${encodeURIComponent(variantCode)}/terms`
  );
  return res.data;
}

export async function ksCreateOrder(
  items: KSCheckoutItem[]
): Promise<KSCheckoutResult> {
  const res = await koalaFetch<{ data: KSCheckoutResult }>("/checkout", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  return res.data;
}

export async function ksGetOrders(
  page = 1,
  perPage = 20,
  status?: string
): Promise<{ data: unknown[]; meta: KSMeta }> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  params.set("sort_by", "newest");
  if (status) params.set("status", status);

  const res = await koalaFetch<{ data: unknown[]; meta: KSMeta }>(
    `/orders?${params}`
  );
  return { data: res.data, meta: res.meta };
}

/**
 * Fetch all KoalaStore products across all pages.
 */
export async function ksGetAllProducts(): Promise<KSProduct[]> {
  const all: KSProduct[] = [];
  let page = 1;

  while (true) {
    const res = await ksGetProducts(page, 50);
    all.push(...res.data);
    if (page >= res.meta.last_page) break;
    page++;
  }

  return all;
}
