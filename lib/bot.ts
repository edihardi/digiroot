import TelegramBot from "node-telegram-bot-api";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import {
  readJSON,
  writeJSON,
  PATHS,
  appendUser,
  getStockCount,
  readStock,
  writeStock,
  getTelegramToken,
  getSaweriaToken,
} from "./store";
import { withProductLock, withTxLock, withUserPurchaseLock } from "./locks";
import {
  createSaweriaSnap,
  checkSaweriaPayment,
  setSaweriaNotifier,
} from "./saweria";
import type { Config, Product, Transaction } from "./types";
import { chatLog } from "./logger";
import { ksCreateOrder } from "./koala";

// ── Global State ──────────────────────────────────────────

let bot: TelegramBot | null = null;

interface SessionData {
  state: string;
  data: Record<string, unknown>;
  activeBotMessages: number[];
}

const sessions = new Map<number, SessionData>();

function getSession(chatId: number): SessionData {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { state: "IDLE", data: {}, activeBotMessages: [] });
  }
  return sessions.get(chatId)!;
}

// ── Helpers ───────────────────────────────────────────────

function loadConfig(): Config {
  const raw = readJSON<Config | Config[]>(PATHS.config, {} as Config);
  if (Array.isArray(raw)) return raw[0] || ({} as Config);
  return raw || ({} as Config);
}

function loadProducts(): Product[] {
  return readJSON<Product[]>(PATHS.products);
}

interface MasterEntry {
  id: string;
  addedAt: string;
}

function isMaster(userId: number): boolean {
  const masters = readJSON<MasterEntry[]>(PATHS.masters);
  return masters.some((m) => m.id === String(userId));
}

function getMasterIds(): string[] {
  const masters = readJSON<MasterEntry[]>(PATHS.masters);
  return masters.map((m) => m.id);
}

/**
 * Send notification to all master admins via Telegram.
 * Respects order_notifications config toggles.
 */
async function notifyAdmins(
  eventType: "new" | "paid" | "expired" | "cancelled",
  message: string
): Promise<void> {
  const botInstance = getBotInstance();
  if (!botInstance) return;

  const config = loadConfig();
  if (!config.order_notifications?.[eventType]) return;

  const ids = getMasterIds();
  for (const id of ids) {
    try {
      await botInstance.sendMessage(id, message, { parse_mode: "Markdown" });
    } catch {
      // admin may have blocked bot or invalid ID
    }
  }
}

type IKB = TelegramBot.InlineKeyboardButton[][];

function getMainMenuKeyboard(isMasterUser: boolean): IKB {
  if (isMasterUser) {
    return [
      [
        { text: "📃 List Product", callback_data: "menu_list" },
        { text: "📦 Stok", callback_data: "menu_stok" },
      ],
      [
        { text: "📜 Riwayat", callback_data: "menu_riwayat" },
        { text: "📢 Broadcast", callback_data: "menu_broadcast" },
      ],
    ];
  }
  return [
    [
      { text: "📃 List Product", callback_data: "menu_list" },
      { text: "📦 Stok", callback_data: "menu_stok" },
    ],
    [
      { text: "📜 Riwayat", callback_data: "menu_riwayat" },
      { text: "🛍️ Cara Order", callback_data: "menu_order_guide" },
    ],
    [{ text: "ℹ️ Informasi", callback_data: "menu_info" }],
  ];
}

const backButton: IKB = [[{ text: "🔙 Back", callback_data: "menu_back" }]];

async function cleanupPreviousMessages(
  botInstance: TelegramBot,
  chatId: number
): Promise<void> {
  const session = getSession(chatId);
  for (const msgId of session.activeBotMessages) {
    try {
      await botInstance.deleteMessage(chatId, msgId);
    } catch {
      // ignore — message may already be deleted or too old
    }
  }
  session.activeBotMessages = [];
}

function formatPrice(price: number): string {
  return price.toLocaleString("id-ID");
}

// ── Product Detail ────────────────────────────────────────

async function handleProductSelection(
  botInstance: TelegramBot,
  chatId: number,
  product: Product,
  productIndex: number,
  editMessageId?: number
): Promise<void> {
  const session = getSession(chatId);
  const masterUser = isMaster(Number(session.data.userId || 0));

  const isKS = product.source === "koalastore";
  const stock = isKS ? 999 : getStockCount(product.productName);
  if (stock === 0) {
    const text = `❌ Stok habis untuk *${product.productName}*.`;
    const markup = { inline_keyboard: getMainMenuKeyboard(masterUser) };
    if (editMessageId) {
      await botInstance.editMessageText(text, {
        chat_id: chatId, message_id: editMessageId,
        parse_mode: "Markdown", reply_markup: markup,
      }).catch(() => {});
    } else {
      await cleanupPreviousMessages(botInstance, chatId);
      const sent = await botInstance.sendMessage(chatId, text, {
        parse_mode: "Markdown", reply_markup: markup,
      });
      session.activeBotMessages.push(sent.message_id);
    }
    session.state = "IDLE";
    return;
  }

  const priceStr = formatPrice(product.priceProduct);

  // Quantity inline buttons
  const qtyOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 50, 100].filter(
    (n) => n <= stock
  );
  const inlineKeyboard: TelegramBot.InlineKeyboardButton[][] = [];
  const row1 = qtyOptions
    .filter((n) => n >= 1 && n <= 5)
    .map((n) => ({
      text: n.toString(),
      callback_data: `buy_${productIndex}_${n}`,
    }));
  if (row1.length) inlineKeyboard.push(row1);
  const row2 = qtyOptions
    .filter((n) => n >= 6 && n <= 10)
    .map((n) => ({
      text: n.toString(),
      callback_data: `buy_${productIndex}_${n}`,
    }));
  if (row2.length) inlineKeyboard.push(row2);
  const row3 = qtyOptions
    .filter((n) => n > 10)
    .map((n) => ({
      text: n.toString(),
      callback_data: `buy_${productIndex}_${n}`,
    }));
  if (row3.length) inlineKeyboard.push(row3);
  inlineKeyboard.push([
    { text: "❌ Cancel", callback_data: `buy_${productIndex}_cancel` },
  ]);

  // Detail message
  let detailMsg = "```\n";
  detailMsg += "╔══════════════════════════════════════╗\n";
  detailMsg += "║            DETAIL PRODUCT            ║\n";
  detailMsg += "╟──────────────────────────────────────╢\n";

  const addRow = (label: string, val: string) => {
    const content = `${label}: ${val}`;
    detailMsg += "║ " + content.padEnd(36, " ") + " ║\n";
  };

  detailMsg +=
    "║ " +
    product.productName.toUpperCase().padEnd(36, " ") +
    " ║\n";
  detailMsg += "╟──────────────────────────────────────╢\n";
  addRow("Harga", "Rp" + priceStr);
  addRow("Stok", stock + " Paket");
  detailMsg += "╟──────────────────────────────────────╢\n";
  addRow("Garansi", product.warranty || "-");
  addRow("Aktivasi", product.activation || "-");
  addRow("Email", product.email || "-");
  detailMsg += "╚══════════════════════════════════════╝\n";
  detailMsg += "```\n";

  detailMsg += `\n📝 *Deskripsi:* ${product.description || "-"}`;
  detailMsg += `\n⚠️ *Aturan:* ${product.usage || "-"}`;
  detailMsg += `\n\n🔢 *Pilih jumlah atau Ketik Manual:*`;

  const sent = await botInstance.sendMessage(chatId, detailMsg, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
  session.activeBotMessages.push(sent.message_id);

  session.state = "WAITING_QUANTITY";
  session.data.selectedProduct = product;
  session.data.productIndex = productIndex;
}

// ── Paginated Product List ────────────────────────────────

const PRODUCTS_PER_PAGE = 10;

async function sendPaginatedProducts(
  botInstance: TelegramBot,
  chatId: number,
  page: number,
  editMessageId?: number
): Promise<void> {
  const products = loadProducts();
  const session = getSession(chatId);

  if (products.length === 0) {
    const msg = "❌ Tidak ada produk yang tersedia saat ini.";
    const markup = { inline_keyboard: backButton };
    if (editMessageId) {
      await botInstance.editMessageText(msg, {
        chat_id: chatId,
        message_id: editMessageId,
        reply_markup: markup,
      }).catch(() => {});
    } else {
      const sent = await botInstance.sendMessage(chatId, msg, { reply_markup: markup });
      session.activeBotMessages.push(sent.message_id);
    }
    return;
  }

  const totalPages = Math.ceil(products.length / PRODUCTS_PER_PAGE);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * PRODUCTS_PER_PAGE;
  const pageProducts = products.slice(start, start + PRODUCTS_PER_PAGE);

  session.data.currentPage = safePage;

  let text = `📃 *DAFTAR PRODUK* (Hal. ${safePage}/${totalPages})\n\n`;
  pageProducts.forEach((p, i) => {
    const globalIdx = start + i;
    const stock = getStockCount(p.productName);
    const stockIcon = stock > 0 ? "✅" : "❌";
    text += `*${globalIdx + 1}.* ${p.productName}\n`;
    text += `   💰 Rp${formatPrice(p.priceProduct)} | ${stockIcon} Stok: ${stock}\n\n`;
  });

  // Navigation buttons
  const navButtons: TelegramBot.InlineKeyboardButton[] = [];
  if (safePage > 1) {
    navButtons.push({ text: "⬅️ Prev", callback_data: `list_page_${safePage - 1}` });
  }
  if (safePage < totalPages) {
    navButtons.push({ text: "➡️ Next", callback_data: `list_page_${safePage + 1}` });
  }

  // Product selection buttons (2 per row)
  const productButtons: TelegramBot.InlineKeyboardButton[][] = [];
  for (let i = 0; i < pageProducts.length; i += 2) {
    const row: TelegramBot.InlineKeyboardButton[] = [];
    row.push({
      text: `${start + i + 1}`,
      callback_data: `select_product_${start + i}`,
    });
    if (i + 1 < pageProducts.length) {
      row.push({
        text: `${start + i + 2}`,
        callback_data: `select_product_${start + i + 1}`,
      });
    }
    productButtons.push(row);
  }

  const inlineKeyboard = [...productButtons];
  if (navButtons.length) inlineKeyboard.push(navButtons);
  inlineKeyboard.push([{ text: "🔙 Back", callback_data: "menu_back" }]);

  text += `_Pilih nomor produk di bawah:_`;

  if (editMessageId) {
    await botInstance
      .editMessageText(text, {
        chat_id: chatId,
        message_id: editMessageId,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: inlineKeyboard },
      })
      .catch(() => {});
  } else {
    const sent = await botInstance.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
    session.activeBotMessages.push(sent.message_id);
  }
}

