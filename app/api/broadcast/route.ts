import { NextRequest, NextResponse } from "next/server";
import { getUsers } from "@/lib/store";
import { getBotInstance } from "@/lib/bot";

// POST /api/broadcast — send message to all users
// Supports text-only or text + image (multipart/form-data)
// Streams progress as newline-delimited JSON
export async function POST(req: NextRequest) {
  const bot = getBotInstance();
  if (!bot) {
    return NextResponse.json({ error: "Bot tidak aktif" }, { status: 503 });
  }

  let message = "";
  let imageBuffer: Buffer | null = null;
  let imageName = "";

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    message = (formData.get("message") as string) || "";
    const file = formData.get("image") as File | null;
    if (file && file.size > 0) {
      const arrayBuffer = await file.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      imageName = file.name;
    }
  } else {
    const body = await req.json();
    message = body.message || "";
  }

  if (!message.trim()) {
    return NextResponse.json({ error: "Pesan tidak boleh kosong" }, { status: 400 });
  }

  const users = getUsers();
  if (users.length === 0) {
    return NextResponse.json({ error: "Tidak ada user terdaftar" }, { status: 400 });
  }

  // Stream progress
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let sent = 0;
      let failed = 0;

      function sendProgress(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      sendProgress({ type: "start", total: users.length });

      for (const userId of users) {
        const chatId = Number(userId);
        if (isNaN(chatId)) {
          failed++;
          continue;
        }

        try {
          if (imageBuffer) {
            await bot.sendPhoto(chatId, imageBuffer, {
              caption: message,
              parse_mode: "Markdown",
            });
          } else {
            await bot.sendMessage(chatId, message, {
              parse_mode: "Markdown",
            });
          }
          sent++;
        } catch {
          failed++;
        }

        sendProgress({ type: "progress", sent, failed, total: users.length });

        // Delay 50ms between messages to avoid Telegram rate limits
        await new Promise((r) => setTimeout(r, 50));
      }

      sendProgress({ type: "done", sent, failed, total: users.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
