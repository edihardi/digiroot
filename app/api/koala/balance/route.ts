import { NextResponse } from "next/server";
import { ksGetBalance } from "@/lib/koala";

// GET /api/koala/balance — check KoalaStore balance
export async function GET() {
  try {
    const balance = await ksGetBalance();
    return NextResponse.json({ success: true, data: balance });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal cek saldo";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