// ── Category-based browsing ───────────────────────────────

async function sendCategoryList(
  botInstance: TelegramBot,
  chatId: number,
  editMessageId?: number
): Promise<void> {
  const products = loadProducts();
  const session = getSession(chatId);

  if (products.length === 0) {
    const text = "❌ Tidak ada produk yang tersedia saat ini.";
    const markup = { inline_keyboard: backButton };
    if (editMessageId) {
      await botInstance.editMessageText(text, {
        chat_id: chatId, message_id: editMessageId, reply_markup: markup,
      }).catch(() => {});
    } else {
      await cleanupPreviousMessages(botInstance, chatId);
      const sent = await botInstance.sendMessage(chatId, text, { reply_markup: markup });
      session.activeBotMessages.push(sent.message_id);
    }
    return;
  }

  const categories = [...new Set(products.map((p) => p.category || "Lainnya"))];

  let stockSummary = "\n\n📦 *Status Stok:*\n";
  for (const cat of categories) {
    const catProducts = products.filter((p) => (p.category || "Lainnya") === cat);
    const totalStock = catProducts.reduce(
      (sum, p) => sum + getStockCount(p.productName),
      0
    );
    stockSummary += `📁 *${cat}* — ${catProducts.length} produk (${totalStock} stok)\n`;
  }

  const categoryInline: IKB = categories.map((c) => [
    { text: `📁 ${c}`, callback_data: `cat_${c}` },
  ]);
  categoryInline.push([{ text: "🔙 Back", callback_data: "menu_back" }]);

  const text = `🗂️ *Pilih Kategori Produk:*${stockSummary}`;
  const markup = { inline_keyboard: categoryInline };

  if (editMessageId) {
    await botInstance.editMessageText(text, {
      chat_id: chatId, message_id: editMessageId,
      parse_mode: "Markdown", reply_markup: markup,
    }).catch(() => {});
  } else {
    await cleanupPreviousMessages(botInstance, chatId);
    const sent = await botInstance.sendMessage(chatId, text, {
      parse_mode: "Markdown", reply_markup: markup,
    });
    session.activeBotMessages.push(sent.message_id);
  }
  session.state = "SELECTING_CATEGORY";
}

// ── Variant list for a category ──────────────────────────

async function sendVariantList(
  botInstance: TelegramBot,
  chatId: number,
  category: string,
  editMessageId?: number
): Promise<void> {
  const products = loadProducts();
  const session = getSession(chatId);

  session.state = "SELECTING_VARIANT";
  session.data.selectedCategory = category;

  const variants = products.filter(
    (p) => (p.category || "Lainnya") === category
  );

  let variantMsg = `🗂️ *Pilih Produk:*\n📂 Kategori: *${category}*\n\n📦 *Stok:*\n`;
  variants.forEach((v) => {
    variantMsg += `🔹 ${v.productName} — Stok: *${getStockCount(v.productName)}*\n`;
  });

  const variantInline: IKB = variants.map((v) => {
    const globalIdx = products.findIndex(
      (p) => p.productName === v.productName
    );
    return [
      {
        text: `${v.productName} (Stok: ${getStockCount(v.productName)})`,
        callback_data: `variant_${globalIdx}`,
      },
    ];
  });
  variantInline.push([{ text: "🔙 Back", callback_data: "cat_back" }]);

  const markup = { inline_keyboard: variantInline };
  if (editMessageId) {
    await botInstance.editMessageText(variantMsg, {
      chat_id: chatId, message_id: editMessageId,
      parse_mode: "Markdown", reply_markup: markup,
    }).catch(() => {});
  } else {
    await cleanupPreviousMessages(botInstance, chatId);
    const sent = await botInstance.sendMessage(chatId, variantMsg, {
      parse_mode: "Markdown", reply_markup: markup,
    });
    session.activeBotMessages.push(sent.message_id);
  }
}

// ── Inline Menu Helpers ──────────────────────────────────

async function sendMainMenu(
  botInstance: TelegramBot,
  chatId: number,
  label = "🛍️ Kembali ke menu utama.",
  editMessageId?: number
): Promise<void> {
  const session = getSession(chatId);
  session.state = "IDLE";
  const masterUser = isMaster(Number(session.data.userId || 0));
  const markup = { inline_keyboard: getMainMenuKeyboard(masterUser) };

  if (editMessageId) {
    await botInstance.editMessageText(label, {
      chat_id: chatId,
      message_id: editMessageId,
      parse_mode: "Markdown",
      reply_markup: markup,
    }).catch(() => {});
  } else {
    await cleanupPreviousMessages(botInstance, chatId);
    const sent = await botInstance.sendMessage(chatId, label, {
      parse_mode: "Markdown",
      reply_markup: markup,
    });
    session.activeBotMessages.push(sent.message_id);
  }
}

async function sendStokView(
  botInstance: TelegramBot,
  chatId: number,
  editMessageId?: number
): Promise<void> {
  const session = getSession(chatId);
  const products = loadProducts();

  let stockMsg: string;
  if (products.length === 0) {
    stockMsg = "❌ Tidak ada produk tersedia.";
  } else {
    stockMsg = "📦 *STATUS STOK SEMUA PRODUK:*\n\n";
    products.forEach((p) => {
      const s = getStockCount(p.productName);
      stockMsg += `🔹 *${p.productName}* — Stok: *${s}* ${s > 0 ? "✅" : "❌"}\n`;
    });
  }

  const markup = { inline_keyboard: backButton };
  if (editMessageId) {
    await botInstance.editMessageText(stockMsg, {
      chat_id: chatId,
      message_id: editMessageId,
      parse_mode: "Markdown",
      reply_markup: markup,
    }).catch(() => {});
  } else {
    await cleanupPreviousMessages(botInstance, chatId);
    const sent = await botInstance.sendMessage(chatId, stockMsg, {
      parse_mode: "Markdown",
      reply_markup: markup,
    });
    session.activeBotMessages.push(sent.message_id);
  }
}

async function sendOrderGuide(
  botInstance: TelegramBot,
  chatId: number,
  editMessageId?: number
): Promise<void> {
  const session = getSession(chatId);
  const orderGuide = `🛍️ *CARA ORDER*

1️⃣ Ketik /beli atau klik "List Product"
2️⃣ Pilih kategori produk
3️⃣ Pilih produk yang diinginkan
4️⃣ Pilih jumlah yang ingin dibeli
5️⃣ Pilih metode pembayaran
6️⃣ Lakukan pembayaran sesuai instruksi
7️⃣ Produk akan dikirim otomatis setelah pembayaran terverifikasi

⚠️ *Catatan:*
• Pembayaran harus sesuai nominal
• Jika ada kendala, hubungi /kontak`;

  const markup = { inline_keyboard: backButton };
  if (editMessageId) {
    await botInstance.editMessageText(orderGuide, {
      chat_id: chatId,
      message_id: editMessageId,
      parse_mode: "Markdown",
      reply_markup: markup,
    }).catch(() => {});
  } else {
    await cleanupPreviousMessages(botInstance, chatId);
    const sent = await botInstance.sendMessage(chatId, orderGuide, {
      parse_mode: "Markdown",
      reply_markup: markup,
    });
    session.activeBotMessages.push(sent.message_id);
  }
}

async function sendInfoView(
  botInstance: TelegramBot,
  chatId: number,
  editMessageId?: number
): Promise<void> {
  const session = getSession(chatId);
  const cfg = loadConfig();
  const infoMsg = `🔹 *Informasi ${cfg.store_name || "Digiroot Store"}* 🛍️

🏪 *Toko:* ${cfg.store_name || "Digiroot Store"}
⏰ *Jam Operasi:* ${cfg.operating_hours || "-"}
📱 *Admin:* ${cfg.admin_contact_telegram ? "@" + cfg.admin_contact_telegram : "-"}

🛒 *Perintah:*
/beli - Beli produk
/harga - Cek harga
/kontak - Hubungi admin`;

  const markup = { inline_keyboard: backButton };
  if (editMessageId) {
    await botInstance.editMessageText(infoMsg, {
      chat_id: chatId,
      message_id: editMessageId,
      parse_mode: "Markdown",
      reply_markup: markup,
    }).catch(() => {});
  } else {
    await cleanupPreviousMessages(botInstance, chatId);
    const sent = await botInstance.sendMessage(chatId, infoMsg, {
      parse_mode: "Markdown",
      reply_markup: markup,
    });
    session.activeBotMessages.push(sent.message_id);
  }
}

