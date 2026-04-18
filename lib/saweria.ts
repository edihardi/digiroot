import type TelegramBot from "node-telegram-bot-api";

const SAWERIA_BACKEND = "https://backend.saweria.co";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:146.0) Gecko/20100101 Firefox/146.0",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  Origin: "https://saweria.co",
  Referer: "https://saweria.co/",
};

// ── Token Expiry Notification ─────────────────────────────

let tokenExpiredNotified = false;
let botRef: TelegramBot | null = null;
let adminChatId: string | null = null;

/**
 * Register the bot instance and admin chat ID for token expiry notifications.
 * Call this once when the bot starts.
 */
export function setSaweriaNotifier(
  bot: TelegramBot,
  adminId: string
): void {
  botRef = bot;
  adminChatId = adminId;
  tokenExpiredNotified = false; // reset on new bot session
}

/**
 * Reset the notified flag so the next expiry will trigger a new notification.
 * Call this after the admin updates the token.
 */
export function resetTokenExpiredFlag(): void {
  tokenExpiredNotified = false;
}

async function notifyTokenExpired(context: string): Promise<void> {
  if (tokenExpiredNotified || !botRef || !adminChatId) return;
  tokenExpiredNotified = true; // only notify once per session

  const msg =
    `⚠️ *SAWERIA TOKEN EXPIRED*\n\n` +
    `Saweria token sudah tidak valid.\n` +
    `Context: \`${context}\`\n\n` +
    `🔧 *Cara update:*\n` +
    `1. Login ke saweria.co di browser\n` +
    `2. Buka DevTools → Network tab\n` +
    `3. Cari request ke \`backend.saweria.co\`\n` +
    `4. Copy header \`Authorization\` (Bearer token)\n` +
    `5. Update \`SAWERIA_TOKEN\` di .env\n` +
    `6. Restart server`;

  try {
    await botRef.sendMessage(adminChatId, msg, { parse_mode: "Markdown" });
    console.log("[Saweria] Token expired notification sent to admin");
  } catch (err) {
    console.error("[Saweria] Failed to send token expired notification:", err);
  }
}

function isAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

// ── API Functions ─────────────────────────────────────────

/**
 * Decode Saweria JWT token to extract user ID.
 */
export function decodeSaweriaUserId(token: string): string {
  const raw = token.replace("Bearer ", "");
  const parts = raw.split(".");
  if (parts.length < 2) throw new Error("Saweria Token invalid");
  const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
  if (!payload.id) throw new Error("Saweria Token: no user ID found");
  return payload.id;
}

/**
 * Create a Saweria QRIS snap donation.
 * Returns the donation data including `id`, `amount`, `qr_string`.
 */
export async function createSaweriaSnap(params: {
  token: string;
  amount: number;
  message: string;
  customerName: string;
  customerEmail: string;
}): Promise<{
  id: string;
  amount: number;
  qr_string: string;
}> {
  const userId = decodeSaweriaUserId(params.token);

  const authHeader = params.token.startsWith("Bearer ")
    ? params.token
    : `Bearer ${params.token}`;

  const res = await fetch(`${SAWERIA_BACKEND}/donations/snap/${userId}`, {
    method: "POST",
    headers: {
      ...defaultHeaders,
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      agree: true,
      notUnderage: true,
      message: params.message,
      amount: params.amount,
      payment_type: "qris",
      vote: "",
      currency: "IDR",
      customer_info: {
        first_name: params.customerName,
        email: params.customerEmail,
        phone: "",
      },
    }),
  });

  if (isAuthError(res.status)) {
    await notifyTokenExpired("createSaweriaSnap");
    throw new Error("Saweria Token expired. Admin telah dinotifikasi.");
  }

  if (!res.ok) throw new Error(`Saweria API Error: ${res.statusText}`);

  const json = await res.json();
  return json.data;
}

/**
 * Check payment status of a Saweria snap donation.
 * Returns "Success", "Pending", "Failed", "Expired", or null.
 */
export async function checkSaweriaPayment(
  saweriaId: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${SAWERIA_BACKEND}/donations/qris/snap/${saweriaId}`,
      { headers: defaultHeaders }
    );
    // Payment check endpoint doesn't require auth token,
    // so no auth error handling needed here
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.transaction_status || null;
  } catch {
    return null;
  }
}

/**
 * Validate Saweria token by fetching user info.
 */
export async function checkSaweriaUser(
  token: string
): Promise<{ valid: boolean; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(`${SAWERIA_BACKEND}/users`, {
      headers: {
        ...defaultHeaders,
        Authorization: token.startsWith("Bearer ")
          ? token
          : `Bearer ${token}`,
      },
    });
    if (isAuthError(res.status)) {
      await notifyTokenExpired("checkSaweriaUser");
      return { valid: false };
    }
    if (!res.ok) return { valid: false };
    const json = await res.json();
    return { valid: true, data: json.data };
  } catch {
    return { valid: false };
  }
}

/**
 * Fetch recent Saweria transactions.
 */
export async function getSaweriaTransactions(
  token: string
): Promise<Record<string, unknown>[]> {
  try {
    const authHeader = token.startsWith("Bearer ")
      ? token
      : `Bearer ${token}`;
    const res = await fetch(
      `${SAWERIA_BACKEND}/transactions?page=1&page_size=15`,
      {
        headers: {
          ...defaultHeaders,
          Authorization: authHeader,
        },
      }
    );
    if (isAuthError(res.status)) {
      await notifyTokenExpired("getSaweriaTransactions");
      return [];
    }
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}
