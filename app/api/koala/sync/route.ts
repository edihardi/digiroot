import { NextResponse } from "next/server";
import { readJSON, writeJSON, PATHS } from "@/lib/store";
import { ksGetAllProducts } from "@/lib/koala";
import type { Product } from "@/lib/types";

// POST /api/koala/sync — sync products from KoalaStore
export async function POST() {
  try {
    const ksProducts = await ksGetAllProducts();
    const localProducts = readJSON<Product[]>(PATHS.products);

    let added = 0;
    let updated = 0;

    for (const ksp of ksProducts) {
      if (!ksp.variants || ksp.variants.length === 0) continue;

      for (const variant of ksp.variants) {
        if (variant.available_stock <= 0 && !variant.is_manual_process) continue;

        const productId = `ks-${variant.code_variant}`;
        const productName = `[KS] ${ksp.name} - ${variant.name}`;
        const existing = localProducts.find((p) => p.productId === productId);

        const warranty = variant.warranty_terms || "";
        const terms = variant.terms_and_conditions || "";

        if (existing) {
          // Update base price & description, recalculate sell price, keep profit
          existing.productName = productName;
          existing.category = ksp.category || "KoalaStore";
          existing.ks_base_price = variant.price;
          existing.priceProduct = variant.price + (existing.profit || 0);
          existing.description = ksp.description || "";
          existing.warranty = warranty;
          existing.usage = terms;
          existing.source = "koalastore";
          existing.variant_code = variant.code_variant;
          updated++;
        } else {
          localProducts.push({
            productName,
            productId,
            category: ksp.category || "KoalaStore",
            costPrice: variant.price,
            priceProduct: variant.price, // sell price = base + 0 profit initially
            ks_base_price: variant.price,
            profit: 0, // admin sets profit manually
            format: "koalastore",
            totalProdukTerjual: 0,
            description: ksp.description || "",
            warranty,
            activation: "",
            email: "",
            usage: terms,
            source: "koalastore",
            variant_code: variant.code_variant,
          });
          added++;
        }
      }
    }

    writeJSON(PATHS.products, localProducts);

    return NextResponse.json({
      success: true,
      added,
      updated,
      total: localProducts.filter((p) => p.source === "koalastore").length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal sync produk";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
