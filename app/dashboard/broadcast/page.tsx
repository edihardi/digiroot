"use client";

import { useState, useRef } from "react";
import { useToast } from "@/components/Toast";

type Phase = "compose" | "confirm" | "sending" | "done";

interface BroadcastResult {
  sent: number;
  failed: number;
  total: number;
}

export default function BroadcastPage() {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("compose");
  const [progress, setProgress] = useState<BroadcastResult>({ sent: 0, failed: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setImage(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
  }

  function removeImage() {
    setImage(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSend() {
    setPhase("sending");
    setProgress({ sent: 0, failed: 0, total: 0 });

    const formData = new FormData();
    formData.append("message", message);
    if (image) formData.append("image", image);

    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        toast("error", err.error || "Gagal mengirim broadcast");
        setPhase("compose");
        return;
      }

      // Read streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        setPhase("compose");
        return;
      }

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === "start") {
              setProgress((p) => ({ ...p, total: data.total }));
            } else if (data.type === "progress" || data.type === "done") {
              setProgress({ sent: data.sent, failed: data.failed, total: data.total });
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      setPhase("done");
    } catch {
      toast("error", "Error saat mengirim broadcast");
      setPhase("compose");
    }
  }

  function handleReset() {
    setMessage("");
    setImage(null);
    setImagePreview(null);
    setPhase("compose");
    setProgress({ sent: 0, failed: 0, total: 0 });
    if (fileRef.current) fileRef.current.value = "";
  }

  const pct = progress.total > 0 ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0;

  return (
    <div>
      {/* Header */}
      <div className="anim-fade-in-up mb-6">
        <h1 className="text-2xl font-bold text-white">
          <i className="fas fa-bullhorn anim-ring mr-2 text-primary" />
          Broadcast
        </h1>
        <p className="mt-1 text-sm text-muted">
          Kirim pesan ke semua user Telegram
        </p>
      </div>

      {/* Compose */}
      {(phase === "compose" || phase === "confirm") && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Editor */}
          <div className="neo-card anim-fade-in-up" style={{ animationDelay: "100ms" }}>
            <h2 className="mb-4 text-base font-bold text-white">
              <i className="fas fa-pen anim-jiggle mr-2 text-primary" />
              Tulis Pesan
            </h2>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tulis pesan broadcast... (Markdown didukung)"
              className="neo-input mb-4 h-48 w-full resize-none"
            />

            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold text-muted">
                GAMBAR (OPSIONAL)
              </label>
              <div className="flex items-center gap-3">
                <label className="neo-btn-secondary cursor-pointer text-sm">
                  <i className="fas fa-image mr-1.5" />
                  {image ? "Ganti Gambar" : "Pilih Gambar"}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
                {image && (
                  <button
                    onClick={removeImage}
                    className="text-sm text-danger hover:underline"
                  >
                    <i className="fas fa-trash mr-1" />
                    Hapus
                  </button>
                )}
              </div>
              {imagePreview && (
                <div className="mt-3">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="max-h-40 rounded border-2 border-[#555]"
                  />
                </div>
              )}
            </div>

            <button
              onClick={() => setPhase("confirm")}
              disabled={!message.trim()}
              className="neo-btn-primary"
            >
              <i className="fas fa-paper-plane mr-2" />
              Kirim Broadcast
            </button>
          </div>

          {/* Preview */}
          <div className="neo-card anim-fade-in-up" style={{ animationDelay: "200ms" }}>
            <h2 className="mb-4 text-base font-bold text-white">
              <i className="fas fa-eye anim-pulse mr-2 text-blue-400" />
              Preview
            </h2>

            {!message.trim() ? (
              <p className="text-sm text-muted">
                Tulis pesan di sebelah kiri untuk melihat preview.
              </p>
            ) : (
              <div className="rounded-lg border-2 border-[#555] bg-[#1a1a1a] p-4">
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Broadcast image"
                    className="mb-3 max-h-48 rounded"
                  />
                )}
                <div className="whitespace-pre-wrap text-sm text-white">
                  {message}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {phase === "confirm" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-[fade-in_0.15s_ease-out]"
          onClick={() => setPhase("compose")}
        >
          <div
            className="neo-card anim-card-enter w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                Kirim Broadcast?
              </h2>
              <button
                onClick={() => setPhase("compose")}
                className="text-muted transition-colors hover:text-white"
              >
                <i className="fas fa-xmark text-lg" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">
              Pesan akan dikirim ke <strong className="text-white">semua user</strong> yang
              terdaftar di bot. Pastikan pesan sudah benar.
            </p>
            {image && (
              <p className="mb-4 text-sm text-muted">
                <i className="fas fa-image mr-1 text-primary" />
                Dengan gambar: {image.name}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPhase("compose")}
                className="neo-btn-secondary"
              >
                Batal
              </button>
              <button onClick={handleSend} className="neo-btn-primary">
                <i className="fas fa-paper-plane mr-1.5" />
                Kirim Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sending Progress */}
      {phase === "sending" && (
        <div className="neo-card anim-card-enter mx-auto max-w-lg text-center">
          <i className="fas fa-paper-plane anim-float mb-4 text-4xl text-primary" />
          <h2 className="mb-2 text-lg font-bold text-white">
            Mengirim Broadcast...
          </h2>
          <p className="mb-5 text-sm text-muted">
            Mengirim ke {progress.sent + progress.failed}/{progress.total} user
          </p>

          {/* Progress bar */}
          <div className="mb-3 h-3 overflow-hidden rounded-full bg-[#2d2d2d]">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted">
            <span>
              <span className="text-success">{progress.sent} berhasil</span>
              {progress.failed > 0 && (
                <span className="ml-2 text-danger">{progress.failed} gagal</span>
              )}
            </span>
            <span>{pct}%</span>
          </div>
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div className="neo-card anim-card-enter mx-auto max-w-lg text-center">
          <i className="fas fa-circle-check anim-bounce mb-4 text-4xl text-success" />
          <h2 className="mb-2 text-lg font-bold text-white">
            Broadcast Selesai!
          </h2>
          <div className="mb-5 flex justify-center gap-6 text-sm">
            <div>
              <div className="text-2xl font-bold text-success">{progress.sent}</div>
              <div className="text-muted">Berhasil</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-danger">{progress.failed}</div>
              <div className="text-muted">Gagal</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{progress.total}</div>
              <div className="text-muted">Total</div>
            </div>
          </div>
          <button onClick={handleReset} className="neo-btn-primary">
            <i className="fas fa-plus mr-1.5" />
            Broadcast Baru
          </button>
        </div>
      )}
    </div>
  );
}
