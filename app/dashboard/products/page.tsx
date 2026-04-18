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

interface Product {
  productName: string;
  productId: string;
  category: string;
  costPrice: number;
  priceProduct: number;
  profit: number;
  format: string;
  totalProdukTerjual: number;
  description: string;
  warranty?: string;
  activation?: string;
  email?: string;
  usage?: string;
}

interface StockInfo {
  count: number;
  preview: string[];
}

const emptyProduct = (): Partial<Product> => ({
  productName: "",
  productId: "",
  category: "",
  costPrice: 0,
  priceProduct: 0,
  profit: 0,
  format: "",
  description: "",
  warranty: "",
  activation: "",
  email: "",
  usage: "",
});

export default function ProductsPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, StockInfo>>({});
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Product>>(emptyProduct());

  // Stock modal
  const [stockModal, setStockModal] = useState<string | null>(null);
  const [stockText, setStockText] = useState("");

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Search/filter
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // Pagination
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);
  const perPage = isMobile ? 5 : 10;

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products");
    const data: Product[] = await res.json();
    setProducts(data);
    setLoading(false);

    // Fetch stock counts
    const map: Record<string, StockInfo> = {};
    await Promise.all(
      data.map(async (p) => {
        const sr = await fetch(`/api/stock/${encodeURIComponent(p.productName)}`);
        const sd = await sr.json();
        map[p.productName] = { count: sd.count, preview: sd.preview };
      })
    );
    setStockMap(map);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Categories for filter
  const categories = [...new Set(products.map((p) => p.category))];

  // Filtered products
  const filtered = products.filter((p) => {
    const matchSearch =
      !search ||
      p.productName.toLowerCase().includes(search.toLowerCase()) ||
      p.productId.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !filterCategory || p.category === filterCategory;
    return matchSearch && matchCategory;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, filterCategory]);

  // ── CRUD Handlers ──

  function openAdd() {
    setEditingId(null);
    setForm(emptyProduct());
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditingId(p.productId);
    setForm({ ...p });
    setShowForm(true);
  }

  async function handleSave() {
    if (editingId) {
      await fetch(`/api/products/${encodeURIComponent(editingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        toast("error", data.error);
        return;
      }
    }
    setShowForm(false);
    fetchProducts();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
    setDeleteConfirm(null);
    fetchProducts();
  }

  // ── Stock Handlers ──

  async function handleAddStock() {
    if (!stockModal || !stockText.trim()) return;
    await fetch(`/api/stock/${encodeURIComponent(stockModal)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock: stockText }),
    });
    setStockText("");
    setStockModal(null);
    fetchProducts();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!stockModal || !e.target.files?.[0]) return;
    const fd = new FormData();
    fd.append("file", e.target.files[0]);
    await fetch(`/api/stock/${encodeURIComponent(stockModal)}`, {
      method: "POST",
      body: fd,
    });
    setStockModal(null);
    fetchProducts();
  }

  function formatRupiah(n: number) {
    return "Rp " + n.toLocaleString("id-ID");
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <i className="fas fa-spinner fa-spin" />
        Memuat produk...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="anim-fade-in-up mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">
          <i className="fas fa-box anim-rock mr-2 text-primary" />
          Manajemen Produk
        </h1>
        <button onClick={openAdd} className="neo-btn-primary">
          <i className="fas fa-plus mr-2" />
          Tambah Produk
        </button>
      </div>

      {/* Filters */}
      <div className="anim-fade-in-up mb-5 flex flex-wrap gap-3" style={{ animationDelay: "100ms" }}>
        <input
          type="text"
          placeholder="Cari produk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="neo-input w-full sm:w-64"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="neo-input"
        >
          <option value="">Semua Kategori</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="neo-card px-4 py-8 text-center text-muted">
          {products.length === 0
            ? "Belum ada produk. Klik Tambah Produk untuk mulai."
            : "Tidak ada produk yang cocok."}
        </div>
      )}

      {/* Mobile Cards */}
      {paginated.length > 0 && (
        <div className="space-y-3 md:hidden">
          {paginated.map((p, i) => (
            <div key={p.productId} className="neo-card anim-fade-in-up space-y-3" style={{ animationDelay: `${150 + i * 60}ms` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white truncate">{p.productName}</div>
                  <div className="text-xs text-muted">{p.productId}</div>
                </div>
                <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-white">
                  {p.category}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-xs text-muted">Modal</span>
                  <div className="font-medium text-muted">{formatRupiah(p.costPrice || 0)}</div>
                </div>
                <div>
                  <span className="text-xs text-muted">Jual</span>
                  <div className="font-medium text-white">{formatRupiah(p.priceProduct)}</div>
                </div>
                <div>
                  <span className="text-xs text-muted">Profit</span>
                  <div className="font-medium text-success">{formatRupiah(p.profit)}</div>
                </div>
                <div>
                  <span className="text-xs text-muted">Stok</span>
                  <div>
                    <button
                      onClick={() => { setStockModal(p.productName); setStockText(""); }}
                      className="inline-flex items-center gap-1.5 rounded bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20"
                    >
                      <i className="fas fa-box-open text-primary" />
                      {stockMap[p.productName]?.count ?? "..."}
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted">Terjual</span>
                  <div className="text-muted">{p.totalProdukTerjual}</div>
                </div>
              </div>
              <div className="flex gap-2 border-t border-[#333] pt-3">
                <button
                  onClick={() => openEdit(p)}
                  className="neo-btn-secondary flex-1 justify-center text-xs"
                >
                  <i className="fas fa-pen-to-square mr-1.5" />
                  Edit
                </button>
                <button
                  onClick={() => setDeleteConfirm(p.productId)}
                  className="neo-btn-danger flex-1 justify-center text-xs"
                >
                  <i className="fas fa-trash mr-1.5" />
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop Table */}
      {paginated.length > 0 && (
        <div className="neo-card anim-fade-in-up hidden overflow-x-auto md:block" style={{ animationDelay: "150ms" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[#555] text-muted">
                <th className="px-4 py-3 font-semibold">Produk</th>
                <th className="px-4 py-3 font-semibold">Kategori</th>
                <th className="px-4 py-3 font-semibold text-right">Modal</th>
                <th className="px-4 py-3 font-semibold text-right">Jual</th>
                <th className="px-4 py-3 font-semibold text-right">Profit</th>
                <th className="px-4 py-3 font-semibold text-center">Stok</th>
                <th className="px-4 py-3 font-semibold text-center">Terjual</th>
                <th className="px-4 py-3 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((p) => (
                <tr
                  key={p.productId}
                  className="border-b border-[#333] transition-colors hover:bg-white/5"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{p.productName}</div>
                    <div className="text-xs text-muted">{p.productId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-white">
                      {p.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-muted">
                    {formatRupiah(p.costPrice || 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-white">
                    {formatRupiah(p.priceProduct)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-success">
                    {formatRupiah(p.profit)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => {
                        setStockModal(p.productName);
                        setStockText("");
                      }}
                      className="inline-flex items-center gap-1.5 rounded bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20"
                    >
                      <i className="fas fa-box-open text-primary" />
                      {stockMap[p.productName]?.count ?? "..."}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center text-muted">
                    {p.totalProdukTerjual}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEdit(p)}
                        className="rounded p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-white"
                        title="Edit"
                      >
                        <i className="fas fa-pen-to-square" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(p.productId)}
                        className="rounded p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                        title="Hapus"
                      >
                        <i className="fas fa-trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filtered.length > 0 && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            {filtered.length} produk — halaman {safePage}/{totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="neo-btn-secondary text-xs disabled:opacity-30"
            >
              <i className="fas fa-chevron-left mr-1" />
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="neo-btn-secondary text-xs disabled:opacity-30"
            >
              Next
              <i className="fas fa-chevron-right ml-1" />
            </button>
          </div>
        </div>
      )}

      {/* ── Product Form Modal ── */}
      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editingId ? "Edit Produk" : "Tambah Produk"}>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Nama Produk" value={form.productName || ""} onChange={(v) => setForm({ ...form, productName: v })} />
              <FormField label="Product ID" value={form.productId || ""} onChange={(v) => setForm({ ...form, productId: v })} disabled={!!editingId} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Kategori" value={form.category || ""} onChange={(v) => setForm({ ...form, category: v })} />
              <FormField label="Format" value={form.format || ""} onChange={(v) => setForm({ ...form, format: v })} placeholder="email|password" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Harga Modal (Rp)"
                type="number"
                value={String(form.costPrice || 0)}
                onChange={(v) => {
                  const cost = Number(v) || 0;
                  setForm({ ...form, costPrice: cost, profit: (form.priceProduct || 0) - cost });
                }}
              />
              <FormField
                label="Harga Jual (Rp)"
                type="number"
                value={String(form.priceProduct || 0)}
                onChange={(v) => {
                  const sell = Number(v) || 0;
                  setForm({ ...form, priceProduct: sell, profit: sell - (form.costPrice || 0) });
                }}
              />
            </div>
            {(form.priceProduct || 0) > 0 && (
              <div className={`rounded-lg border-2 px-4 py-2 text-sm font-medium ${
                (form.profit || 0) > 0
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : (form.profit || 0) < 0
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-[#555] bg-white/5 text-muted"
              }`}>
                Profit: {formatRupiah(form.profit || 0)} per item
              </div>
            )}
            <FormField label="Deskripsi" value={form.description || ""} onChange={(v) => setForm({ ...form, description: v })} textarea />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Garansi" value={form.warranty || ""} onChange={(v) => setForm({ ...form, warranty: v })} />
              <FormField label="Aktivasi" value={form.activation || ""} onChange={(v) => setForm({ ...form, activation: v })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Email" value={form.email || ""} onChange={(v) => setForm({ ...form, email: v })} />
              <FormField label="Usage" value={form.usage || ""} onChange={(v) => setForm({ ...form, usage: v })} />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="neo-btn-secondary">
              Batal
            </button>
            <button onClick={handleSave} className="neo-btn-primary">
              {editingId ? "Simpan" : "Tambah"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Stock Modal ── */}
      {stockModal && (
        <Modal onClose={() => setStockModal(null)} title={`Stok: ${stockModal}`}>
          <div className="mb-4">
            <div className="mb-2 text-sm text-muted">
              Jumlah stok: <span className="font-bold text-white">{stockMap[stockModal]?.count ?? 0}</span>
            </div>
            {(stockMap[stockModal]?.preview?.length ?? 0) > 0 && (
              <div className="mb-4">
                <div className="mb-1 text-xs font-semibold text-muted">PREVIEW (5 pertama)</div>
                <div className="rounded border border-[#555] bg-[#1a1a1a] p-3 text-xs text-muted">
                  {stockMap[stockModal]?.preview.map((line, i) => (
                    <div key={i} className="truncate">{line}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mb-3 text-sm font-semibold text-muted">TAMBAH STOK</div>
          <textarea
            value={stockText}
            onChange={(e) => setStockText(e.target.value)}
            placeholder="Satu item per baris..."
            className="neo-input mb-3 h-28 w-full resize-none"
          />
          <div className="flex items-center gap-3">
            <button onClick={handleAddStock} className="neo-btn-primary text-sm" disabled={!stockText.trim()}>
              <i className="fas fa-plus mr-1.5" />
              Tambah Manual
            </button>
            <label className="neo-btn-secondary cursor-pointer text-sm">
              <i className="fas fa-upload mr-1.5" />
              Upload .txt
              <input type="file" accept=".txt" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)} title="Hapus Produk?">
          <p className="mb-5 text-sm text-muted">
            Produk <span className="font-bold text-white">{products.find((p) => p.productId === deleteConfirm)?.productName}</span> akan dihapus permanen.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="neo-btn-secondary">
              Batal
            </button>
            <button onClick={() => handleDelete(deleteConfirm)} className="neo-btn-danger">
              <i className="fas fa-trash mr-1.5" />
              Hapus
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Reusable Components ──

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-[fade-in_0.15s_ease-out]" onClick={onClose}>
      <div
        className="neo-card anim-card-enter w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-muted transition-colors hover:text-white">
            <i className="fas fa-xmark text-lg" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  textarea?: boolean;
}) {
  const cls = "neo-input w-full" + (disabled ? " opacity-50 cursor-not-allowed" : "");
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-muted">{label.toUpperCase()}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls + " h-20 resize-none"}
          disabled={disabled}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
          disabled={disabled}
        />
      )}
    </div>
  );
}
