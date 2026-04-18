import { NextRequest } from "next/server";
import { readJSON, PATHS } from "@/lib/store";
import type { Transaction } from "@/lib/types";
import * as XLSX from "xlsx";

// GET /api/transactions/export?from=...&to=...&status=...&method=...
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");
  const method = searchParams.get("method");

  let transactions = readJSON<Transaction[]>(PATHS.transactions);

  // Sort newest first
  transactions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Filters
  if (status && status !== "all") {
    transactions = transactions.filter((t) => t.status === status);
  }
  if (method && method !== "all") {
    transactions = transactions.filter((t) => t.method === method);
  }
  if (from) {
    const fromDate = new Date(from);
    transactions = transactions.filter((t) => new Date(t.createdAt) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    transactions = transactions.filter((t) => new Date(t.createdAt) <= toDate);
  }

  // Build worksheet data
  const rows = transactions.map((t) => ({
    Reference: t.reference,
    Username: t.username,
    "Chat ID": t.chatId,
    Produk: t.productName,
    Qty: t.quantity,
    "Total (Rp)": t.amount,
    "Profit (Rp)": t.profit,
    Metode: t.method === "qris" ? "QRIS Statis" : "Saweria",
    Status: t.status,
    "Tanggal Order": t.createdAt,
    "Tanggal Bayar": t.paidAt || "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto column widths
  const colWidths = Object.keys(rows[0] || {}).map((key) => ({
    wch: Math.max(
      key.length,
      ...rows.map((r) => String((r as Record<string, unknown>)[key] || "").length)
    ) + 2,
  }));
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Transaksi");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = `transaksi-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
