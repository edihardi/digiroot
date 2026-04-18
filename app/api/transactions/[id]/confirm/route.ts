import { NextRequest, NextResponse } from "next/server";
import { confirmQrisPayment } from "@/lib/bot";

// POST /api/transactions/[id]/confirm — admin confirms QRIS payment
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reference } = await params;

  const result = await confirmQrisPayment(reference);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
