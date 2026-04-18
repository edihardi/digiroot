"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSettingsModal } from "./SettingsModalContext";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "fa-chart-pie" },
  { href: "/dashboard/products", label: "Produk", icon: "fa-box" },
  { href: "/dashboard/transactions", label: "Transaksi", icon: "fa-receipt" },
  { href: "/dashboard/broadcast", label: "Broadcast", icon: "fa-bullhorn" },
  { href: "/dashboard/logs", label: "Logs", icon: "fa-terminal" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { open: openSettings } = useSettingsModal();
  const [botActive, setBotActive] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/bot/status");
        const data = await res.json();
        setBotActive(data.active);
      } catch {}
    }
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="mb-10">
        <h2 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight">
          <i className="fas fa-store anim-rock text-primary" />
          <span>
            <span className="text-primary">Digi</span>root
          </span>
        </h2>
      </div>

      {/* Nav */}
      <nav className="flex-1">
        {navItems.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mb-2 flex items-center gap-3 rounded-lg px-4 py-3.5 text-sm font-medium transition-all ${
                active
                  ? "bg-primary font-bold text-black shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                  : "text-[#94a3b8] hover:bg-white/5 hover:text-white"
              }`}
            >
              <i className={`fas ${item.icon} w-5 text-center`} />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={openSettings}
          className="mb-2 flex w-full items-center gap-3 rounded-lg px-4 py-3.5 text-sm font-medium text-[#94a3b8] transition-all hover:bg-white/5 hover:text-white"
        >
          <i className="fas fa-gear anim-spin-slow w-5 text-center" />
          Settings
        </button>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 pt-5">
        <div className="mb-4 flex items-center gap-2 text-xs text-[#94a3b8]">
          <span
            className={`h-2 w-2 rounded-full ${
              botActive
                ? "anim-pulse bg-success shadow-[0_0_0_2px_rgba(16,185,129,0.2)]"
                : "bg-danger shadow-[0_0_0_2px_rgba(239,68,68,0.2)]"
            }`}
          />
          Bot {botActive ? "Active" : "Offline"}
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-danger/80 transition-all hover:bg-danger/10 hover:text-danger"
        >
          <i className="fas fa-right-from-bracket w-5 text-center" />
          Logout
        </button>
        <p className="mt-4 text-center text-[10px] text-[#94a3b8]/50">
          Made with ❤️ by ediology
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Font Awesome CDN */}
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"
      />

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between bg-sidebar px-4 md:hidden">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
          <i className="fas fa-store text-primary" />
          <span><span className="text-primary">Digi</span>root</span>
        </h2>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10"
        >
          <i className={`fas ${mobileOpen ? "fa-xmark" : "fa-bars"} text-lg`} />
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop: static, mobile: slide-in overlay */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-sidebar p-6 text-white transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Spacer for mobile top bar */}
      <div className="h-14 shrink-0 md:hidden" />
    </>
  );
}
