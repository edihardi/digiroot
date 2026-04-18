import { NextResponse } from "next/server";
import { readJSON, writeJSON, PATHS } from "@/lib/store";
import type { Master } from "@/lib/types";

// DELETE /api/masters/[id] — remove a master admin
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const masters = readJSON<Master[]>(PATHS.masters);
    const idx = masters.findIndex((m) => m.id === id);

    if (idx === -1) {
      return NextResponse.json(
        { error: "Admin tidak ditemukan" },
        { status: 404 }
      );
    }

    masters.splice(idx, 1);
    writeJSON(PATHS.masters, masters);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal hapus admin";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
