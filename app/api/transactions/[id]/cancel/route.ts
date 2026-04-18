import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON, PATHS } from "@/lib/store";
import { getBotInstance } from "@/lib/bot";
import { withTxLock } from "@/lib/locks";
import type { Transaction } from "@/lib/types";

// POST /api/transactions/[id]/cancel — admin cancels a pending transaction
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reference } = await params;

  const result = await withTxLock(`cancel:${reference}`, async () => {
    const transactions = readJSON<Transaction[]>(PATHS.transactions);
    const tx = transactions.find((t) => t.reference === reference);

    if (!tx) {
      return { error: "Transaksi tidak ditemukan", status: 404 };
    }
    if (tx.status !== "pending") {
      return {
        error: `Tidak bisa cancel — status sudah ${tx.status}`,
        status: 400,
      };
    }

    tx.status = "cancelled";
    writeJSON(PATHS.transactions, transactions);

    // Notify user via Telegram
    const bot = getBotInstance();
    if (bot) {
      try {
        await bot.sendMessage(
          tx.chatId,
          `❌ *Transaksi dibatalkan oleh admin.*\n\n📦 Produk: ${tx.productName}\n🔖 Ref: \`${reference}\`\n\nSilakan order kembali jika diperlukan.`,
          { parse_mode: "Markdown" }
        );
      } catch {
        // User may have blocked the bot
      }
    }

    return { success: true };
  });

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({ success: true });
}
