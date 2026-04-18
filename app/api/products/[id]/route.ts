import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON, PATHS } from "@/lib/store";
import type { Product } from "@/lib/types";

// PUT /api/products/[id] — update product
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const products = readJSON<Product[]>(PATHS.products);

  const idx = products.findIndex((p) => p.productId === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
  }

  // Update fields (keep totalProdukTerjual unchanged)
  const costPrice = body.costPrice != null ? Number(body.costPrice) : (products[idx].costPrice || 0);
  const priceProduct = body.priceProduct != null ? Number(body.priceProduct) : products[idx].priceProduct;

  const updated: Product = {
    ...products[idx],
    productName: body.productName ?? products[idx].productName,
    productId: body.productId ?? products[idx].productId,
    category: body.category ?? products[idx].category,
    costPrice,
    priceProduct,
    profit: priceProduct - costPrice,
    format: body.format ?? products[idx].format,
    description: body.description ?? products[idx].description,
    warranty: body.warranty ?? products[idx].warranty,
    activation: body.activation ?? products[idx].activation,
    email: body.email ?? products[idx].email,
    usage: body.usage ?? products[idx].usage,
  };

  products[idx] = updated;
  writeJSON(PATHS.products, products);

  return NextResponse.json(updated);
}

// DELETE /api/products/[id] — delete product
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const products = readJSON<Product[]>(PATHS.products);

  const idx = products.findIndex((p) => p.productId === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
  }

  products.splice(idx, 1);
  writeJSON(PATHS.products, products);

  return NextResponse.json({ success: true });
}
