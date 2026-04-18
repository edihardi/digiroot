import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON, PATHS } from "@/lib/store";
import type { Product } from "@/lib/types";

// POST /api/koala/bulk-profit — update profit for KoalaStore products
// Body: { profits: { [productId]: number } }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const profits: Record<string, number> = body.profits;

  if (!profits || typeof profits !== "object") {
    return NextResponse.json({ error: "Field 'profits' wajib diisi" }, { status: 400 });
  }

  const products = readJSON<Product[]>(PATHS.products);
  let updated = 0;

  for (const [productId, profit] of Object.entries(profits)) {
    const product = products.find((p) => p.productId === productId);
    if (product && product.source === "koalastore") {
      const basePrice = product.ks_base_price ?? product.priceProduct;
      product.profit = Number(profit) || 0;
      product.priceProduct = basePrice + product.profit;
      updated++;
    }
  }

  writeJSON(PATHS.products, products);

  return NextResponse.json({ success: true, updated });
}
