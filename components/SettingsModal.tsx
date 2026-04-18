"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSettingsModal } from "./SettingsModalContext";
import { useToast } from "@/components/Toast";

interface GatekeeperConfig {
  enabled: boolean;
  channel: { id: string; link: string };
  group: { id: string; link: string };
}

interface OrderNotifications {
  new: boolean;
  paid: boolean;
  expired: boolean;
  cancelled: boolean;
}

interface KoalaStoreConfig {
  is_active: boolean;
}

interface KSBalance {
  balance: number;
  formatted_balance: string;
}

interface KSProduct {
  productId: string;
  productName: string;
  ks_base_price: number;
  profit: number;
  priceProduct: number;
}

interface MasterAdmin {
  id: string;
  addedAt: string;
}

interface Config {
  store_name: string;
  admin_contact_telegram: string;
  operating_hours: string;
  gatekeeper: GatekeeperConfig;
  koalastore: KoalaStoreConfig;
  order_notifications: OrderNotifications;
  payment_method: "saweria" | "qris";
  telegram_bot_token_masked: string;
  saweria_token_masked: string;
  koalastore_api_key_masked: string;
}

const defaultConfig: Config = {
  store_name: "",
  admin_contact_telegram: "",
  operating_hours: "",
  gatekeeper: {
    enabled: false,
    channel: { id: "", link: "" },
    group: { id: "", link: "" },
  },
  koalastore: { is_active: false },
  order_notifications: { new: true, paid: true, expired: true, cancelled: true },
  payment_method: "qris",
  telegram_bot_token_masked: "",
  saweria_token_masked: "",
  koalastore_api_key_masked: "",
};

