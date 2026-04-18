import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON, PATHS } from "@/lib/store";
import { getBotInstance } from "@/lib/bot";
import type { Config } from "@/lib/types";

function decodeJwtExpiry(token: string): { exp: number; iat: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.exp) return { exp: payload.exp, iat: payload.iat || 0 };
    return null;
  } catch {
    return null;
  }
}

function formatExpiry(exp: number): string {
  const d = new Date(exp * 1000);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }) + " WIB";
}

function getTimeRemainingText(exp: number): string {
  const now = Date.now() / 1000;
  const diff = exp - now;
  if (diff <= 0) return "sudah expired";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
}

async function notifySaweriaExpiry(exp: number, masters: string[]) {
  const bot = getBotInstance();
  if (!bot || masters.length === 0) return;

  const msg =
    `🔑 *Token Saweria Diperbarui*\n\n` +
    `📅 Kadaluarsa: ${formatExpiry(exp)}\n` +
    `⏳ Sisa waktu: ${getTimeRemainingText(exp)}\n\n` +
    `_Bot akan mengirim pengingat 3 jam sebelum expired._`;

  for (const id of masters) {
    try {
      await bot.sendMessage(id, msg, { parse_mode: "Markdown" });
    } catch {}
  }
}

function maskToken(token?: string): string {
  if (!token) return "";
  if (token.length <= 8) return "••••••••";
  return token.slice(0, 4) + "••••" + token.slice(-4);
}

function loadConfig(): Config {
  const raw = readJSON<Config | Config[]>(PATHS.config, {} as Config);
  if (Array.isArray(raw)) return raw[0] || ({} as Config);
  return raw || ({} as Config);
}

function saveConfig(config: Config) {
  writeJSON(PATHS.config, [config]);
}

// GET /api/settings — return current config (mask sensitive tokens)
export async function GET() {
  const config = loadConfig();

  return NextResponse.json({
    ...config,
    telegram_bot_token_masked: maskToken(config.telegram_bot_token),
    saweria_token_masked: maskToken(config.saweria_token),
    koalastore_api_key_masked: maskToken(config.koalastore_api_key),
    // Don't send raw tokens to frontend
    telegram_bot_token: undefined,
    saweria_token: undefined,
    koalastore_api_key: undefined,
  });
}

// POST /api/settings — update config (partial merge)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const config = loadConfig();

  // Merge top-level and nested fields
  if (body.store_name !== undefined) config.store_name = body.store_name;
  if (body.admin_contact_telegram !== undefined) config.admin_contact_telegram = body.admin_contact_telegram;
  if (body.operating_hours !== undefined) config.operating_hours = body.operating_hours;

  if (body.gatekeeper) {
    config.gatekeeper = {
      enabled: body.gatekeeper.enabled ?? config.gatekeeper?.enabled ?? false,
      channel: {
        id: body.gatekeeper.channel?.id ?? config.gatekeeper?.channel?.id ?? "",
        link: body.gatekeeper.channel?.link ?? config.gatekeeper?.channel?.link ?? "",
      },
      group: {
        id: body.gatekeeper.group?.id ?? config.gatekeeper?.group?.id ?? "",
        link: body.gatekeeper.group?.link ?? config.gatekeeper?.group?.link ?? "",
      },
    };
  }

  if (body.saweria) {
    config.saweria = {
      user_id: body.saweria.user_id ?? config.saweria?.user_id ?? "",
      username: body.saweria.username ?? config.saweria?.username ?? "",
      email: body.saweria.email ?? config.saweria?.email ?? "",
    };
  }

  if (body.koalastore) {
    config.koalastore = {
      is_active: body.koalastore.is_active ?? config.koalastore?.is_active ?? false,
    };
  }

  if (body.order_notifications) {
    config.order_notifications = {
      ...config.order_notifications,
      ...body.order_notifications,
    };
  }

  if (body.payment_method !== undefined) {
    config.payment_method = body.payment_method;
    // Reset auto-switch flag when admin manually changes payment method
    config.saweria_auto_switched = false;
  }

  // Token fields
  if (body.telegram_bot_token !== undefined) {
    config.telegram_bot_token = body.telegram_bot_token;
    // Sync to process.env so middleware picks it up without restart
    process.env.TELEGRAM_BOT_TOKEN = body.telegram_bot_token;
  }
  if (body.saweria_token !== undefined) {
    config.saweria_token = body.saweria_token;
    const jwt = decodeJwtExpiry(body.saweria_token);
    if (jwt) {
      config.saweria_token_exp = jwt.exp;
      // Notify admins about token expiry
      const mastersRaw = readJSON<{ id: string }[]>(PATHS.masters, []);
      const masterIds = mastersRaw.map((m) => m.id);
      notifySaweriaExpiry(jwt.exp, masterIds).catch(() => {});
    }
  }
  if (body.koalastore_api_key !== undefined) config.koalastore_api_key = body.koalastore_api_key;

  saveConfig(config);

  return NextResponse.json({ success: true, config });
}
