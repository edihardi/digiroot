import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON, PATHS } from "@/lib/store";
import type { Transaction } from "@/lib/types";

// GET /api/transactions — list transactions with filters
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status"); // pending, paid, delivered, expired, cancelled, failed
  const method = searchParams.get("method"); // saweria, qris
  const search = searchParams.get("search"); // search by username, reference, productName
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

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
  if (search) {
    const q = search.toLowerCase();
    transactions = transactions.filter(
      (t) =>
        t.username.toLowerCase().includes(q) ||
        t.reference.toLowerCase().includes(q) ||
        t.productName.toLowerCase().includes(q)
    );
  }

  const total = transactions.length;
  const offset = (page - 1) * limit;
  const data = transactions.slice(offset, offset + limit);

  return NextResponse.json({ data, total, page, limit });
}

// POST /api/transactions/[inline-cancel] — cancel a transaction
// Note: cancel is handled via /api/transactions/[id]/confirm route pattern
