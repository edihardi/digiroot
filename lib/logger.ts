import fs from "fs";
import path from "path";

const LOGS_DIR = path.join(process.cwd(), "logs");

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

type Direction = "IN" | "OUT" | "EVENT";

function getLogPath(): string {
  const now = new Date();
  const date = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }); // YYYY-MM-DD
  return path.join(LOGS_DIR, `chat-${date}.log`);
}

function timestamp(): string {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Jakarta",
    hour12: false,
  }).replace(",", "");
}

export function chatLog(
  direction: Direction,
  userId: number | string,
  username: string,
  message: string
): void {
  const line = `[${timestamp()}] [TG] [${direction}] [${userId}] [${username}] ${message}\n`;
  try {
    fs.appendFileSync(getLogPath(), line, "utf8");
  } catch {
    // silently fail — logging should not crash the bot
  }
}

/**
 * Read last N lines from today's (or a specific date's) log file.
 */
export function readLogLines(date?: string, maxLines = 200): string[] {
  const logDate = date || new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
  const fp = path.join(LOGS_DIR, `chat-${logDate}.log`);
  if (!fs.existsSync(fp)) return [];

  const content = fs.readFileSync(fp, "utf8").trim();
  if (!content) return [];

  const lines = content.split("\n");
  return lines.slice(-maxLines);
}

/**
 * List available log files (dates).
 */
export function listLogDates(): string[] {
  if (!fs.existsSync(LOGS_DIR)) return [];
  return fs
    .readdirSync(LOGS_DIR)
    .filter((f) => f.startsWith("chat-") && f.endsWith(".log"))
    .map((f) => f.replace("chat-", "").replace(".log", ""))
    .sort()
    .reverse();
}