// ── Welcome Message ───────────────────────────────────────

// ── Riwayat Pembelian ────────────────────────────────────

async function sendRiwayat(
  botInstance: TelegramBot,
  chatId: number,
  editMessageId?: number
): Promise<void> {
  const session = getSession(chatId);

  const allTx = readJSON<Transaction[]>(PATHS.transactions);
  const userTx = allTx
    .filter((t) => t.chatId === chatId && (t.status === "delivered" || t.status === "paid" || t.status === "pending" || t.status === "expired" || t.status === "cancelled" || t.status === "failed"))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  if (userTx.length === 0) {
    const text = "📜 *RIWAYAT PEMBELIAN*\n\nBelum ada transaksi. Ketik /beli untuk mulai belanja!";
    const markup = { inline_keyboard: backButton };
    if (editMessageId) {
      await botInstance.editMessageText(text, {
        chat_id: chatId, message_id: editMessageId,
        parse_mode: "Markdown", reply_markup: markup,
      }).catch(() => {});
    } else {
      await cleanupPreviousMessages(botInstance, chatId);
      const sent = await botInstance.sendMessage(chatId, text, {
        parse_mode: "Markdown", reply_markup: markup,
      });
      session.activeBotMessages.push(sent.message_id);
    }
    return;
  }

  const statusEmoji: Record<string, string> = {
    delivered: "✅",
    paid: "💰",
    pending: "⏳",
    expired: "⏰",
    cancelled: "❌",
    failed: "⚠️",
  };

  let msg = "📜 *RIWAYAT PEMBELIAN*\n_(10 transaksi terakhir)_\n\n";

  userTx.forEach((tx, i) => {
    const date = new Date(tx.createdAt).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    });
    const emoji = statusEmoji[tx.status] || "❓";
    msg += `${i + 1}. ${emoji} *${tx.productName}* x${tx.quantity}\n`;
    msg += `   💵 Rp${formatPrice(tx.amount)} | ${tx.method.toUpperCase()}\n`;
    msg += `   📅 ${date} | ${tx.status.toUpperCase()}\n`;
    msg += `   🔖 \`${tx.reference}\`\n\n`;
  });

  // Build inline buttons for delivered transactions (re-send data)
  const deliveredTx = userTx.filter((t) => t.status === "delivered" && t.deliveredData);
  const inlineKeyboard: TelegramBot.InlineKeyboardButton[][] = [];
  for (const tx of deliveredTx.slice(0, 5)) {
    inlineKeyboard.push([
      {
        text: `📩 Kirim ulang: ${tx.productName}`,
        callback_data: `resend_${tx.reference}`,
      },
    ]);
  }
  inlineKeyboard.push([{ text: "🔙 Back", callback_data: "menu_back" }]);

  const markup = { inline_keyboard: inlineKeyboard };
  if (editMessageId) {
    await botInstance.editMessageText(msg, {
      chat_id: chatId, message_id: editMessageId,
      parse_mode: "Markdown", reply_markup: markup,
    }).catch(() => {});
  } else {
    await cleanupPreviousMessages(botInstance, chatId);
    const sent = await botInstance.sendMessage(chatId, msg, {
      parse_mode: "Markdown", reply_markup: markup,
    });
    session.activeBotMessages.push(sent.message_id);
  }
}

async function sendWelcomeMessage(
  botInstance: TelegramBot,
  chatId: number,
  from: TelegramBot.User
): Promise<void> {
  const session = getSession(chatId);
  const config = loadConfig();
  appendUser(String(chatId));
  await cleanupPreviousMessages(botInstance, chatId);

  const masterUser = isMaster(from.id);
  const userName = from.username || from.first_name || "Pelanggan";
  const storeName = config.store_name || "Digiroot Store";
  const now = new Date().toLocaleString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

  const welcomeMessage = `
━━━━━━━━━━━━━━
✨ *${storeName.toUpperCase()}* ✨
━━━━━━━━━━━━━━

📅 *${now}* WIB
👋 *Halo, ${userName}!*
Selamat datang di pusat layanan produk digital premium kami. Nikmati kemudahan belanja otomatis 24/7!

💎 *LAYANAN UNGGULAN:*
• Akun Premium (Netflix, Canva, Spotify)
• Lisensi Software (Windows, Office)
• Produk Digital Lainnya

🚀 *MULAI BELANJA:*
🛒 /beli - Daftar Produk & Order
ℹ️ /info - Informasi Layanan
💰 /harga - Cek Harga Terupdate
📜 /riwayat - Riwayat Pembelian
📞 /kontak - Hubungi Admin

_Pilih menu di bawah untuk mulai!_
  `;

  // Remove any old reply keyboard
  const rmKb = await botInstance.sendMessage(chatId, "⏳", {
    reply_markup: { remove_keyboard: true },
  });
  await botInstance.deleteMessage(chatId, rmKb.message_id).catch(() => {});

  const sent = await botInstance.sendMessage(chatId, welcomeMessage, {
    parse_mode: "Markdown",
  });
  session.activeBotMessages.push(sent.message_id);

  const sentMenu = await botInstance.sendMessage(
    chatId,
    `🛍️ Halo *${masterUser ? "Master" : userName}*! Pilih aksi di bawah:`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: getMainMenuKeyboard(masterUser),
      },
    }
  );
  session.activeBotMessages.push(sentMenu.message_id);
  session.state = "IDLE";
  session.data = { userId: from.id };
}

// ── Gatekeeper ────────────────────────────────────────────

async function checkMembership(
  botInstance: TelegramBot,
  chatId: number
): Promise<boolean> {
  const config = loadConfig();
  if (!config.gatekeeper?.enabled) return true;

  const channelId = config.gatekeeper.channel?.id;
  if (!channelId) return true;

  try {
    const member = await botInstance.getChatMember(channelId, chatId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch {
    return false;
  }
}

async function sendGatekeeperMessage(
  botInstance: TelegramBot,
  chatId: number
): Promise<void> {
  const config = loadConfig();
  const session = getSession(chatId);
  const channelLink = config.gatekeeper?.channel?.link || "";
  const groupLink = config.gatekeeper?.group?.link || "";

  let msg = "🔒 *Akses Terbatas*\n\nUntuk menggunakan bot ini, silakan join terlebih dahulu:\n";
  if (channelLink) msg += `\n📢 Channel: ${channelLink}`;
  if (groupLink) msg += `\n👥 Group: ${groupLink}`;
  msg += "\n\nSetelah join, klik tombol di bawah:";

  const sent = await botInstance.sendMessage(chatId, msg, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Sudah Join", callback_data: "check_gatekeeper" }],
      ],
    },
  });
  session.activeBotMessages.push(sent.message_id);
}

// ── Payment Constants ─────────────────────────────────────

const POLL_INTERVAL_MS = 5000; // 5 seconds
const POLL_MAX_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
const SAWERIA_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const QRIS_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

// ── Transaction Helpers ───────────────────────────────────

function saveTransaction(tx: Transaction): void {
  const transactions = readJSON<Transaction[]>(PATHS.transactions);
  transactions.push(tx);
  writeJSON(PATHS.transactions, transactions);
}

function updateTransactionStatus(
  reference: string,
  status: Transaction["status"],
  paidAt?: string,
  deliveredData?: string
): void {
  const transactions = readJSON<Transaction[]>(PATHS.transactions);
  const tx = transactions.find((t) => t.reference === reference);
  if (tx) {
    tx.status = status;
    if (paidAt) tx.paidAt = paidAt;
    if (deliveredData) tx.deliveredData = deliveredData;
    writeJSON(PATHS.transactions, transactions);
  }
}

function updateProductSold(productName: string, quantity: number): void {
  const products = readJSON<Product[]>(PATHS.products);
  const product = products.find((p) => p.productName === productName);
  if (product) {
    product.totalProdukTerjual = (product.totalProdukTerjual || 0) + quantity;
    writeJSON(PATHS.products, products);
  }
}

// ── Delivery ──────────────────────────────────────────────

async function deliverProduct(
  botInstance: TelegramBot,
  chatId: number,
  product: Product,
  quantity: number,
  reference: string
): Promise<boolean> {
  // KoalaStore product — fulfill via API
  if (product.source === "koalastore" && product.variant_code) {
    return deliverKoalaStore(botInstance, chatId, product, quantity, reference);
  }

  // Local stock product
  return deliverLocalStock(botInstance, chatId, product, quantity, reference);
}

async function deliverKoalaStore(
  botInstance: TelegramBot,
  chatId: number,
  product: Product,
  quantity: number,
  reference: string
): Promise<boolean> {
  try {
    const result = await ksCreateOrder([
      { variant_code: product.variant_code!, quantity },
    ]);

    // Extract account data from KS response
    const accountLines: string[] = [];
    for (const item of result.items) {
      const accounts = item.accounts || item.credentials || [];
      for (const acc of accounts) {
        if (typeof acc === "string") {
          accountLines.push(acc);
        } else {
          accountLines.push(JSON.stringify(acc));
        }
      }
    }

    if (accountLines.length === 0) {
      accountLines.push(`Transaction ID: ${result.transaction_id}`);
      accountLines.push(`PIN: ${result.pin}`);
    }

    // Send delivery message
    const deliveryData = accountLines.join("\n");
    await sendDeliveryMessage(botInstance, chatId, product, quantity, accountLines);

    // Send as .txt file
    const txtBuffer = Buffer.from(deliveryData, "utf8");
    await botInstance.sendDocument(
      chatId,
      txtBuffer,
      { caption: `📄 Detail akun (${product.productName})` },
      { filename: `order-${reference}.txt`, contentType: "text/plain" }
    );

    updateTransactionStatus(reference, "delivered", new Date().toISOString(), deliveryData);
    updateProductSold(product.productName, quantity);

    chatLog("EVENT", chatId, "", `DELIVERY ref=${reference} product=${product.productName} qty=${quantity} source=koalastore ks_tx=${result.transaction_id}`);

    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    await botInstance.sendMessage(
      chatId,
      `❌ *Gagal order dari KoalaStore.*\n\n${errMsg}\n\nHubungi admin untuk bantuan.\nRef: \`${reference}\``,
      { parse_mode: "Markdown" }
    );
    updateTransactionStatus(reference, "failed");
    chatLog("EVENT", chatId, "", `DELIVERY_FAILED ref=${reference} source=koalastore error=${errMsg}`);
    return false;
  }
}

