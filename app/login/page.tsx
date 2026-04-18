"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Login gagal");
      }
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="anim-fade-in-up mb-8 text-center">
          <div className="mb-3">
            <i className="fas fa-store anim-rock text-4xl text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold">
            <span className="text-primary">Digi</span>
            <span className="text-white">root</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Admin Dashboard</p>
        </div>

        {/* Card - Neo Brutalist */}
        <form
          onSubmit={handleSubmit}
          className="anim-card-enter rounded-lg border-2 border-[#555] bg-card p-8"
          style={{ boxShadow: "4px 4px 0px 0px #555", animationDelay: "150ms" }}
        >
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-semibold text-muted"
          >
            <i className="fas fa-lock anim-jiggle mr-1.5 text-primary" />
            PASSWORD
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan password"
            className="mb-5 w-full rounded-lg border-2 border-[#555] bg-input px-4 py-3 text-white placeholder-[#666] outline-none transition-colors focus:border-primary"
            autoFocus
            required
          />

          {error && (
            <div
              className="mb-5 rounded-lg border-2 border-danger bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger"
              style={{ boxShadow: "2px 2px 0px 0px #555" }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg border-2 border-black bg-primary px-4 py-3 text-sm font-bold text-black transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            style={{ boxShadow: "4px 4px 0px 0px #000" }}
          >
            {loading ? "Loading..." : "MASUK"}
          </button>
        </form>
      </div>
    </div>
  );
}
