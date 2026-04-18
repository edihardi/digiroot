import { NextRequest, NextResponse } from "next/server";
import { readStock, writeStock } from "@/lib/store";

// GET /api/stock/[productName] — view stock count + preview
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ productName: string }> }
) {
  const { productName } = await params;
  const name = decodeURIComponent(productName);
  const lines = readStock(name);

  return NextResponse.json({
    productName: name,
    count: lines.length,
    preview: lines.slice(0, 5), // show first 5 items
  });
}

// POST /api/stock/[productName] — add stock (text body or file upload)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ productName: string }> }
) {
  const { productName } = await params;
  const name = decodeURIComponent(productName);

  const contentType = req.headers.get("content-type") || "";
  let newLines: string[] = [];

  if (contentType.includes("multipart/form-data")) {
    // File upload
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }
    const text = await file.text();
    newLines = text.split("\n").filter((l: string) => l.trim() !== "");
  } else {
    // JSON body with text field
    const body = await req.json();
    if (!body.stock || typeof body.stock !== "string") {
      return NextResponse.json({ error: "Field 'stock' wajib diisi (string)" }, { status: 400 });
    }
    newLines = (body.stock as string).split("\n").filter((l: string) => l.trim() !== "");
  }

  if (newLines.length === 0) {
    return NextResponse.json({ error: "Tidak ada stock yang valid" }, { status: 400 });
  }

  // Append to existing stock
  const existing = readStock(name);
  const combined = [...existing, ...newLines];
  writeStock(name, combined);

  return NextResponse.json({
    productName: name,
    added: newLines.length,
    total: combined.length,
  });
}