async function deliverLocalStock(
  botInstance: TelegramBot,
  chatId: number,
  product: Product,
  quantity: number,
  reference: string
): Promise<boolean> {
  return withProductLock(product.productName, async () => {
    const lines = readStock(product.productName);
    if (lines.length < quantity) {
      await botInstance.sendMessage(
        chatId,
        `❌ *Stok habis saat delivery.*\n\nHubungi admin untuk bantuan.\nRef: \`${reference}\``,
        { parse_mode: "Markdown" }
      );
      updateTransactionStatus(reference, "failed");
      return false;
    }

    // Take stock
    const taken = lines.splice(0, quantity);
    writeStock(product.productName, lines);

    // Format and send delivery
    const formatStr = product.format || "email|password";
    const fields = formatStr.split("|").map((f) => f.trim());

    await sendDeliveryMessage(botInstance, chatId, product, quantity, taken, fields);

    // Send as .txt file for easy copy
    const txtContent = taken
      .map((line) => {
        const parts = line.split("|");
        if (fields.length > 1 && parts.length >= fields.length) {
          return fields.map((f, fi) => `${f}: ${parts[fi]}`).join("\n");
        }
        return line;
      })
      .join("\n---\n");
    const txtBuffer = Buffer.from(txtContent, "utf8");
    await botInstance.sendDocument(
      chatId,
      txtBuffer,
      { caption: `📄 Detail akun (${product.productName})` },
      { filename: `order-${reference}.txt`, contentType: "text/plain" }
    );

    // Update records
    updateTransactionStatus(
      reference,
      "delivered",
      new Date().toISOString(),
      taken.join("\n")
    );
    updateProductSold(product.productName, quantity);

    chatLog("EVENT", chatId, "", `DELIVERY ref=${reference} product=${product.productName} qty=${quantity}`);

    return true;
  });
}

async function sendDeliveryMessage(
  botInstance: TelegramBot,
  chatId: number,
  product: Product,
  quantity: number,
  taken: string[],
  fields?: string[]
): Promise<void> {
  const boxWidth = 55;
  const contentWidth = boxWidth - 4;
  const divider = "+" + "-".repeat(boxWidth - 2) + "+\n";

  let msg = "```\n";
  msg += "+" + "=".repeat(boxWidth - 2) + "+\n";
  const title = "ORDER SUCCESS";
  const pad = Math.max(0, Math.floor((boxWidth - 2 - title.length) / 2));
  msg +=
    "|" +
    " ".repeat(pad) +
    title +
    " ".repeat(Math.max(0, boxWidth - 2 - title.length - pad)) +
    "|\n";
  msg += divider;

  const prodLine = `PROD: ${product.productName.toUpperCase()}`;
  const qtyLine = `QTY : ${quantity} ITEM`;
  msg +=
    "| " + prodLine.substring(0, contentWidth).padEnd(contentWidth) + " |\n";
  msg +=
    "| " + qtyLine.substring(0, contentWidth).padEnd(contentWidth) + " |\n";
  msg += divider;

  msg += "| ACCOUNT DETAILS:".padEnd(contentWidth + 2) + "|\n";

  taken.forEach((line, idx) => {
    if (fields && fields.length > 1) {
      const parts = line.split("|");
      if (parts.length >= fields.length) {
        fields.forEach((field, fi) => {
          const row = `${field}: ${parts[fi]}`;
          msg +=
            "| " +
            row.substring(0, contentWidth).padEnd(contentWidth) +
            " |\n";
        });
      } else {
        msg +=
          "| " +
          line.substring(0, contentWidth).padEnd(contentWidth) +
          " |\n";
      }
    } else {
      msg +=
        "| " +
        line.substring(0, contentWidth).padEnd(contentWidth) +
        " |\n";
    }
    if (idx < taken.length - 1)
      msg += "| ".padEnd(contentWidth + 2) + "|\n";
  });

  msg += divider;
  const footer = "TERIMA KASIH TELAH MEMBELI";
  const footPad = Math.max(
    0,
    Math.floor((boxWidth - 2 - footer.length) / 2)
  );
  msg +=
    "|" +
    " ".repeat(footPad) +
    footer +
    " ".repeat(Math.max(0, boxWidth - 2 - footer.length - footPad)) +
    "|\n";
  msg += "+" + "=".repeat(boxWidth - 2) + "+\n";
  msg += "```";

  await botInstance.sendMessage(chatId, msg, { parse_mode: "Markdown" });
}

// ── Execute Purchase (Checkout Flow) ──────────────────────

async function executePurchase(
  botInstance: TelegramBot,
  chatId: number,
  product: Product,
  quantity: number,
  userInfo: TelegramBot.User
): Promise<void> {
  const session = getSession(chatId);
  const masterUser = isMaster(userInfo.id);

  // Validate stock (skip for KoalaStore — availability managed externally)
  const isKS = product.source === "koalastore";
  const stock = isKS ? 999 : getStockCount(product.productName);
  if (!isKS && quantity > stock) {
    const sent = await botInstance.sendMessage(
      chatId,
      `❌ Stok tidak cukup. Tersedia: ${stock}`,
      {
        reply_markup: {
          inline_keyboard: getMainMenuKeyboard(masterUser),
        },
      }
    );
    session.activeBotMessages.push(sent.message_id);
    session.state = "IDLE";
    return;
  }

  const totalAmount = product.priceProduct * quantity;
  const config = loadConfig();
  const method = config.payment_method || "qris";

  // Show confirmation with confirm/cancel buttons (no method selection)
  session.state = "CONFIRMING_ORDER";
  session.data.checkoutProduct = product;
  session.data.checkoutQuantity = quantity;
  session.data.checkoutUserInfo = userInfo;

  const methodLabel = method === "saweria" ? "Saweria (QRIS Otomatis)" : "QRIS Statis (Manual)";

  const sent = await botInstance.sendMessage(
    chatId,
    `🛒 *Konfirmasi Order*\n\n📦 *${product.productName}*\n🔢 Qty: ${quantity}\n💰 Total: *Rp${formatPrice(totalAmount)}*\n💳 Metode: *${methodLabel}*\n\nLanjutkan pembayaran?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Bayar", callback_data: `confirm_pay_${method}` },
            { text: "❌ Batal", callback_data: "confirm_pay_cancel" },
          ],
        ],
      },
    }
  );
  session.activeBotMessages.push(sent.message_id);
}

// ── Payment: Saweria ──────────────────────────────────────

async function processSaweriaPayment(
  botInstance: TelegramBot,
  chatId: number,
  product: Product,
  quantity: number,
  userInfo: TelegramBot.User
): Promise<void> {
  const session = getSession(chatId);
  const masterUser = isMaster(userInfo.id);
  const totalAmount = product.priceProduct * quantity;

  // Show loading
  const loadingMsg = await botInstance.sendMessage(
    chatId,
    "⏳ Membuat pembayaran Saweria..."
  );
  session.activeBotMessages.push(loadingMsg.message_id);

  try {
    const customerName = `Tele: ${userInfo.username || userInfo.first_name || chatId}`;
    const customerEmail = `${userInfo.username || chatId}@telegram.com`;
    const message = `Order ${product.productName} (${quantity}x) - ${chatId}`;

    const saweriaToken = getSaweriaToken();
    if (!saweriaToken) throw new Error("Token Saweria belum disetting di Settings");

    const snapData = await createSaweriaSnap({
      token: saweriaToken,
      amount: totalAmount,
      message,
      customerName,
      customerEmail,
    });

    const reference = snapData.id;
    const paymentAmount = snapData.amount;

    // Generate QR image
    const qrBuffer = await QRCode.toBuffer(snapData.qr_string);

    // Save transaction
    const tx: Transaction = {
      id: uuidv4(),
      chatId,
      username: userInfo.username || userInfo.first_name || String(chatId),
      productName: product.productName,
      productId: product.productId,
      quantity,
      amount: paymentAmount,
      profit: (product.profit || 0) * quantity,
      method: "saweria",
      status: "pending",
      reference,
      createdAt: new Date().toISOString(),
    };
    saveTransaction(tx);
    chatLog("EVENT", chatId, userInfo.username || "", `NEW_ORDER ref=${tx.reference} product=${product.productName} method=saweria amount=${totalAmount}`);
    notifyAdmins("new", `🛒 *Order Baru (Saweria)*\n\n👤 @${userInfo.username || chatId}\n📦 ${product.productName} x${quantity}\n💰 Rp${formatPrice(totalAmount)}\n🔖 Ref: \`${tx.reference}\``);

    // Delete loading message
    botInstance.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

    const expiryTime = new Date(Date.now() + POLL_MAX_MS);
    const expiryStr = expiryTime.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    });

    // Send QR
    const qrMsg = await botInstance.sendPhoto(chatId, qrBuffer, {
      caption: `✅ Produk: *${product.productName}*\n\n💰 Qty: ${quantity}\n💰 Total: *Rp${formatPrice(paymentAmount)}*\n\n📌 Scan QR untuk membayar.\n⏰ Expired: *${expiryStr} WIB*\n\nSetelah bayar, klik tombol di bawah:`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Sudah Bayar",
              callback_data: `payment_check_${reference}`,
            },
            {
              text: "❌ Batal",
              callback_data: `payment_cancel_${reference}`,
            },
          ],
        ],
      },
    });

    // Update session
    session.state = "WAITING_PAYMENT";
    session.data.paymentReference = reference;
    session.data.paymentMethod = "saweria";
    session.data.productData = product;
    session.data.quantityData = quantity;
    session.data.userInfo = userInfo;
    session.data.statusPhotoId = qrMsg.message_id;
    session.data.delivered = false;
    session.data.processing = false;
    session.activeBotMessages.push(qrMsg.message_id);

    // Start auto-poller
    startPaymentPoller(botInstance, chatId);
  } catch (err) {
    botInstance.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    session.state = "IDLE";
    const errMsg =
      err instanceof Error ? err.message : "Unknown error";
    await botInstance.sendMessage(
      chatId,
      `❌ Gagal membuat pembayaran: ${errMsg}`,
      {
        reply_markup: {
          inline_keyboard: getMainMenuKeyboard(masterUser),
        },
      }
    );
  }
}

