import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON, PATHS } from "@/lib/store";
import type { Product } from "@/lib/types";

// GET /api/products — list all products
export async function GET() {
  const products = readJSON<Product[]>(PATHS.products);
  return NextResponse.json(products);
}

// POST /api/products — add a new product
export async function POST(req: NextRequest) {
  const body = await req.json();

  const required = ["productName", "productId", "category", "priceProduct", "format"];
  for (const field of required) {
    if (!body[field] && body[field] !== 0) {
      return NextResponse.json({ error: `Field "${field}" wajib diisi` }, { status: 400 });
    }
  }

  const products = readJSON<Product[]>(PATHS.products);

  // Check duplicate productId
  if (products.some((p) => p.productId === body.productId)) {
    return NextResponse.json({ error: "Product ID sudah ada" }, { status: 400 });
  }

  const costPrice = Number(body.costPrice) || 0;
  const priceProduct = Number(body.priceProduct);

  const newProduct: Product = {
    productName: body.productName,
    productId: body.productId,
    category: body.category,
    costPrice,
    priceProduct,
    profit: priceProduct - costPrice,
    format: body.format,
    totalProdukTerjual: 0,
    description: body.description || "",
    warranty: body.warranty || "",
    activation: body.activation || "",
    email: body.email || "",
    usage: body.usage || "",
  };

  products.push(newProduct);
  writeJSON(PATHS.products, products);

  return NextResponse.json(newProduct, { status: 201 });
}
