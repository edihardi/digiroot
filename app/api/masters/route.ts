import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON, PATHS } from "@/lib/store";
import type { Master } from "@/lib/types";

// GET /api/masters — list all master admins
export async function GET() {
  const masters = readJSON<Master[]>(PATHS.masters);
  return NextResponse.json(masters);
}

// POST /api/masters — add a new master admin
export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();

    if (!id || typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { error: "Telegram User ID harus diisi" },
        { status: 400 }
      );
    }

    const trimmed = id.trim();
    const masters = readJSON<Master[]>(PATHS.masters);

    // Check duplicate
    if (masters.some((m) => m.id === trimmed)) {
      return NextResponse.json(
        { error: "Admin sudah terdaftar" },
        { status: 409 }
      );
    }

    const newMaster: Master = {
      id: trimmed,
      addedAt: new Date().toISOString(),
    };

    masters.push(newMaster);
    writeJSON(PATHS.masters, masters);

    return NextResponse.json({ success: true, master: newMaster });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal tambah admin";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