export default function SettingsModal() {
  const { isOpen, close } = useSettingsModal();
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Bot state
  const [botActive, setBotActive] = useState(false);
  const [botUsername, setBotUsername] = useState("");
  const [botRestarting, setBotRestarting] = useState(false);

  // KoalaStore state
  const [ksBalance, setKsBalance] = useState<KSBalance | null>(null);
  const [ksBalanceLoading, setKsBalanceLoading] = useState(false);
  const [ksSyncing, setKsSyncing] = useState(false);
  const [ksSyncResult, setKsSyncResult] = useState<string>("");
  const [ksProducts, setKsProducts] = useState<KSProduct[]>([]);
  const [ksProfits, setKsProfits] = useState<Record<string, number>>({});
  const [ksProfitSaving, setKsProfitSaving] = useState(false);

  // QRIS state
  const [qrisUrl, setQrisUrl] = useState<string | null>(null);
  const [qrisUploading, setQrisUploading] = useState(false);
  const qrisInputRef = useRef<HTMLInputElement>(null);

  // Token input state
  const [tokenBot, setTokenBot] = useState("");
  const [tokenSaweria, setTokenSaweria] = useState("");
  const [tokenKs, setTokenKs] = useState("");
  const [tokenSaving, setTokenSaving] = useState(false);

  // Password state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Master Admin state
  const [masters, setMasters] = useState<MasterAdmin[]>([]);
  const [newMasterId, setNewMasterId] = useState("");
  const [masterAdding, setMasterAdding] = useState(false);

  const { toast } = useToast();

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setConfig({ ...defaultConfig, ...data });
    setLoading(false);
  }, []);

  // Fetch data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      fetchBotStatus();
      fetchKsProducts();
      fetchQrisStatus();
      fetchMasters();
    }
  }, [isOpen, fetchConfig]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, close]);

  async function handleSave(section: Partial<Config>) {
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(section),
    });
    await fetchConfig();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // KoalaStore handlers
  async function fetchKsBalance() {
    setKsBalanceLoading(true);
    try {
      const res = await fetch("/api/koala/balance");
      const data = await res.json();
      if (data.success) setKsBalance(data.data);
      else toast("error", data.error || "Gagal cek saldo");
    } catch {
      toast("error", "Gagal cek saldo KoalaStore");
    }
    setKsBalanceLoading(false);
  }

  async function handleKsSync() {
    setKsSyncing(true);
    setKsSyncResult("");
    try {
      const res = await fetch("/api/koala/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setKsSyncResult(`Sync selesai: ${data.added} ditambah, ${data.updated} diupdate, ${data.total} total produk KS`);
        fetchKsProducts();
      } else {
        setKsSyncResult(`Error: ${data.error}`);
      }
    } catch {
      setKsSyncResult("Gagal sync produk");
    }
    setKsSyncing(false);
  }

  async function fetchKsProducts() {
    const res = await fetch("/api/products");
    const products = await res.json();
    const ksProds = products.filter((p: { source?: string }) => p.source === "koalastore");
    setKsProducts(ksProds);
    const profitMap: Record<string, number> = {};
    for (const p of ksProds) profitMap[p.productId] = p.profit || 0;
    setKsProfits(profitMap);
  }

  async function handleKsBulkProfit() {
    setKsProfitSaving(true);
    try {
      const res = await fetch("/api/koala/bulk-profit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profits: ksProfits }),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        fetchKsProducts();
      } else {
        toast("error", data.error || "Gagal update profit");
      }
    } catch {
      toast("error", "Gagal update profit");
    }
    setKsProfitSaving(false);
  }

  // Bot handlers
  async function fetchBotStatus() {
    try {
      const res = await fetch("/api/bot/status");
      const data = await res.json();
      setBotActive(data.active);
      setBotUsername(data.username || "");
    } catch {}
  }

  async function handleBotRestart() {
    setBotRestarting(true);
    try {
      const res = await fetch("/api/bot/restart", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        toast("error", data.error || "Gagal restart bot");
      }
    } catch {
      toast("error", "Gagal restart bot");
    }
    setBotRestarting(false);
    fetchBotStatus();
  }

  // QRIS handlers
  async function fetchQrisStatus() {
    try {
      const res = await fetch("/api/qris");
      const data = await res.json();
      setQrisUrl(data.url || null);
    } catch {}
  }

  async function handleQrisUpload(file: File) {
    setQrisUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/qris", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setQrisUrl(data.url);
      } else {
        toast("error", data.error || "Gagal upload QRIS");
      }
    } catch {
      toast("error", "Gagal upload QRIS");
    }
    setQrisUploading(false);
  }

  async function handleQrisDelete() {
    if (!confirm("Hapus gambar QRIS?")) return;
    await fetch("/api/qris", { method: "DELETE" });
    setQrisUrl(null);
  }

  // Password handler
  async function handleChangePassword() {
    setPwMsg(null);
    if (newPw !== confirmPw) {
      setPwMsg({ type: "error", text: "Konfirmasi password tidak cocok" });
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (data.success) {
        setPwMsg({ type: "success", text: "Password berhasil diubah" });
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      } else {
        setPwMsg({ type: "error", text: data.error || "Gagal ubah password" });
      }
    } catch {
      setPwMsg({ type: "error", text: "Gagal ubah password" });
    }
    setPwSaving(false);
  }

  // Master Admin handlers
  async function fetchMasters() {
    try {
      const res = await fetch("/api/masters");
      const data = await res.json();
      setMasters(data);
    } catch {}
  }

  async function handleAddMaster() {
    if (!newMasterId.trim()) return;
    setMasterAdding(true);
    try {
      const res = await fetch("/api/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newMasterId.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setNewMasterId("");
        fetchMasters();
      } else {
        toast("error", data.error || "Gagal tambah admin");
      }
    } catch {
      toast("error", "Gagal tambah admin");
    }
    setMasterAdding(false);
  }

  async function handleDeleteMaster(id: string) {
    if (!confirm(`Hapus admin ${id}?`)) return;
    await fetch(`/api/masters/${id}`, { method: "DELETE" });
    fetchMasters();
  }

  function formatRupiah(n: number) {
    return "Rp " + n.toLocaleString("id-ID");
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center animate-[fade-in_0.15s_ease-out]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />

      {/* Modal */}
      <div className="anim-card-enter relative z-10 mx-4 my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-xl border border-[#333] bg-[#1a1a2e] shadow-2xl md:my-8 md:max-h-[calc(100vh-4rem)]">
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#333] px-6 py-4">
          <div className="flex items-center gap-3">
            <i className="fas fa-gear anim-spin-slow text-primary" />
            <h2 className="text-lg font-bold text-white">System Settings</h2>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-success">
                <i className="fas fa-check-circle" />
                Tersimpan!
              </span>
            )}
            <button
              onClick={close}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <i className="fas fa-xmark text-lg" />
            </button>
          </div>
        </div>

        {/* Modal Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center gap-3 py-10 text-muted justify-center">
              <i className="fas fa-spinner fa-spin" />
              Memuat settings...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Bot Control */}
              <Section icon="fa-robot" iconColor="text-blue-400" title="Telegram Bot">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full ${
                        botActive
                          ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                          : "bg-red-400"
                      }`}
                    />
                    <div>
                      <span className={`text-sm font-medium ${botActive ? "text-emerald-400" : "text-red-400"}`}>
                        {botActive ? "Active" : "Offline"}
                      </span>
                      {botUsername && (
                        <span className="ml-2 text-xs text-muted">@{botUsername}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={fetchBotStatus} className="neo-btn-secondary text-xs flex-1 sm:flex-none justify-center">
                      <i className="fas fa-rotate-right mr-1" />
                      Refresh
                    </button>
                    <button
                      onClick={handleBotRestart}
                      disabled={botRestarting}
                      className="neo-btn-primary text-xs flex-1 sm:flex-none justify-center"
                    >
                      {botRestarting ? (
                        <i className="fas fa-spinner fa-spin mr-1.5" />
                      ) : (
                        <i className="fas fa-power-off mr-1.5" />
                      )}
                      Restart Bot
                    </button>
                  </div>
                </div>
                <div className="mt-4 border-t border-[#555] pt-4">
                  <label className="mb-1.5 block text-xs font-semibold text-muted">BOT TOKEN</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={tokenBot}
                      onChange={(e) => setTokenBot(e.target.value)}
                      placeholder={config.telegram_bot_token_masked || "Masukkan bot token"}
                      className="neo-input flex-1"
                    />
                    <button
                      onClick={async () => {
                        if (!tokenBot) return;
                        setTokenSaving(true);
                        await fetch("/api/settings", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ telegram_bot_token: tokenBot }),
                        });
                        await fetchConfig();
                        setTokenBot("");
                        setTokenSaving(false);
                        setSaved(true);
                        setTimeout(() => setSaved(false), 2000);
                      }}
                      disabled={tokenSaving || !tokenBot}
                      className="neo-btn-primary text-xs shrink-0"
                    >
                      {tokenSaving ? <i className="fas fa-spinner fa-spin mr-1" /> : <i className="fas fa-save mr-1" />}
                      Simpan
                    </button>
                  </div>
                  {config.telegram_bot_token_masked && (
                    <p className="mt-1 text-xs text-muted">Tersimpan: {config.telegram_bot_token_masked}</p>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    <i className="fas fa-info-circle mr-1 text-blue-400" />
                    Setelah mengubah token, restart bot agar perubahan berlaku.
                  </p>
                </div>
              </Section>

              {/* Store Info */}
              <Section icon="fa-store" iconColor="text-primary" title="Informasi Toko">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Nama Toko"
                    value={config.store_name}
                    onChange={(v) => setConfig({ ...config, store_name: v })}
                  />
                  <Field
                    label="Kontak Admin (Telegram username)"
                    value={config.admin_contact_telegram}
                    onChange={(v) => setConfig({ ...config, admin_contact_telegram: v })}
                    placeholder="username (tanpa @)"
                  />
                </div>
                <Field
                  label="Jam Operasi"
                  value={config.operating_hours}
                  onChange={(v) => setConfig({ ...config, operating_hours: v })}
                  placeholder="08.00 - 22.00 WIB"
                />
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() =>
                      handleSave({
                        store_name: config.store_name,
                        admin_contact_telegram: config.admin_contact_telegram,
                        operating_hours: config.operating_hours,
                      })
                    }
                    disabled={saving}
                    className="neo-btn-primary text-sm"
                  >
                    {saving ? <i className="fas fa-spinner fa-spin mr-1.5" /> : <i className="fas fa-save mr-1.5" />}
                    Simpan
                  </button>
                </div>
              </Section>

              {/* Gatekeeper */}
              <Section icon="fa-shield-halved" iconColor="text-blue-400" title="Gatekeeper">
                <p className="mb-4 text-sm text-muted">
                  Wajibkan user join channel/group sebelum bisa menggunakan bot.
                </p>

                <div className="mb-5 flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.gatekeeper.enabled}
                    onClick={() =>
                      setConfig({
                        ...config,
                        gatekeeper: {
                          ...config.gatekeeper,
                          enabled: !config.gatekeeper.enabled,
                        },
                      })
                    }
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors ${
                      config.gatekeeper.enabled
                        ? "border-primary bg-primary"
                        : "border-[#555] bg-[#333]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                        config.gatekeeper.enabled ? "translate-x-[22px]" : "translate-x-[3px]"
                      }`}
                    />
                  </button>
                  <span className={`text-sm font-medium ${config.gatekeeper.enabled ? "text-primary" : "text-muted"}`}>
                    {config.gatekeeper.enabled ? "Aktif" : "Nonaktif"}
                  </span>
                </div>

                {config.gatekeeper.enabled && (
                  <div className="space-y-4 rounded-lg border-2 border-[#555] bg-white/5 p-4">
                    <h3 className="text-sm font-bold text-white">
                      <i className="fas fa-bullhorn mr-1.5 text-primary" />
                      Channel
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Channel ID"
                        value={config.gatekeeper.channel.id}
                        onChange={(v) =>
                          setConfig({
                            ...config,
                            gatekeeper: {
                              ...config.gatekeeper,
                              channel: { ...config.gatekeeper.channel, id: v },
                            },
                          })
                        }
                        placeholder="@channelname atau -100xxx"
                      />
                      <Field
                        label="Channel Link"
                        value={config.gatekeeper.channel.link}
                        onChange={(v) =>
                          setConfig({
                            ...config,
                            gatekeeper: {
                              ...config.gatekeeper,
                              channel: { ...config.gatekeeper.channel, link: v },
                            },
                          })
                        }
                        placeholder="https://t.me/channelname"
                      />
                    </div>

                    <h3 className="mt-2 text-sm font-bold text-white">
                      <i className="fas fa-users mr-1.5 text-purple-400" />
                      Group (Opsional)
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Group ID"
                        value={config.gatekeeper.group.id}
                        onChange={(v) =>
                          setConfig({
                            ...config,
                            gatekeeper: {
                              ...config.gatekeeper,
                              group: { ...config.gatekeeper.group, id: v },
                            },
                          })
                        }
                        placeholder="@groupname atau -100xxx"
                      />
                      <Field
                        label="Group Link"
                        value={config.gatekeeper.group.link}
                        onChange={(v) =>
                          setConfig({
                            ...config,
                            gatekeeper: {
                              ...config.gatekeeper,
                              group: { ...config.gatekeeper.group, link: v },
                            },
                          })
                        }
                        placeholder="https://t.me/groupname"
                      />
                    </div>
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => handleSave({ gatekeeper: config.gatekeeper })}
                    disabled={saving}
                    className="neo-btn-primary text-sm"
                  >
                    {saving ? <i className="fas fa-spinner fa-spin mr-1.5" /> : <i className="fas fa-save mr-1.5" />}
                    Simpan Gatekeeper
                  </button>
                </div>
              </Section>

              {/* Payment Method */}
              <Section icon="fa-credit-card" iconColor="text-cyan-400" title="Metode Pembayaran">
                <p className="mb-4 text-sm text-muted">
                  Pilih satu metode pembayaran yang digunakan saat pembelian via bot.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["saweria", "Saweria (QRIS Otomatis)", "fa-bolt", "Pembayaran otomatis via Saweria."],
                    ["qris", "QRIS Statis (Manual)", "fa-qrcode", "Upload gambar QRIS, admin konfirmasi manual dari dashboard."],
                  ] as const).map(([value, label, icon, desc]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setConfig({ ...config, payment_method: value })}
                      className={`rounded-lg border-2 p-4 text-left transition-colors ${
                        config.payment_method === value
                          ? "border-primary bg-primary/10"
                          : "border-[#555] bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <i className={`fas ${icon} ${config.payment_method === value ? "text-primary" : "text-muted"}`} />
                        <span className={`text-sm font-bold ${config.payment_method === value ? "text-primary" : "text-white"}`}>
                          {label}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted">{desc}</p>
                    </button>
                  ))}
                </div>
                {config.payment_method === "saweria" && (
                  <div className="mt-4 border-t border-[#555] pt-4">
                    <label className="mb-1.5 block text-xs font-semibold text-muted">SAWERIA TOKEN</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={tokenSaweria}
                        onChange={(e) => setTokenSaweria(e.target.value)}
                        placeholder={config.saweria_token_masked || "Masukkan Saweria token"}
                        className="neo-input flex-1"
                      />
                      <button
                        onClick={async () => {
                          if (!tokenSaweria) return;
                          setTokenSaving(true);
                          await fetch("/api/settings", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ saweria_token: tokenSaweria }),
                          });
                          await fetchConfig();
                          setTokenSaweria("");
                          setTokenSaving(false);
                          setSaved(true);
                          setTimeout(() => setSaved(false), 2000);
                        }}
                        disabled={tokenSaving || !tokenSaweria}
                        className="neo-btn-primary text-xs shrink-0"
                      >
                        {tokenSaving ? <i className="fas fa-spinner fa-spin mr-1" /> : <i className="fas fa-save mr-1" />}
                        Simpan
                      </button>
                    </div>
                    {config.saweria_token_masked && (
                      <p className="mt-1 text-xs text-muted">Tersimpan: {config.saweria_token_masked}</p>
                    )}
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => handleSave({ payment_method: config.payment_method })}
                    disabled={saving}
                    className="neo-btn-primary text-sm"
                  >
                    {saving ? <i className="fas fa-spinner fa-spin mr-1.5" /> : <i className="fas fa-save mr-1.5" />}
                    Simpan Pembayaran
                  </button>
                </div>
              </Section>

              {/* KoalaStore */}
              <Section icon="fa-store" iconColor="text-purple-400" title="KoalaStore">
                <p className="mb-4 text-sm text-muted">
                  Integrasi reselling produk dari KoalaStore.
                </p>

                {/* API Key */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-semibold text-muted">API KEY</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={tokenKs}
                      onChange={(e) => setTokenKs(e.target.value)}
                      placeholder={config.koalastore_api_key_masked || "Masukkan KoalaStore API Key"}
                      className="neo-input flex-1"
                    />
                    <button
                      onClick={async () => {
                        if (!tokenKs) return;
                        setTokenSaving(true);
                        await fetch("/api/settings", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ koalastore_api_key: tokenKs }),
                        });
                        await fetchConfig();
                        setTokenKs("");
                        setTokenSaving(false);
                        setSaved(true);
                        setTimeout(() => setSaved(false), 2000);
                      }}
                      disabled={tokenSaving || !tokenKs}
                      className="neo-btn-primary text-xs shrink-0"
                    >
                      {tokenSaving ? <i className="fas fa-spinner fa-spin mr-1" /> : <i className="fas fa-save mr-1" />}
                      Simpan
                    </button>
                  </div>
                  {config.koalastore_api_key_masked && (
                    <p className="mt-1 text-xs text-muted">Tersimpan: {config.koalastore_api_key_masked}</p>
                  )}
                </div>

                {/* Enable/Disable Toggle */}
                <div className="mb-5 flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.koalastore?.is_active}
                    onClick={() =>
                      setConfig({
                        ...config,
                        koalastore: { ...config.koalastore, is_active: !config.koalastore?.is_active },
                      })
                    }
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors ${
                      config.koalastore?.is_active
                        ? "border-primary bg-primary"
                        : "border-[#555] bg-[#333]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                        config.koalastore?.is_active ? "translate-x-[22px]" : "translate-x-[3px]"
                      }`}
                    />
                  </button>
                  <span className={`text-sm font-medium ${config.koalastore?.is_active ? "text-primary" : "text-muted"}`}>
                    {config.koalastore?.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                  <button
                    onClick={() => handleSave({ koalastore: config.koalastore } as Partial<Config>)}
                    disabled={saving}
                    className="neo-btn-secondary text-xs ml-auto"
                  >
                    <i className="fas fa-save mr-1" />
                    Simpan
                  </button>
                </div>

                {config.koalastore?.is_active && (
                  <div className="space-y-5">
                    {/* Balance */}
                    <div className="rounded-lg border-2 border-[#555] bg-white/5 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">
                          <i className="fas fa-wallet mr-1.5 text-emerald-400" />
                          Saldo KoalaStore
                        </h3>
                        <button
                          onClick={fetchKsBalance}
                          disabled={ksBalanceLoading}
                          className="neo-btn-secondary text-xs"
                        >
                          {ksBalanceLoading ? (
                            <i className="fas fa-spinner fa-spin mr-1" />
                          ) : (
                            <i className="fas fa-rotate-right mr-1" />
                          )}
                          Cek Saldo
                        </button>
                      </div>
                      {ksBalance && (
                        <div className="mt-3 text-2xl font-bold text-emerald-400">
                          {ksBalance.formatted_balance}
                        </div>
                      )}
                    </div>

                    {/* Sync Products */}
                    <div className="rounded-lg border-2 border-[#555] bg-white/5 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">
                          <i className="fas fa-sync mr-1.5 text-blue-400" />
                          Sync Produk
                        </h3>
                        <button
                          onClick={handleKsSync}
                          disabled={ksSyncing}
                          className="neo-btn-primary text-xs"
                        >
                          {ksSyncing ? (
                            <i className="fas fa-spinner fa-spin mr-1.5" />
                          ) : (
                            <i className="fas fa-download mr-1.5" />
                          )}
                          Sync dari KoalaStore
                        </button>
                      </div>
                      {ksSyncResult && (
                        <p className={`mt-2 text-sm ${ksSyncResult.startsWith("Error") ? "text-danger" : "text-success"}`}>
                          {ksSyncResult}
                        </p>
                      )}
                    </div>

                    {/* Bulk Profit Management */}
                    {ksProducts.length > 0 && (
                      <div className="rounded-lg border-2 border-[#555] bg-white/5 p-4">
                        <h3 className="mb-3 text-sm font-bold text-white">
                          <i className="fas fa-coins mr-1.5 text-primary" />
                          Profit per Produk KoalaStore ({ksProducts.length} produk)
                        </h3>
                        <div className="max-h-80 space-y-2 overflow-y-auto">
                          {ksProducts.map((p) => (
                            <div
                              key={p.productId}
                              className="flex items-center gap-3 rounded bg-[#1a1a1a] px-3 py-2"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="truncate text-xs font-medium text-white">
                                  {p.productName}
                                </div>
                                <div className="text-[10px] text-muted">
                                  Base: {formatRupiah(p.ks_base_price || 0)} | Jual: {formatRupiah(p.priceProduct)}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted">Profit:</span>
                                <input
                                  type="number"
                                  value={ksProfits[p.productId] || 0}
                                  onChange={(e) =>
                                    setKsProfits({
                                      ...ksProfits,
                                      [p.productId]: Number(e.target.value) || 0,
                                    })
                                  }
                                  className="neo-input w-24 text-right text-xs"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={handleKsBulkProfit}
                            disabled={ksProfitSaving}
                            className="neo-btn-primary text-xs"
                          >
                            {ksProfitSaving ? (
                              <i className="fas fa-spinner fa-spin mr-1.5" />
                            ) : (
                              <i className="fas fa-save mr-1.5" />
                            )}
                            Simpan Semua Profit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {/* Master Admin */}
              <Section icon="fa-user-shield" iconColor="text-red-400" title="Admin Master">
                <p className="mb-4 text-sm text-muted">
                  Daftar Telegram User ID yang memiliki akses admin. Admin bisa menerima notifikasi dan melakukan operasi khusus.
                </p>

                {/* Add new */}
                <div className="mb-4 flex gap-2">
                  <input
                    type="text"
                    value={newMasterId}
                    onChange={(e) => setNewMasterId(e.target.value)}
                    placeholder="Telegram User ID (angka)"
                    className="neo-input flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleAddMaster()}
                  />
                  <button
                    onClick={handleAddMaster}
                    disabled={masterAdding || !newMasterId.trim()}
                    className="neo-btn-primary text-sm"
                  >
                    {masterAdding ? (
                      <i className="fas fa-spinner fa-spin mr-1.5" />
                    ) : (
                      <i className="fas fa-plus mr-1.5" />
                    )}
                    Tambah
                  </button>
                </div>

                {/* List */}
                {masters.length === 0 ? (
                  <p className="text-sm text-muted italic">Belum ada master admin.</p>
                ) : (
                  <div className="space-y-2">
                    {masters.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-lg border-2 border-[#555] bg-white/5 px-4 py-3"
                      >
                        <div>
                          <span className="text-sm font-medium text-white">{m.id}</span>
                          <span className="ml-3 text-xs text-muted">
                            Ditambah: {new Date(m.addedAt).toLocaleDateString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteMaster(m.id)}
                          className="text-sm text-danger/70 transition-colors hover:text-danger"
                        >
                          <i className="fas fa-trash" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Notifications */}
              <Section icon="fa-bell" iconColor="text-yellow-400" title="Notifikasi Order">
                <p className="mb-4 text-sm text-muted">
                  Pilih event yang ingin dikirim notifikasinya ke admin.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["new", "Order Baru"],
                      ["paid", "Pembayaran Diterima"],
                      ["expired", "Transaksi Expired"],
                      ["cancelled", "Transaksi Dibatalkan"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-[#555] bg-white/5 px-4 py-3 transition-colors hover:bg-white/10"
                    >
                      <input
                        type="checkbox"
                        checked={config.order_notifications[key]}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            order_notifications: {
                              ...config.order_notifications,
                              [key]: e.target.checked,
                            },
                          })
                        }
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-sm text-white">{label}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() =>
                      handleSave({ order_notifications: config.order_notifications })
                    }
                    disabled={saving}
                    className="neo-btn-primary text-sm"
                  >
                    {saving ? <i className="fas fa-spinner fa-spin mr-1.5" /> : <i className="fas fa-save mr-1.5" />}
                    Simpan Notifikasi
                  </button>
                </div>
              </Section>

              {/* QRIS Image */}
              <Section icon="fa-qrcode" iconColor="text-cyan-400" title="QRIS Statis">
                <p className="mb-4 text-sm text-muted">
                  Upload gambar QRIS untuk pembayaran manual. Format: JPG/PNG, maks 5MB.
                </p>

                {qrisUrl && (
                  <div className="mb-4 flex flex-col items-center gap-3">
                    <div className="overflow-hidden rounded-lg border-2 border-[#555] bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrisUrl}
                        alt="QRIS"
                        className="max-h-64 w-auto"
                      />
                    </div>
                    <button
                      onClick={handleQrisDelete}
                      className="neo-btn-danger text-xs"
                    >
                      <i className="fas fa-trash mr-1.5" />
                      Hapus Gambar
                    </button>
                  </div>
                )}

                <input
                  ref={qrisInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleQrisUpload(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => qrisInputRef.current?.click()}
                  disabled={qrisUploading}
                  className="neo-btn-primary text-sm"
                >
                  {qrisUploading ? (
                    <i className="fas fa-spinner fa-spin mr-1.5" />
                  ) : (
                    <i className="fas fa-upload mr-1.5" />
                  )}
                  {qrisUrl ? "Ganti Gambar" : "Upload QRIS"}
                </button>
              </Section>

              {/* Change Password */}
              <Section icon="fa-lock" iconColor="text-orange-400" title="Ganti Password Dashboard">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted">PASSWORD LAMA</label>
                    <input
                      type="password"
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      className="neo-input w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted">PASSWORD BARU</label>
                    <input
                      type="password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      className="neo-input w-full"
                      placeholder="Minimal 6 karakter"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted">KONFIRMASI PASSWORD</label>
                    <input
                      type="password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      className="neo-input w-full"
                    />
                  </div>
                </div>
                {pwMsg && (
                  <p className={`mt-3 text-sm ${pwMsg.type === "success" ? "text-success" : "text-danger"}`}>
                    <i className={`fas ${pwMsg.type === "success" ? "fa-check-circle" : "fa-exclamation-circle"} mr-1.5`} />
                    {pwMsg.text}
                  </p>
                )}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleChangePassword}
                    disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                    className="neo-btn-primary text-sm"
                  >
                    {pwSaving ? <i className="fas fa-spinner fa-spin mr-1.5" /> : <i className="fas fa-key mr-1.5" />}
                    Ubah Password
                  </button>
                </div>
              </Section>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex shrink-0 items-center justify-end border-t border-[#333] px-6 py-4">
          <button
            onClick={close}
            className="neo-btn-secondary text-sm"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reusable Components ──

const SETTINGS_ICON_ANIM: Record<string, string> = {
  "fa-robot": "anim-bounce",
  "fa-store": "anim-rock",
  "fa-shield-halved": "anim-pulse",
  "fa-credit-card": "anim-float",
  "fa-user-shield": "anim-jiggle",
  "fa-bell": "anim-ring",
  "fa-qrcode": "anim-tick",
  "fa-lock": "anim-jiggle",
};

function Section({
  icon,
  iconColor,
  title,
  children,
}: {
  icon: string;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#333] bg-white/5 p-4">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-white">
        <i className={`fas ${icon} ${iconColor} ${SETTINGS_ICON_ANIM[icon] || ""}`} />
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-muted">
        {label.toUpperCase()}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="neo-input w-full"
      />
    </div>
  );
}
