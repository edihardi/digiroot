import { NextResponse } from "next/server";
import { getBotInstance } from "@/lib/bot";

// GET /api/bot/status — check if bot is running
export async function GET() {
  const bot = getBotInstance();
  const active = bot !== null;

  let username = "";
  if (bot) {
    try {
      const me = await bot.getMe();
      username = me.username || "";
    } catch {
      // bot may be in error state
    }
  }

  return NextResponse.json({ active, username });
}