// ── Payment: QRIS Static ─────────────────────────────────

async function processQrisStaticPayment(
  botInstance: TelegramBot,
  chatId: number,
  product: Product,
  quantity: number,
  userInfo: TelegramBot.User
): Promise<void> {
  const session = getSession(chatId);
  const masterUser = isMaster(userInfo.id);
  const totalAmount = product.priceProduct * quantity;
  const reference = `DGR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // Save transaction
  const tx: Transaction = {
    id: uuidv4(),
    chatId,
    username: userInfo.username || userInfo.first_name || String(chatId),
    productName: product.productName,
    productId: product.productId,
    quantity,
    amount: totalAmount,
    profit: (product.profit || 0) * quantity,
    method: "qris",
    status: "pending",
    reference,
    createdAt: new Date().toISOString(),
  };
  saveTransaction(tx);
  chatLog("EVENT", chatId, userInfo.username || "", `NEW_ORDER ref=${reference} product=${product.productName} method=qris amount=${totalAmount}`);
  notifyAdmins("new", `🛒 *Order Baru (QRIS)*\n\n👤 @${userInfo.username || chatId}\n📦 ${product.productName} x${quantity}\n💰 Rp${formatPrice(totalAmount)}\n🔖 Ref: \`${reference}\`\n\n⚠️ Perlu konfirmasi manual di dashboard`);

  // Try to send QRIS image from public/qris.jpeg
  const fs = await import("fs");
  const path = await import("path");
  const qrisPath = path.join(process.cwd(), "public", "qris.jpeg");

  const caption = `📱 *PEMBAYARAN QRIS STATIS*\n\n📦 Produk: *${product.productName}*\n🔢 Qty: ${quantity}\n💰 Total: *Rp${formatPrice(totalAmount)}*\n\n📌 *Instruksi:*\n1. Scan QR di atas\n2. Transfer tepat *Rp${formatPrice(totalAmount)}*\n3. Tunggu admin konfirmasi (maks 1x24 jam)\n\n🔖 Ref: \`${reference}\`\n\n_Jika ada kendala, hubungi /kontak_`;

  try {
    if (fs.existsSync(qrisPath)) {
      const qrMsg = await botInstance.sendPhoto(
        chatId,
        fs.createReadStream(qrisPath),
        {
          caption,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "❌ Batal",
                  callback_data: `payment_cancel_${reference}`,
                },
              ],
            ],
          },
        }
      );
      session.activeBotMessages.push(qrMsg.message_id);
    } else {
      const sent = await botInstance.sendMessage(
        chatId,
        `⚠️ Gambar QRIS belum diupload admin.\n\n${caption}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "❌ Batal",
                  callback_data: `payment_cancel_${reference}`,
                },
              ],
            ],
          },
        }
      );
      session.activeBotMessages.push(sent.message_id);
    }
  } catch {
    const sent = await botInstance.sendMessage(chatId, caption, {
      parse_mode: "Markdown",
    });
    session.activeBotMessages.push(sent.message_id);
  }

  session.state = "WAITING_PAYMENT";
  session.data.paymentReference = reference;
  session.data.paymentMethod = "qris";
  session.data.productData = product;
  session.data.quantityData = quantity;
  session.data.userInfo = userInfo;
  session.data.delivered = false;
  session.data.processing = false;

  // No auto-poller for QRIS static — admin confirms manually from dashboard
}

// ── Payment Poller (Saweria) ──────────────────────────────

function stopPaymentPoller(session: SessionData): void {
  if (session.data._pollerId) {
    clearInterval(session.data._pollerId as ReturnType<typeof setInterval>);
    session.data._pollerId = null;
  }
}

function startPaymentPoller(
  botInstance: TelegramBot,
  chatId: number
): void {
  const session = getSession(chatId);
  stopPaymentPoller(session);

  const startTime = Date.now();
  const reference = session.data.paymentReference as string;

  session.data._pollerId = setInterval(async () => {
    try {
      // Stop conditions
      if (
        session.state !== "WAITING_PAYMENT" ||
        session.data.delivered ||
        session.data.processing
      ) {
        stopPaymentPoller(session);
        return;
      }

      // Timeout
      if (Date.now() - startTime > POLL_MAX_MS) {
        stopPaymentPoller(session);
        updateTransactionStatus(reference, "expired");
        session.state = "IDLE";

        // Delete QR message
        if (session.data.statusPhotoId) {
          botInstance
            .deleteMessage(chatId, session.data.statusPhotoId as number)
            .catch(() => {});
        }

        const masterUser = isMaster(
          (session.data.userInfo as TelegramBot.User)?.id || 0
        );
        const expiredAt = new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jakarta",
        });

        botInstance
          .sendMessage(
            chatId,
            `⏰ *PAYMENT EXPIRED*\n\nProduk: *${(session.data.productData as Product)?.productName || "-"}*\nExpired: *${expiredAt} WIB*\n\nSilakan ulangi pembelian.`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: getMainMenuKeyboard(masterUser),
              },
            }
          )
          .catch(() => {});
        return;
      }

      // Check Saweria
      const status = await checkSaweriaPayment(reference);

      if (status === "Success") {
        stopPaymentPoller(session);

        await withTxLock("tg:" + chatId, async () => {
          if (session.data.delivered) return;
          session.data.processing = true;
          session.state = "IDLE";

          try {
            chatLog("EVENT", chatId, "", `PAYMENT_SUCCESS method=saweria ref=${reference}`);
            notifyAdmins("paid", `💳 *Pembayaran Diterima (Saweria)*\n\n📦 ${(session.data.productData as Product)?.productName}\n💰 Rp${formatPrice((session.data.quantityData as number) * ((session.data.productData as Product)?.priceProduct || 0))}\n🔖 Ref: \`${reference}\``);
            await botInstance.sendMessage(
              chatId,
              "✅ *Pembayaran Berhasil!*\n\nTransaksi Anda telah dikonfirmasi.",
              { parse_mode: "Markdown" }
            );

            const product = session.data.productData as Product;
            const quantity = session.data.quantityData as number;
            await deliverProduct(
              botInstance,
              chatId,
              product,
              quantity,
              reference
            );

            session.data.delivered = true;
            const masterUser = isMaster(
              (session.data.userInfo as TelegramBot.User)?.id || 0
            );
            await botInstance.sendMessage(chatId, "🔙 Kembali ke menu utama", {
              reply_markup: {
                inline_keyboard: getMainMenuKeyboard(masterUser),
              },
            });
          } catch (err) {
            console.error("[Bot] Delivery error:", err);
            await botInstance
              .sendMessage(
                chatId,
                "❌ *Terjadi kesalahan saat mengirim produk.*\n\nHubungi admin dengan bukti pembayaran.",
                { parse_mode: "Markdown" }
              )
              .catch(() => {});
          } finally {
            session.data.processing = false;
          }
        });
      } else if (status === "Failed" || status === "Expired") {
        stopPaymentPoller(session);
        updateTransactionStatus(reference, "expired");
        session.state = "IDLE";

        const masterUser = isMaster(
          (session.data.userInfo as TelegramBot.User)?.id || 0
        );
        botInstance
          .sendMessage(
            chatId,
            "❌ *Pembayaran Gagal / Expired.*\n\nSilakan ulangi pembelian.",
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: getMainMenuKeyboard(masterUser),
              },
            }
          )
          .catch(() => {});
      }
    } catch (err) {
      console.error("[Bot] Poller error:", err);
    }
  }, POLL_INTERVAL_MS);
}

// ── Start Bot ─────────────────────────────────────────────

// ── Transaction Cleanup Job ──────────────────────────────

