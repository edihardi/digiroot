"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface LogData {
  dates: string[];
  lines: string[];
  currentDate: string;
}

const DIR_COLORS: Record<string, string> = {
  IN: "text-blue-400",
  OUT: "text-emerald-400",
  EVENT: "text-yellow-400",
};

function parseDirection(line: string): string {
  const match = line.match(/\[TG\] \[(IN|OUT|EVENT)\]/);
  return match ? match[1] : "";
}

export default function LogsPage() {
  const [data, setData] = useState<LogData>({ dates: [], lines: [], currentDate: "" });
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async (date?: string) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    params.set("lines", "300");
    const res = await fetch(`/api/logs?${params}`);
    const json: LogData = await res.json();
    setData(json);
    if (!date && json.currentDate) setSelectedDate(json.currentDate);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(() => fetchLogs(selectedDate || undefined), 5000);
    return () => clearInterval(interval);
  }, [fetchLogs, selectedDate]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [data.lines, autoScroll]);

  function handleDateChange(date: string) {
    setSelectedDate(date);
    setLoading(true);
    fetchLogs(date);
  }

  if (loading && data.lines.length === 0) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <i className="fas fa-spinner fa-spin" />
        Memuat logs...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="anim-fade-in-up mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            <i className="fas fa-terminal anim-pulse mr-2 text-primary" />
            Chat Logs
          </h1>
          <p className="mt-1 text-sm text-muted">
            Log interaksi bot Telegram
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="neo-input text-sm"
          >
            {data.dates.length === 0 && <option value="">Tidak ada log</option>}
            {data.dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Auto-scroll
          </label>
          <button
            onClick={() => fetchLogs(selectedDate || undefined)}
            className="neo-btn-secondary text-sm"
          >
            <i className="fas fa-rotate-right mr-1.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="anim-fade-in-up mb-3 flex gap-4 text-xs" style={{ animationDelay: "100ms" }}>
        <span className="flex items-center gap-1.5">
          <span className="anim-pulse h-2 w-2 rounded-full bg-blue-400" />
          <span className="text-muted">IN (user)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="anim-pulse h-2 w-2 rounded-full bg-emerald-400" style={{ animationDelay: "0.5s" }} />
          <span className="text-muted">OUT (bot)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="anim-pulse h-2 w-2 rounded-full bg-yellow-400" style={{ animationDelay: "1s" }} />
          <span className="text-muted">EVENT</span>
        </span>
      </div>

      {/* Log viewer */}
      <div
        ref={logRef}
        className="neo-card anim-fade-in-up flex-1 overflow-y-auto font-mono text-xs leading-relaxed"
        style={{ animationDelay: "200ms" }}
        style={{ maxHeight: "calc(100vh - 260px)" }}
      >
        {data.lines.length === 0 ? (
          <p className="text-center text-muted">Tidak ada log untuk tanggal ini.</p>
        ) : (
          data.lines.map((line, i) => {
            const dir = parseDirection(line);
            const colorClass = DIR_COLORS[dir] || "text-muted";

            return (
              <div
                key={i}
                className={`border-b border-[#222] px-2 py-1 hover:bg-white/5 ${colorClass}`}
              >
                {line}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="mt-2 text-right text-xs text-muted">
        {data.lines.length} baris &middot; refresh otomatis 5 detik
      </div>
    </div>
  );
}
