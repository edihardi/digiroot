"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface OverviewData {
  botActive: boolean;
  totalUsers: number;
  totalProducts: number;
  pendingQris: number;
  transactions: { today: number; week: number; month: number; total: number };
  revenue: { today: number; month: number; total: number };
  profit: { today: number; month: number; total: number };
  topProducts: { productName: string; category: string; sold: number; revenue: number }[];
  recent: {
    id: string;
    reference: string;
    username: string;
    productName: string;
    amount: number;
    method: string;
    status: string;
    createdAt: string;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  paid: "bg-blue-500/20 text-blue-400",
  delivered: "bg-emerald-500/20 text-emerald-400",
  expired: "bg-gray-500/20 text-gray-400",
  cancelled: "bg-red-500/20 text-red-400",
  failed: "bg-red-500/20 text-red-400",
};

export default function DashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function handleScroll() {
      if (!el) return;
      const page = Math.round(el.scrollLeft / el.clientWidth);
      setActivePage(page);
    }
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [data]);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/overview");
    const json: OverviewData = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  function formatRupiah(n: number) {
    return "Rp " + n.toLocaleString("id-ID");
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading || !data) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <i className="fas fa-spinner fa-spin" />
        Memuat dashboard...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="anim-fade-in-up mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            Overview statistik toko
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Bot Status */}
          <div
            className={`flex items-center gap-2 rounded-lg border-2 border-[#555] px-3 py-2 text-sm font-medium ${
              data.botActive
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                data.botActive ? "bg-emerald-400 anim-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-red-400"
              }`}
            />
            Bot {data.botActive ? "Active" : "Offline"}
          </div>
          <button onClick={fetchData} className="neo-btn-secondary text-sm">
            <i className="fas fa-rotate-right mr-1.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Pending QRIS Alert */}
      {data.pendingQris > 0 && (
        <Link
          href="/dashboard/transactions?status=pending&method=qris"
          className="anim-attention mb-6 flex items-center gap-3 rounded-lg border-2 border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400 transition-colors hover:bg-yellow-500/15"
        >
          <i className="fas fa-clock anim-clock text-lg" />
          <span>
            <strong>{data.pendingQris} transaksi QRIS</strong> menunggu
            konfirmasi pembayaran
          </span>
          <i className="fas fa-arrow-right ml-auto" />
        </Link>
      )}

      {/* Stats Cards — horizontal snap-scroll on mobile, grid rows on desktop */}
      {/* Mobile: swipeable 3 pages, 4 cards each */}
      <div ref={scrollRef} className="scrollbar-hide mb-2 flex snap-x snap-mandatory gap-4 overflow-x-auto lg:mb-6 lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible">
        {/* Page 1 — Transaksi */}
        <div className="grid w-full shrink-0 snap-center grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-4 lg:gap-4">
          <StatCard
            icon="fa-receipt"
            iconColor="text-primary"
            label="Transaksi Hari Ini"
            value={String(data.transactions.today)}
            delay={0}
          />
          <StatCard
            icon="fa-calendar-week"
            iconColor="text-blue-400"
            label="Minggu Ini"
            value={String(data.transactions.week)}
            delay={60}
          />
          <StatCard
            icon="fa-calendar"
            iconColor="text-purple-400"
            label="Bulan Ini"
            value={String(data.transactions.month)}
            delay={120}
          />
          <StatCard
            icon="fa-chart-line"
            iconColor="text-emerald-400"
            label="Total Transaksi"
            value={String(data.transactions.total)}
            delay={180}
          />
        </div>

        {/* Page 2 — Revenue & Profit */}
        <div className="grid w-full shrink-0 snap-center grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-4 lg:gap-4">
          <StatCard
            icon="fa-money-bill-wave"
            iconColor="text-emerald-400"
            label="Pendapatan Hari Ini"
            value={formatRupiah(data.revenue.today)}
            delay={240}
          />
          <StatCard
            icon="fa-money-bill-wave"
            iconColor="text-emerald-400"
            label="Pendapatan Bulan Ini"
            value={formatRupiah(data.revenue.month)}
            delay={300}
          />
          <StatCard
            icon="fa-piggy-bank"
            iconColor="text-primary"
            label="Profit Hari Ini"
            value={formatRupiah(data.profit.today)}
            delay={360}
          />
          <StatCard
            icon="fa-piggy-bank"
            iconColor="text-primary"
            label="Profit Bulan Ini"
            value={formatRupiah(data.profit.month)}
            delay={420}
          />
        </div>

        {/* Page 3 — Totals */}
        <div className="grid w-full shrink-0 snap-center grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-4 lg:gap-4">
          <StatCard
            icon="fa-wallet"
            iconColor="text-emerald-400"
            label="Total Pendapatan"
            value={formatRupiah(data.revenue.total)}
            delay={480}
          />
          <StatCard
            icon="fa-coins"
            iconColor="text-primary"
            label="Total Profit"
            value={formatRupiah(data.profit.total)}
            delay={540}
          />
          <StatCard
            icon="fa-users"
            iconColor="text-blue-400"
            label="Total User"
            value={String(data.totalUsers)}
            delay={600}
          />
          <StatCard
            icon="fa-box"
            iconColor="text-purple-400"
            label="Total Produk"
            value={String(data.totalProducts)}
            delay={660}
          />
        </div>
      </div>

      {/* Scroll dot indicators — mobile only */}
      <div className="mb-5 flex items-center justify-center gap-2 lg:hidden">
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            onClick={() =>
              scrollRef.current?.scrollTo({
                left: i * (scrollRef.current?.clientWidth ?? 0),
                behavior: "smooth",
              })
            }
            className={`h-2 rounded-full transition-all ${
              activePage === i ? "w-5 bg-primary" : "w-2 bg-[#555]"
            }`}
          />
        ))}
      </div>

      {/* Bottom: Top Products + Recent Transactions */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Top Products */}
        <div className="neo-card anim-fade-in-up" style={{ animationDelay: "300ms" }}>
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-white">
            <i className="fas fa-trophy anim-shimmer text-primary" />
            Produk Terlaris
          </h2>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-muted">Belum ada data penjualan.</p>
          ) : (
            <div className="space-y-3">
              {data.topProducts.map((p, i) => (
                <div
                  key={p.productName}
                  className="anim-fade-in-up flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5"
                  style={{ animationDelay: `${400 + i * 80}ms` }}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0
                        ? "bg-primary text-black"
                        : i === 1
                          ? "bg-gray-300 text-black"
                          : i === 2
                            ? "bg-amber-700 text-white"
                            : "bg-white/10 text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-white">
                      {p.productName}
                    </div>
                    <div className="text-xs text-muted">{p.category}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">
                      {p.sold} terjual
                    </div>
                    <div className="text-xs text-muted">
                      {formatRupiah(p.revenue)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="neo-card anim-fade-in-up" style={{ animationDelay: "450ms" }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <i className="fas fa-clock-rotate-left anim-clock text-blue-400" />
              Transaksi Terbaru
            </h2>
            <Link
              href="/dashboard/transactions"
              className="text-xs text-primary hover:underline"
            >
              Lihat semua
            </Link>
          </div>
          {data.recent.length === 0 ? (
            <p className="text-sm text-muted">Belum ada transaksi.</p>
          ) : (
            <div className="space-y-2">
              {data.recent.map((tx, i) => (
                <div
                  key={tx.id}
                  className="anim-fade-in-up flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5"
                  style={{ animationDelay: `${550 + i * 80}ms` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">
                        {tx.productName}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          STATUS_COLORS[tx.status] || "bg-white/10 text-white"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      {tx.username} &middot; {formatDate(tx.createdAt)}
                    </div>
                  </div>
                  <div className="text-right text-sm font-bold text-white">
                    {formatRupiah(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ICON_ANIM: Record<string, string> = {
  "fa-receipt": "anim-stamp",
  "fa-calendar-week": "anim-tick",
  "fa-calendar": "anim-tick",
  "fa-chart-line": "anim-grow",
  "fa-money-bill-wave": "anim-float",
  "fa-piggy-bank": "anim-jiggle",
  "fa-wallet": "anim-peek",
  "fa-coins": "anim-coin",
  "fa-users": "anim-bounce",
  "fa-box": "anim-rock",
};

function StatCard({
  icon,
  iconColor,
  label,
  value,
  delay = 0,
}: {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
  delay?: number;
}) {
  return (
    <div
      className="neo-card anim-card-enter flex items-center gap-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 ${iconColor}`}
      >
        <i className={`fas ${icon} ${ICON_ANIM[icon] || ""}`} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-white sm:text-lg">{value}</div>
        <div className="text-[11px] text-muted sm:text-xs">{label}</div>
      </div>
    </div>
  );
}

