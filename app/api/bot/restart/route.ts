import { NextResponse } from "next/server";
import { stopBot, startBot, getBotInstance } from "@/lib/bot";

// POST /api/bot/restart — restart the Telegram bot
export async function POST() {
  try {
    await stopBot();
    await startBot();

    const bot = getBotInstance();
    const active = bot !== null;

    return NextResponse.json({ success: true, active });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal restart bot";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