async function runTransactionCleanup(): Promise<void> {
  const botInstance = getBotInstance();
  if (!botInstance) return;

  const transactions = readJSON<Transaction[]>(PATHS.transactions);
  const now = Date.now();
  let changed = false;

  for (const tx of transactions) {
    if (tx.status !== "pending") continue;

    const age = now - new Date(tx.createdAt).getTime();
    const timeout = tx.method === "qris" ? QRIS_TIMEOUT_MS : SAWERIA_TIMEOUT_MS;

    if (age > timeout) {
      tx.status = "expired";
      changed = true;

      chatLog("EVENT", tx.chatId, tx.username, `TX_EXPIRED ref=${tx.reference} method=${tx.method} age=${Math.round(age / 60000)}min`);
      notifyAdmins("expired", `⏰ *Transaksi Expired*\n\n📦 ${tx.productName}\n💰 Rp${tx.amount.toLocaleString("id-ID")}\n👤 @${tx.username || tx.chatId}\n🔖 Ref: \`${tx.reference}\`\nMetode: ${tx.method.toUpperCase()}`);

      try {
        const timeoutLabel = tx.method === "qris" ? "24 jam" : "5 menit";
        await botInstance.sendMessage(
          tx.chatId,
          `⏰ *Transaksi Expired*\n\n📦 Produk: ${tx.productName}\n🔖 Ref: \`${tx.reference}\`\n\nTransaksi melebihi batas waktu ${timeoutLabel}.\nSilakan order kembali jika diperlukan.`,
          { parse_mode: "Markdown" }
        );
      } catch {
        // user may have blocked the bot
      }
    }
  }

  if (changed) {
    writeJSON(PATHS.transactions, transactions);
  }
}

/**
 * Startup recovery: scan transactions for stale pending/stuck states.
 * - Expire pending transactions that exceeded their timeout
 * - Flag "paid" transactions that never got delivered (stuck mid-crash)
 */
async function runStartupRecovery(): Promise<void> {
  const botInstance = getBotInstance();
  if (!botInstance) return;

  const transactions = readJSON<Transaction[]>(PATHS.transactions);
  const now = Date.now();
  let changed = false;
  let expiredCount = 0;
  let stuckCount = 0;

  for (const tx of transactions) {
    if (tx.status === "pending") {
      const age = now - new Date(tx.createdAt).getTime();
      const timeout = tx.method === "qris" ? QRIS_TIMEOUT_MS : SAWERIA_TIMEOUT_MS;

      if (age > timeout) {
        tx.status = "expired";
        changed = true;
        expiredCount++;

        chatLog("EVENT", tx.chatId, tx.username, `STARTUP_EXPIRE ref=${tx.reference} method=${tx.method} age=${Math.round(age / 60000)}min`);

        try {
          await botInstance.sendMessage(
            tx.chatId,
            `⏰ *Transaksi Expired*\n\n📦 Produk: ${tx.productName}\n🔖 Ref: \`${tx.reference}\`\n\nTransaksi expired saat server restart.\nSilakan order kembali jika diperlukan.`,
            { parse_mode: "Markdown" }
          );
        } catch {}
      }
    }

    // Detect stuck "paid" transactions (paid but never delivered — crash mid-delivery)
    if (tx.status === "paid" && !tx.deliveredData) {
      stuckCount++;
      chatLog("EVENT", tx.chatId, tx.username, `STUCK_TX ref=${tx.reference} status=paid no_delivery`);
    }
  }

  if (changed) {
    writeJSON(PATHS.transactions, transactions);
  }

  if (expiredCount > 0 || stuckCount > 0) {
    const parts: string[] = [];
    if (expiredCount > 0) parts.push(`${expiredCount} transaksi expired`);
    if (stuckCount > 0) parts.push(`${stuckCount} transaksi stuck (paid tapi belum delivered)`);

    const msg = `🔄 *Startup Recovery*\n\n${parts.join("\n")}${stuckCount > 0 ? "\n\n⚠️ Transaksi stuck perlu dicek manual di dashboard." : ""}`;
    notifyAdmins("new", msg);
    console.log(`[Bot] Startup recovery: ${parts.join(", ")}`);
  } else {
    console.log("[Bot] Startup recovery: no stale transactions found.");
  }
}

function startCleanupJob(): void {
  stopCleanupJob();
  cleanupIntervalId = setInterval(runTransactionCleanup, CLEANUP_INTERVAL_MS);
  console.log("[Bot] Transaction cleanup job started (every 1 min).");
}

