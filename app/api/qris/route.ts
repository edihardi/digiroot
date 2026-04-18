import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const QRIS_PATH = path.join(process.cwd(), "public", "qris.jpeg");

// GET /api/qris — check if QRIS image exists
export async function GET() {
  const exists = fs.existsSync(QRIS_PATH);
  return NextResponse.json({
    exists,
    url: exists ? `/qris.jpeg?t=${Date.now()}` : null,
  });
}

// POST /api/qris — upload QRIS image
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const tmpPath = `${QRIS_PATH}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, QRIS_PATH);

    return NextResponse.json({
      success: true,
      url: `/qris.jpeg?t=${Date.now()}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/qris — remove QRIS image
export async function DELETE() {
  if (fs.existsSync(QRIS_PATH)) {
    fs.unlinkSync(QRIS_PATH);
  }
  return NextResponse.json({ success: true });
}
