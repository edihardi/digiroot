import { NextResponse } from "next/server";
import { readJSON, PATHS, getUsers } from "@/lib/store";
import { getBotInstance } from "@/lib/bot";
import type { Transaction, Product } from "@/lib/types";

export async function GET() {
  const transactions = readJSON<Transaction[]>(PATHS.transactions);
  const products = readJSON<Product[]>(PATHS.products);
  const users = getUsers();
  const botActive = getBotInstance() !== null;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Only count delivered/paid transactions for revenue
  const paid = transactions.filter(
    (t) => t.status === "delivered" || t.status === "paid"
  );

  function inRange(iso: string, from: Date) {
    return new Date(iso) >= from;
  }

  // Transaction counts (all statuses)
  const txToday = transactions.filter((t) => inRange(t.createdAt, startOfDay)).length;
  const txWeek = transactions.filter((t) => inRange(t.createdAt, startOfWeek)).length;
  const txMonth = transactions.filter((t) => inRange(t.createdAt, startOfMonth)).length;

  // Revenue & profit (only paid/delivered)
  const revenueToday = paid
    .filter((t) => inRange(t.paidAt || t.createdAt, startOfDay))
    .reduce((s, t) => s + t.amount, 0);
  const revenueMonth = paid
    .filter((t) => inRange(t.paidAt || t.createdAt, startOfMonth))
    .reduce((s, t) => s + t.amount, 0);
  const profitToday = paid
    .filter((t) => inRange(t.paidAt || t.createdAt, startOfDay))
    .reduce((s, t) => s + t.profit, 0);
  const profitMonth = paid
    .filter((t) => inRange(t.paidAt || t.createdAt, startOfMonth))
    .reduce((s, t) => s + t.profit, 0);
  const revenueTotal = paid.reduce((s, t) => s + t.amount, 0);
  const profitTotal = paid.reduce((s, t) => s + t.profit, 0);

  // Pending QRIS count
  const pendingQris = transactions.filter(
    (t) => t.status === "pending" && t.method === "qris"
  ).length;

  // Top 5 products by totalProdukTerjual
  const topProducts = [...products]
    .sort((a, b) => (b.totalProdukTerjual || 0) - (a.totalProdukTerjual || 0))
    .slice(0, 5)
    .map((p) => ({
      productName: p.productName,
      category: p.category,
      sold: p.totalProdukTerjual || 0,
      revenue: (p.totalProdukTerjual || 0) * p.priceProduct,
    }));

  // 10 most recent transactions
  const recent = [...transactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return NextResponse.json({
    botActive,
    totalUsers: users.length,
    totalProducts: products.length,
    pendingQris,
    transactions: {
      today: txToday,
      week: txWeek,
      month: txMonth,
      total: transactions.length,
    },
    revenue: {
      today: revenueToday,
      month: revenueMonth,
      total: revenueTotal,
    },
    profit: {
      today: profitToday,
      month: profitMonth,
      total: profitTotal,
    },
    topProducts,
    recent,
  });
}