function stopCleanupJob(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

// ── Saweria Token Expiry Reminder ────────────────────────

let saweriaExpiryIntervalId: ReturnType<typeof setInterval> | null = null;
let saweriaExpiryNotified = false;

function startSaweriaExpiryCheck(): void {
  if (saweriaExpiryIntervalId) clearInterval(saweriaExpiryIntervalId);
  saweriaExpiryNotified = false;

  // Check every 10 minutes
  saweriaExpiryIntervalId = setInterval(checkSaweriaExpiry, 10 * 60 * 1000);
  // Also check immediately on startup
  checkSaweriaExpiry();
  console.log("[Bot] Saweria token expiry check started (every 10 min).");
}

async function checkSaweriaExpiry(): Promise<void> {
  const botInstance = getBotInstance();
  if (!botInstance) return;

  const config = loadConfig();
  if (!config.saweria_token_exp) return;

  const now = Date.now() / 1000;
  const remaining = config.saweria_token_exp - now;
  const threeHours = 3 * 60 * 60;

  // Already expired
  if (remaining <= 0 && !saweriaExpiryNotified) {
    saweriaExpiryNotified = true;
    const msg =
      `🚨 *Token Saweria Expired!*\n\n` +
      `Token Saweria sudah kadaluarsa.\n` +
      `Pembayaran otomatis via Saweria tidak akan berfungsi.\n\n` +
      `Segera perbarui token di dashboard Settings.`;
    const ids = getMasterIds();
    for (const id of ids) {
      try { await botInstance.sendMessage(id, msg, { parse_mode: "Markdown" }); } catch {}
    }
    return;
  }

  // 3 hours before expiry
  if (remaining > 0 && remaining <= threeHours && !saweriaExpiryNotified) {
    saweriaExpiryNotified = true;
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const msg =
      `⚠️ *Token Saweria Segera Expired!*\n\n` +
      `⏳ Sisa waktu: ${hours > 0 ? `${hours} jam ` : ""}${minutes} menit\n` +
      `📅 Expired: ${new Date(config.saweria_token_exp * 1000).toLocaleDateString("id-ID", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
      })} WIB\n\n` +
      `Segera perbarui token di dashboard Settings\natau pembayaran otomatis akan berhenti.`;
    const ids = getMasterIds();
    for (const id of ids) {
      try { await botInstance.sendMessage(id, msg, { parse_mode: "Markdown" }); } catch {}
    }
  }

  // Reset notified flag when token is renewed (exp changes to far future)
  if (remaining > threeHours) {
    saweriaExpiryNotified = false;
  }
}

export async function startBot(): Promise<void> {
  const botToken = getTelegramToken();
  if (!botToken) {
    console.log("[Bot] No bot token configured. Bot not started.");
    return;
  }

  if (bot) {
    try {
      await bot.stopPolling();
    } catch {}
    bot = null;
  }

  bot = new TelegramBot(botToken, { polling: true });
  console.log("[Bot] Telegram bot started with polling.");

  // Register Saweria notifier — send token expiry alerts to first master admin
  const masterIds = getMasterIds();
  if (masterIds.length > 0) {
    setSaweriaNotifier(bot, masterIds[0]);
  }

  // Start background cleanup job for expired transactions
  startCleanupJob();

  // Start Saweria token expiry reminder
  startSaweriaExpiryCheck();

  // Run startup recovery (async, non-blocking)
  runStartupRecovery().catch((err) =>
    console.error("[Bot] Startup recovery error:", err)
  );

  // ── /start ────────────────────────────────────────────

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (!bot) return;
    chatLog("IN", chatId, msg.from?.username || "", "/start");
    await sendWelcomeMessage(bot, chatId, msg.from!);
  });

  // ── /beli ─────────────────────────────────────────────

  bot.onText(/\/beli/, async (msg) => {
    const chatId = msg.chat.id;
    if (!bot) return;
    chatLog("IN", chatId, msg.from?.username || "", "/beli");
    try {
      await bot.deleteMessage(chatId, msg.message_id);
    } catch {}

    // Gatekeeper check
    if (!isMaster(msg.from?.id || 0)) {
      const memberOk = await checkMembership(bot, chatId);
      if (!memberOk) {
        await sendGatekeeperMessage(bot, chatId);
        return;
      }
    }

    appendUser(String(chatId));
    const session = getSession(chatId);
    session.data.userId = msg.from!.id;

    await sendCategoryList(bot, chatId);
  });

  // ── /harga ────────────────────────────────────────────

  bot.onText(/\/harga/, async (msg) => {
    const chatId = msg.chat.id;
    if (!bot) return;
    chatLog("IN", chatId, msg.from?.username || "", "/harga");
    try {
      await bot.deleteMessage(chatId, msg.message_id);
    } catch {}

    if (!isMaster(msg.from?.id || 0)) {
      const memberOk = await checkMembership(bot, chatId);
      if (!memberOk) {
        await sendGatekeeperMessage(bot, chatId);
        return;
      }
    }

    const session = getSession(chatId);
    await cleanupPreviousMessages(bot, chatId);
    session.state = "harga";

    const products = loadProducts();
    let priceList: string;

    if (products.length === 0) {
      priceList = "❌ *Tidak ada produk yang tersedia saat ini.*";
    } else {
      const now = new Date().toLocaleString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "numeric",
        month: "short",
      });
      priceList = `💰 *DAFTAR HARGA & STOK PRODUK*\n`;
      priceList += `⏰ _Last Update: ${now}_\n\n`;

      products.forEach((product) => {
        const stockVal = getStockCount(product.productName);
        const stockIcon = stockVal > 0 ? "✅ Ready" : "❌ Habis";

        priceList += `🔹 *${product.productName.toUpperCase()}*\n`;
        priceList += `├ Harga : *Rp${formatPrice(product.priceProduct)}*\n`;
        priceList += `└ Stok  : *${stockVal}* (${stockIcon})\n\n`;
      });

      priceList += `──────────────────────\n`;
      priceList += `_Gunakan /beli untuk memesan._`;
    }

    const sent = await bot.sendMessage(chatId, priceList, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: backButton },
    });
    session.activeBotMessages.push(sent.message_id);
  });

  // ── /info ─────────────────────────────────────────────

  bot.onText(/\/info/, async (msg) => {
    const chatId = msg.chat.id;
    if (!bot) return;
    chatLog("IN", chatId, msg.from?.username || "", "/info");
    try {
      await bot.deleteMessage(chatId, msg.message_id);
    } catch {}

    const session = getSession(chatId);
    await cleanupPreviousMessages(bot, chatId);
    session.state = "info";

    const infoMessage = `
🔹 *Informasi Digiroot Store* 🛍️
Selamat datang! Di sini Anda bisa membeli berbagai produk digital dengan harga terbaik.

🛒 *Perintah yang tersedia:*
- /beli - Beli produk
- /harga - Cek daftar harga
- /kontak - Hubungi admin

✨ Selamat berbelanja!
`;
    const sent = await bot.sendMessage(chatId, infoMessage, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: backButton },
    });
    session.activeBotMessages.push(sent.message_id);
  });

  // ── /kontak ───────────────────────────────────────────

  bot.onText(/\/kontak/, async (msg) => {
    const chatId = msg.chat.id;
    if (!bot) return;
    chatLog("IN", chatId, msg.from?.username || "", "/kontak");
    try {
      await bot.deleteMessage(chatId, msg.message_id);
    } catch {}

    const session = getSession(chatId);
    await cleanupPreviousMessages(bot, chatId);
    session.state = "kontak";

    const cfg = loadConfig();
    const adminTg = cfg.admin_contact_telegram || "";
    const opHours = cfg.operating_hours || "";
    const storeName = cfg.store_name || "Digiroot Store";

    let contactMessage = `📞 *HUBUNGI ADMIN*\n\nButuh bantuan atau ada pertanyaan?\nKami siap membantu!\n\n🏪 *Store:* ${storeName}`;
    if (adminTg) {
      contactMessage += `\n📱 *Telegram:* [@${adminTg}](https://t.me/${adminTg})`;
    } else {
      contactMessage += `\n👤 *Admin:* _Belum tersedia_`;
    }
    contactMessage += `\n\n━━━━━━━━━━━━━━━━━━━━`;
    if (opHours) contactMessage += `\n⏰ *Jam Operasional:* ${opHours}`;
    contactMessage += `\n💬 Respon dalam 1x24 jam`;
    contactMessage += `\n━━━━━━━━━━━━━━━━━━━━`;
    contactMessage += `\n\nKlik link di atas untuk langsung chat. ✨`;

    const sent = await bot.sendMessage(chatId, contactMessage, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: backButton },
    });
    session.activeBotMessages.push(sent.message_id);
  });

  // ── /riwayat ──────────────────────────────────────────

  bot.onText(/\/riwayat/, async (msg) => {
    const chatId = msg.chat.id;
    if (!bot) return;
    chatLog("IN", chatId, msg.from?.username || "", "/riwayat");
    try {
      await bot.deleteMessage(chatId, msg.message_id);
    } catch {}

    if (!isMaster(msg.from?.id || 0)) {
      const memberOk = await checkMembership(bot, chatId);
      if (!memberOk) {
        await sendGatekeeperMessage(bot, chatId);
        return;
      }
    }

    const session = getSession(chatId);
    session.state = "riwayat";
    await sendRiwayat(bot, chatId);
  });

  // ── Message handler (menu buttons, states) ────────────

  bot.on("message", async (msg) => {
    if (!msg.text || !bot) return;
    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const session = getSession(chatId);

    // Skip commands (handled by onText)
    if (text.startsWith("/")) return;

    chatLog("IN", chatId, msg.from?.username || "", text);

    // Store userId
    if (msg.from) session.data.userId = msg.from.id;
    const masterUser = isMaster(msg.from?.id || 0);

    // Gatekeeper check
    if (!masterUser) {
      const memberOk = await checkMembership(bot, chatId);
      if (!memberOk) {
        await cleanupPreviousMessages(bot, chatId);
        await sendGatekeeperMessage(bot, chatId);
        return;
      }
    }

    // Delete user input (keep chat clean)
    try {
      await bot.deleteMessage(chatId, msg.message_id);
    } catch {}

    // ── State: WAITING_PAYMENT — block input ──────────
    if (session.state === "WAITING_PAYMENT") {
      const warn = await bot.sendMessage(
        chatId,
        "⏳ *Transaksi sedang berjalan!*\n\nSilakan selesaikan pembayaran atau batalkan.",
        { parse_mode: "Markdown" }
      );
      setTimeout(
        () => bot?.deleteMessage(chatId, warn.message_id).catch(() => {}),
        5000
      );
      return;
    }

    // ── State: WAITING_QUANTITY (manual number input) ──
    if (session.state === "WAITING_QUANTITY") {
      if (/^\d+$/.test(text)) {
        const quantity = parseInt(text);
        const product = session.data.selectedProduct as Product | undefined;
        if (product) {
          await cleanupPreviousMessages(bot, chatId);
          await withUserPurchaseLock(chatId, async () => {
            await executePurchase(bot!, chatId, product, quantity, msg.from!);
          });
        }
        return;
      }

      const sent = await bot.sendMessage(
        chatId,
        "❌ Harap masukkan angka yang benar atau pilih tombol di atas."
      );
      setTimeout(
        () => bot?.deleteMessage(chatId, sent.message_id).catch(() => {}),
        3000
      );
      return;
    }
  });

  // ── Callback query handler ────────────────────────────

  bot.on("callback_query", async (query) => {
    if (!bot || !query.data || !query.message) return;
    const chatId = query.message.chat.id;
    const session = getSession(chatId);
    const data = query.data;

    // Store userId
    if (query.from) session.data.userId = query.from.id;

    // ── Menu inline button handlers (edit in-place) ──
    const msgId = query.message.message_id;

    if (data === "menu_list") {
      bot.answerCallbackQuery(query.id);
      session.state = "LIST_PRODUCT";
      await sendPaginatedProducts(bot, chatId, 1, msgId);
      return;
    }

    if (data === "menu_stok") {
      bot.answerCallbackQuery(query.id);
      await sendStokView(bot, chatId, msgId);
      return;
    }

    if (data === "menu_riwayat") {
      bot.answerCallbackQuery(query.id);
      session.state = "riwayat";
      await sendRiwayat(bot, chatId, msgId);
      return;
    }

    if (data === "menu_order_guide") {
      bot.answerCallbackQuery(query.id);
      await sendOrderGuide(bot, chatId, msgId);
      return;
    }

    if (data === "menu_info") {
      bot.answerCallbackQuery(query.id);
      await sendInfoView(bot, chatId, msgId);
      return;
    }

    if (data === "menu_broadcast") {
      bot.answerCallbackQuery(query.id, { text: "Broadcast hanya via dashboard" });
      return;
    }

    if (data === "menu_back") {
      bot.answerCallbackQuery(query.id);
      await sendMainMenu(bot, chatId, "🛍️ Kembali ke menu utama.", msgId);
      return;
    }

    // ── Category selection ───────────────────────────
    if (data.startsWith("cat_")) {
      bot.answerCallbackQuery(query.id);
      if (data === "cat_back") {
        await sendCategoryList(bot, chatId, msgId);
        return;
      }
      const category = data.replace("cat_", "");
      await sendVariantList(bot, chatId, category, msgId);
      return;
    }

    // ── Variant selection ────────────────────────────
    if (data.startsWith("variant_")) {
      bot.answerCallbackQuery(query.id);
      const globalIdx = parseInt(data.replace("variant_", ""));
      const products = loadProducts();
      const product = products[globalIdx];
      if (!product) return;
      session.state = "IDLE";
      await handleProductSelection(bot, chatId, product, globalIdx, msgId);
      return;
    }

    // Pagination
    if (data.startsWith("list_page_")) {
      const page = parseInt(data.replace("list_page_", ""));
      bot.answerCallbackQuery(query.id);
      await sendPaginatedProducts(bot, chatId, page, query.message.message_id);
      return;
    }

    // Product selection from paginated list
    if (data.startsWith("select_product_")) {
      const idx = parseInt(data.replace("select_product_", ""));
      const products = loadProducts();
      const product = products[idx];
      if (!product) {
        bot.answerCallbackQuery(query.id, { text: "❌ Produk tidak ditemukan" });
        return;
      }
      bot.answerCallbackQuery(query.id);
      if (query.from) session.data.userId = query.from.id;
      await handleProductSelection(bot, chatId, product, idx);
      return;
    }

    // Gatekeeper check
    if (data === "check_gatekeeper") {
      const memberOk = await checkMembership(bot, chatId);
      if (memberOk) {
        bot.answerCallbackQuery(query.id, {
          text: "✅ Terimakasih! Sekarang Anda bisa menggunakan bot.",
        });
        await sendWelcomeMessage(bot, chatId, query.from);
      } else {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Anda belum bergabung ke Channel/Group!",
          show_alert: true,
        });
      }
      return;
    }

    // Buy quantity buttons
    if (
      session.state === "WAITING_QUANTITY" &&
      session.data.selectedProduct
    ) {
      if (data.endsWith("_cancel")) {
        bot.answerCallbackQuery(query.id);
        session.state = "LIST_PRODUCT";
        await sendPaginatedProducts(
          bot,
          chatId,
          (session.data.currentPage as number) || 1,
          query.message.message_id
        );
        return;
      }

      if (data.startsWith("buy_")) {
        const parts = data.split("_");
        const quantity = parseInt(parts[2]);
        bot.answerCallbackQuery(query.id);

        // Remove inline keyboard
        bot
          .editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: query.message.message_id }
          )
          .catch(() => {});

        const product = session.data.selectedProduct as Product;
        const isKSProduct = product.source === "koalastore";
        const stock = isKSProduct ? 999 : getStockCount(product.productName);

        if (!isKSProduct && quantity > stock) {
          const sent = await bot.sendMessage(
            chatId,
            `❌ Stok tidak cukup. Tersedia: ${stock}`
          );
          session.activeBotMessages.push(sent.message_id);
          session.state = "IDLE";
          return;
        }

        await withUserPurchaseLock(chatId, async () => {
          if (session.state !== "WAITING_QUANTITY") return; // double-click guard
          await executePurchase(bot!, chatId, product, quantity, query.from);
        });
        return;
      }
    }

    // ── Order confirmation (confirm_pay_) ─────────────────

    if (data.startsWith("confirm_pay_")) {
      bot.answerCallbackQuery(query.id);
      bot
        .editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: query.message.message_id }
        )
        .catch(() => {});

      if (data === "confirm_pay_cancel") {
        session.state = "IDLE";
        const masterUser = isMaster(query.from?.id || 0);
        await bot.sendMessage(chatId, "❌ Pembelian dibatalkan.", {
          reply_markup: {
            inline_keyboard: getMainMenuKeyboard(masterUser),
          },
        });
        return;
      }

      const product = session.data.checkoutProduct as Product;
      const quantity = session.data.checkoutQuantity as number;
      const userInfo = session.data.checkoutUserInfo as TelegramBot.User;

      if (!product || !quantity || !userInfo) {
        session.state = "IDLE";
        return;
      }

      const method = data.replace("confirm_pay_", "");
      if (method === "saweria") {
        await processSaweriaPayment(bot, chatId, product, quantity, userInfo);
      } else {
        await processQrisStaticPayment(bot, chatId, product, quantity, userInfo);
      }
      return;
    }

    // ── Payment check / cancel (WAITING_PAYMENT) ────────

    if (session.state === "WAITING_PAYMENT") {
      if (data.startsWith("payment_check_")) {
        const ref = data.replace("payment_check_", "");
        stopPaymentPoller(session);

        bot
          .editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: query.message.message_id }
          )
          .catch(() => {});

        const status = await checkSaweriaPayment(ref);

        if (status === "Success") {
          bot.answerCallbackQuery(query.id);
          await withTxLock("tg:" + chatId, async () => {
            if (session.data.delivered || !bot) return;
            session.data.processing = true;
            session.state = "IDLE";
            try {
              await bot.sendMessage(
                chatId,
                "✅ *Pembayaran Berhasil!*",
                { parse_mode: "Markdown" }
              );
              const product = session.data.productData as Product;
              const quantity = session.data.quantityData as number;
              await deliverProduct(bot, chatId, product, quantity, ref);
              session.data.delivered = true;
              const masterUser = isMaster(query.from?.id || 0);
              await bot.sendMessage(chatId, "🔙 Kembali ke menu utama", {
                reply_markup: {
                  inline_keyboard: getMainMenuKeyboard(masterUser),
                },
              });
            } catch (err) {
              console.error("[Bot] Manual check delivery error:", err);
              await bot
                .sendMessage(
                  chatId,
                  "❌ *Error saat mengirim produk.* Hubungi admin.",
                  { parse_mode: "Markdown" }
                )
                .catch(() => {});
            } finally {
              session.data.processing = false;
            }
          });
        } else if (status === "Failed" || status === "Expired") {
          bot.answerCallbackQuery(query.id);
          updateTransactionStatus(ref, "expired");
          session.state = "IDLE";
          const masterUser = isMaster(query.from?.id || 0);
          await bot.sendMessage(
            chatId,
            "❌ *Pembayaran Gagal / Expired.*",
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: getMainMenuKeyboard(masterUser),
              },
            }
          );
        } else {
          // Still pending
          bot.answerCallbackQuery(query.id, {
            text: "⏳ Pembayaran belum diterima. Selesaikan pembayaran lalu coba lagi.",
            show_alert: true,
          });
          // Re-add buttons
          bot
            .editMessageReplyMarkup(
              {
                inline_keyboard: [
                  [
                    {
                      text: "✅ Sudah Bayar",
                      callback_data: `payment_check_${ref}`,
                    },
                    {
                      text: "❌ Batal",
                      callback_data: `payment_cancel_${ref}`,
                    },
                  ],
                ],
              },
              { chat_id: chatId, message_id: query.message.message_id }
            )
            .catch(() => {});
          // Restart poller
          startPaymentPoller(bot, chatId);
        }
        return;
      }

      // Re-send delivery data from riwayat
      if (data.startsWith("resend_")) {
        const ref = data.replace("resend_", "");
        const allTx = readJSON<Transaction[]>(PATHS.transactions);
        const tx = allTx.find((t) => t.reference === ref && t.chatId === chatId);

        if (!tx || !tx.deliveredData) {
          bot.answerCallbackQuery(query.id, {
            text: "❌ Data tidak ditemukan",
            show_alert: true,
          });
          return;
        }

        bot.answerCallbackQuery(query.id, { text: "📩 Mengirim ulang..." });

        const txtBuffer = Buffer.from(tx.deliveredData, "utf8");
        await bot.sendDocument(
          chatId,
          txtBuffer,
          { caption: `📩 *Kirim ulang:* ${tx.productName}\n🔖 Ref: \`${tx.reference}\`` },
          { filename: `order-${tx.reference}.txt`, contentType: "text/plain" }
        );
        return;
      }

      if (data.startsWith("payment_cancel_")) {
        const ref = data.replace("payment_cancel_", "");
        stopPaymentPoller(session);
        updateTransactionStatus(ref, "cancelled");
        chatLog("EVENT", chatId, query.from?.username || "", `PAYMENT_CANCELLED ref=${ref}`);
        notifyAdmins("cancelled", `❌ *Transaksi Dibatalkan*\n\n👤 @${query.from?.username || chatId}\n🔖 Ref: \`${ref}\``);
        bot.answerCallbackQuery(query.id, { text: "❌ Transaksi dibatalkan" });
        session.state = "IDLE";

        bot
          .deleteMessage(chatId, query.message.message_id)
          .catch(() => {});

        const masterUser = isMaster(query.from?.id || 0);
        await bot.sendMessage(chatId, "❌ Pembelian dibatalkan.", {
          reply_markup: {
            inline_keyboard: getMainMenuKeyboard(masterUser),
          },
        });
        return;
      }
    }
  });
}

