"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useToast } from "@/components/Toast";

function useIsMobile() {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("resize", cb);
    return () => window.removeEventListener("resize", cb);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.innerWidth < 768,
    () => false
  );
}

interface Transaction {
  id: string;
  chatId: number;
  username: string;
  productName: string;
  productId: string;
  quantity: number;
  amount: number;
  profit: number;
  method: "saweria" | "qris";
  status: "pending" | "paid" | "delivered" | "expired" | "cancelled" | "failed";
  reference: string;
  createdAt: string;
  paidAt?: string;
  deliveredData?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  paid: "bg-blue-500/20 text-blue-400",
  delivered: "bg-emerald-500/20 text-emerald-400",
  expired: "bg-gray-500/20 text-gray-400",
  cancelled: "bg-red-500/20 text-red-400",
  failed: "bg-red-500/20 text-red-400",
};

const METHOD_LABELS: Record<string, string> = {
  saweria: "Saweria",
  qris: "QRIS Statis",
};

export default function TransactionsPage() {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const isMobile = useIsMobile();
  const limit = isMobile ? 10 : 20;

  // Detail modal
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{
    type: "confirm" | "cancel";
    tx: Transaction;
  } | null>(null);

  const fetchTransactions = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterMethod !== "all") params.set("method", filterMethod);
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("limit", String(limit));

    const res = await fetch(`/api/transactions?${params}`);
    const data = await res.json();
    setTransactions(data.data);
    setTotal(data.total);
    setLoading(false);
  }, [filterStatus, filterMethod, search, page]);

  useEffect(() => {
    setLoading(true);
    fetchTransactions();
  }, [fetchTransactions]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filterStatus, filterMethod, search]);

  async function handleConfirmPayment(reference: string) {
    setActionLoading(reference);
    try {
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(reference)}/confirm`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error || "Gagal konfirmasi");
      } else {
        toast("success", "Pembayaran berhasil dikonfirmasi");
      }
    } catch {
      toast("error", "Gagal konfirmasi pembayaran");
    }
    setActionLoading(null);
    setConfirmAction(null);
    fetchTransactions();
  }

  async function handleCancelTransaction(reference: string) {
    setActionLoading(reference);
    try {
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(reference)}/cancel`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error || "Gagal cancel");
      } else {
        toast("success", "Transaksi berhasil dibatalkan");
      }
    } catch {
      toast("error", "Gagal cancel transaksi");
    }
    setActionLoading(null);
    setConfirmAction(null);
    fetchTransactions();
  }

  function formatRupiah(n: number) {
    return "Rp " + n.toLocaleString("id-ID");
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Count pending QRIS for highlight
  const pendingQrisCount = transactions.filter(
    (t) => t.status === "pending" && t.method === "qris"
  ).length;

  if (loading && transactions.length === 0) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <i className="fas fa-spinner fa-spin" />
        Memuat transaksi...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="anim-fade-in-up mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            <i className="fas fa-receipt anim-stamp mr-2 text-primary" />
            Manajemen Transaksi
          </h1>
          {pendingQrisCount > 0 && (
            <p className="anim-attention mt-1 text-sm text-yellow-400">
              <i className="fas fa-clock anim-clock mr-1.5" />
              {pendingQrisCount} transaksi QRIS menunggu konfirmasi
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (filterStatus !== "all") params.set("status", filterStatus);
              if (filterMethod !== "all") params.set("method", filterMethod);
              const url = `/api/transactions/export?${params.toString()}`;
              window.open(url, "_blank");
            }}
            className="neo-btn-primary"
          >
            <i className="fas fa-file-excel mr-2" />
            Export Excel
          </button>
          <button onClick={fetchTransactions} className="neo-btn-secondary">
            <i className="fas fa-rotate-right mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="anim-fade-in-up mb-5 flex flex-wrap gap-3" style={{ animationDelay: "100ms" }}>
        <input
          type="text"
          placeholder="Cari username, ref, produk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="neo-input w-full sm:w-72"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="neo-input"
        >
          <option value="all">Semua Status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="delivered">Delivered</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={filterMethod}
          onChange={(e) => setFilterMethod(e.target.value)}
          className="neo-input"
        >
          <option value="all">Semua Metode</option>
          <option value="saweria">Saweria</option>
          <option value="qris">QRIS Statis</option>
        </select>
      </div>

      {/* Empty state */}
      {transactions.length === 0 && (
        <div className="neo-card px-4 py-8 text-center text-muted">
          Tidak ada transaksi.
        </div>
      )}

      {/* Mobile Cards */}
      {transactions.length > 0 && (
        <div className="space-y-3 md:hidden">
          {transactions.map((tx, i) => (
            <div
              key={tx.id}
              className={`neo-card anim-fade-in-up space-y-3 ${
                tx.status === "pending" && tx.method === "qris"
                  ? "ring-1 ring-yellow-500/30"
                  : ""
              }`}
              style={{ animationDelay: `${150 + i * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => setDetailTx(tx)}
                  className="font-mono text-xs text-primary hover:underline truncate"
                >
                  {tx.reference}
                </button>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold uppercase ${
                    STATUS_COLORS[tx.status] || "bg-white/10 text-white"
                  }`}
                >
                  {tx.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-xs text-muted">User</span>
                  <div className="font-medium text-white truncate">{tx.username}</div>
                </div>
                <div>
                  <span className="text-xs text-muted">Produk</span>
                  <div className="text-white truncate">{tx.productName}</div>
                  <div className="text-xs text-muted">x{tx.quantity}</div>
                </div>
                <div>
                  <span className="text-xs text-muted">Jumlah</span>
                  <div className="font-medium text-white">{formatRupiah(tx.amount)}</div>
                </div>
                <div>
                  <span className="text-xs text-muted">Metode</span>
                  <div>
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-white">
                      {METHOD_LABELS[tx.method] || tx.method}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted">
                <i className="fas fa-clock mr-1" />
                {formatDate(tx.createdAt)}
              </div>
              <div className="flex gap-2 border-t border-[#333] pt-3">
                <button
                  onClick={() => setDetailTx(tx)}
                  className="neo-btn-secondary flex-1 justify-center text-xs"
                >
                  <i className="fas fa-eye mr-1.5" />
                  Detail
                </button>
                {tx.status === "pending" && tx.method === "qris" && (
                  <button
                    onClick={() => setConfirmAction({ type: "confirm", tx })}
                    disabled={actionLoading === tx.reference}
                    className="neo-btn-primary flex-1 justify-center text-xs"
                  >
                    <i className="fas fa-check mr-1.5" />
                    Konfirmasi
                  </button>
                )}
                {tx.status === "pending" && (
                  <button
                    onClick={() => setConfirmAction({ type: "cancel", tx })}
                    disabled={actionLoading === tx.reference}
                    className="neo-btn-danger flex-1 justify-center text-xs"
                  >
                    <i className="fas fa-xmark mr-1.5" />
                    Batal
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop Table */}
      {transactions.length > 0 && (
        <div className="neo-card anim-fade-in-up hidden overflow-x-auto md:block" style={{ animationDelay: "150ms" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[#555] text-muted">
                <th className="px-4 py-3 font-semibold">Reference</th>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Produk</th>
                <th className="px-4 py-3 font-semibold text-right">Jumlah</th>
                <th className="px-4 py-3 font-semibold text-center">Metode</th>
                <th className="px-4 py-3 font-semibold text-center">Status</th>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className={`border-b border-[#333] transition-colors hover:bg-white/5 ${
                    tx.status === "pending" && tx.method === "qris"
                      ? "bg-yellow-500/5"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDetailTx(tx)}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {tx.reference}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">
                      {tx.username}
                    </div>
                    <div className="text-xs text-muted">{tx.chatId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white">{tx.productName}</div>
                    <div className="text-xs text-muted">x{tx.quantity}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-white">
                    {formatRupiah(tx.amount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-white">
                      {METHOD_LABELS[tx.method] || tx.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${
                        STATUS_COLORS[tx.status] || "bg-white/10 text-white"
                      }`}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {formatDate(tx.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setDetailTx(tx)}
                        className="rounded p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-white"
                        title="Detail"
                      >
                        <i className="fas fa-eye" />
                      </button>
                      {tx.status === "pending" && tx.method === "qris" && (
                        <button
                          onClick={() =>
                            setConfirmAction({ type: "confirm", tx })
                          }
                          disabled={actionLoading === tx.reference}
                          className="rounded p-1.5 text-emerald-400 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300"
                          title="Konfirmasi Pembayaran"
                        >
                          <i className="fas fa-check-circle" />
                        </button>
                      )}
                      {tx.status === "pending" && (
                        <button
                          onClick={() =>
                            setConfirmAction({ type: "cancel", tx })
                          }
                          disabled={actionLoading === tx.reference}
                          className="rounded p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                          title="Batalkan"
                        >
                          <i className="fas fa-xmark" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            {total} transaksi — halaman {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="neo-btn-secondary text-xs disabled:opacity-30"
            >
              <i className="fas fa-chevron-left mr-1" />
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="neo-btn-secondary text-xs disabled:opacity-30"
            >
              Next
              <i className="fas fa-chevron-right ml-1" />
            </button>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detailTx && (
        <Modal onClose={() => setDetailTx(null)} title="Detail Transaksi">
          <div className="space-y-3 text-sm">
            <Row label="Reference" value={detailTx.reference} mono />
            <Row label="Status">
              <span
                className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${
                  STATUS_COLORS[detailTx.status]
                }`}
              >
                {detailTx.status}
              </span>
            </Row>
            <Row label="Metode" value={METHOD_LABELS[detailTx.method]} />
            <Row label="User" value={`${detailTx.username} (${detailTx.chatId})`} />
            <Row
              label="Produk"
              value={`${detailTx.productName} x${detailTx.quantity}`}
            />
            <Row label="Total" value={formatRupiah(detailTx.amount)} />
            <Row label="Profit" value={formatRupiah(detailTx.profit)} />
            <Row label="Dibuat" value={formatDate(detailTx.createdAt)} />
            {detailTx.paidAt && (
              <Row label="Dibayar" value={formatDate(detailTx.paidAt)} />
            )}
            {detailTx.deliveredData && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted">
                  DATA DELIVERY
                </div>
                <div className="rounded border border-[#555] bg-[#1a1a1a] p-3 text-xs text-muted">
                  {detailTx.deliveredData.split("\n").map((line, i) => (
                    <div key={i} className="break-all">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions inside detail modal */}
          {detailTx.status === "pending" && (
            <div className="mt-5 flex gap-3 border-t border-[#555] pt-4">
              {detailTx.method === "qris" && (
                <button
                  onClick={() => {
                    setDetailTx(null);
                    setConfirmAction({ type: "confirm", tx: detailTx });
                  }}
                  className="neo-btn-primary text-sm"
                >
                  <i className="fas fa-check mr-1.5" />
                  Konfirmasi Pembayaran
                </button>
              )}
              <button
                onClick={() => {
                  setDetailTx(null);
                  setConfirmAction({ type: "cancel", tx: detailTx });
                }}
                className="neo-btn-danger text-sm"
              >
                <i className="fas fa-xmark mr-1.5" />
                Batalkan
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* ── Confirm Action Dialog ── */}
      {confirmAction && (
        <Modal
          onClose={() => setConfirmAction(null)}
          title={
            confirmAction.type === "confirm"
              ? "Konfirmasi Pembayaran?"
              : "Batalkan Transaksi?"
          }
        >
          <p className="mb-2 text-sm text-muted">
            {confirmAction.type === "confirm" ? (
              <>
                Konfirmasi pembayaran QRIS untuk transaksi{" "}
                <span className="font-bold text-white">
                  {confirmAction.tx.reference}
                </span>
                ? Produk akan langsung dikirim ke user.
              </>
            ) : (
              <>
                Batalkan transaksi{" "}
                <span className="font-bold text-white">
                  {confirmAction.tx.reference}
                </span>
                ? User akan menerima notifikasi pembatalan.
              </>
            )}
          </p>
          <div className="mb-3 text-sm text-muted">
            <span className="text-white">{confirmAction.tx.productName}</span> x
            {confirmAction.tx.quantity} —{" "}
            {formatRupiah(confirmAction.tx.amount)}
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setConfirmAction(null)}
              className="neo-btn-secondary"
            >
              Batal
            </button>
            {confirmAction.type === "confirm" ? (
              <button
                onClick={() =>
                  handleConfirmPayment(confirmAction.tx.reference)
                }
                disabled={actionLoading === confirmAction.tx.reference}
                className="neo-btn-primary"
              >
                {actionLoading === confirmAction.tx.reference ? (
                  <i className="fas fa-spinner fa-spin mr-1.5" />
                ) : (
                  <i className="fas fa-check mr-1.5" />
                )}
                Konfirmasi & Kirim
              </button>
            ) : (
              <button
                onClick={() =>
                  handleCancelTransaction(confirmAction.tx.reference)
                }
                disabled={actionLoading === confirmAction.tx.reference}
                className="neo-btn-danger"
              >
                {actionLoading === confirmAction.tx.reference ? (
                  <i className="fas fa-spinner fa-spin mr-1.5" />
                ) : (
                  <i className="fas fa-xmark mr-1.5" />
                )}
                Batalkan Transaksi
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Reusable Components ──

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-[fade-in_0.15s_ease-out]"
      onClick={onClose}
    >
      <div
        className="neo-card anim-card-enter w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted transition-colors hover:text-white"
          >
            <i className="fas fa-xmark text-lg" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted">{label}</span>
      {children || (
        <span
          className={`text-right text-white ${mono ? "font-mono text-xs" : ""}`}
        >
          {value}
        </span>
      )}
    </div>
  );
}
