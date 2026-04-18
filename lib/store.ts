import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const FILES_DIR = path.join(process.cwd(), "files");

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });

// ── JSON Read/Write (Atomic) ──────────────────────────────

export function readJSON<T>(filePath: string, fallback?: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return (fallback ?? []) as T;
  }
}

export function writeJSON(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

// ── Convenience paths ─────────────────────────────────────

export const PATHS = {
  config: path.join(DATA_DIR, "config.json"),
  products: path.join(DATA_DIR, "products.json"),
  transactions: path.join(DATA_DIR, "transactions.json"),
  masters: path.join(DATA_DIR, "masters.json"),
  users: path.join(DATA_DIR, "users.txt"),
} as const;

// ── Stock helpers ─────────────────────────────────────────

function stockPath(productName: string): string {
  // Sanitize product name for filename
  const safe = productName.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim();
  return path.join(FILES_DIR, `${safe}.txt`);
}

export function readStock(productName: string): string[] {
  const fp = stockPath(productName);
  if (!fs.existsSync(fp)) return [];
  const content = fs.readFileSync(fp, "utf8").trim();
  if (!content) return [];
  return content.split("\n").filter((line) => line.trim() !== "");
}

export function writeStock(productName: string, lines: string[]): void {
  const fp = stockPath(productName);
  const tmpPath = `${fp}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, lines.join("\n"), "utf8");
  fs.renameSync(tmpPath, fp);
}

export function getStockCount(productName: string): number {
  return readStock(productName).length;
}

// ── User helpers ──────────────────────────────────────────

export function getUsers(): string[] {
  if (!fs.existsSync(PATHS.users)) return [];
  const content = fs.readFileSync(PATHS.users, "utf8").trim();
  if (!content) return [];
  return content.split("\n").filter((line) => line.trim() !== "");
}

export function appendUser(userId: string): void {
  const users = getUsers();
  const id = String(userId).trim();
  if (users.includes(id)) return; // already exists
  fs.appendFileSync(PATHS.users, id + "\n", "utf8");
}

// ── Token helpers (config first, env fallback) ───────────

interface ConfigTokens {
  telegram_bot_token?: string;
  saweria_token?: string;
  koalastore_api_key?: string;
}

function loadConfigTokens(): ConfigTokens {
  return readJSON<ConfigTokens>(PATHS.config);
}

export function getTelegramToken(): string {
  return loadConfigTokens().telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || "";
}

export function getSaweriaToken(): string {
  return loadConfigTokens().saweria_token || process.env.SAWERIA_TOKEN || "";
}

export function getKoalastoreApiKey(): string {
  return loadConfigTokens().koalastore_api_key || process.env.KOALASTORE_API_KEY || "";
}