// ── Stop Bot ──────────────────────────────────────────────

export async function stopBot(): Promise<void> {
  stopCleanupJob();
  if (bot) {
    try {
      await bot.stopPolling();
    } catch {}
    bot = null;
    console.log("[Bot] Telegram bot stopped.");
  }
}

export function getBotInstance(): TelegramBot | null {
  return bot;
}

/**
 * Confirm a QRIS payment from the dashboard and trigger delivery.
 * Called by POST /api/transactions/[id]/confirm
 */
export async function confirmQrisPayment(
  reference: string
): Promise<{ success: boolean; error?: string }> {
  const botInstance = getBotInstance();
  if (!botInstance) {
    return { success: false, error: "Bot tidak aktif" };
  }

  const transactions = readJSON<Transaction[]>(PATHS.transactions);
  const tx = transactions.find((t) => t.reference === reference);

  if (!tx) {
    return { success: false, error: "Transaksi tidak ditemukan" };
  }
  if (tx.status !== "pending") {
    return { success: false, error: `Transaksi sudah ${tx.status}` };
  }
  if (tx.method !== "qris") {
    return { success: false, error: "Bukan transaksi QRIS" };
  }

  // Find the product
  const products = readJSON<Product[]>(PATHS.products);
  const product = products.find((p) => p.productId === tx.productId);
  if (!product) {
    return { success: false, error: "Produk tidak ditemukan" };
  }

  // Notify user that payment is confirmed
  chatLog("EVENT", tx.chatId, tx.username, `PAYMENT_CONFIRMED method=qris ref=${reference}`);
  notifyAdmins("paid", `💳 *Pembayaran Dikonfirmasi (QRIS)*\n\n📦 ${tx.productName}\n💰 Rp${tx.amount.toLocaleString("id-ID")}\n👤 @${tx.username || tx.chatId}\n🔖 Ref: \`${reference}\``);
  try {
    await botInstance.sendMessage(
      tx.chatId,
      `✅ *Pembayaran dikonfirmasi!*\n\n📦 Produk: *${tx.productName}*\n💰 Total: *Rp${tx.amount.toLocaleString("id-ID")}*\n🔖 Ref: \`${reference}\`\n\nSedang memproses pesanan...`,
      { parse_mode: "Markdown" }
    );
  } catch {
    // User may have blocked the bot, continue with delivery anyway
  }

  // Deliver the product
  const delivered = await deliverProduct(
    botInstance,
    tx.chatId,
    product,
    tx.quantity,
    reference
  );

  if (!delivered) {
    return { success: false, error: "Delivery gagal — stok habis" };
  }

  // Clear session state if user is still waiting
  const session = getSession(tx.chatId);
  if (
    session.state === "WAITING_PAYMENT" &&
    session.data.paymentReference === reference
  ) {
    session.state = "IDLE";
    session.data = {};
  }

  return { success: true };
}
