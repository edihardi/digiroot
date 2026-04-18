"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastContextValue {
  toast: (type: Toast["type"], message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: Toast["type"], message: string) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-slide-up flex items-center gap-2.5 rounded-lg border-2 px-4 py-3 text-sm font-medium shadow-lg ${
              t.type === "success"
                ? "border-emerald-700 bg-emerald-950 text-emerald-300"
                : t.type === "error"
                  ? "border-red-700 bg-red-950 text-red-300"
                  : "border-blue-700 bg-blue-950 text-blue-300"
            }`}
          >
            <i
              className={`fas ${
                t.type === "success"
                  ? "fa-check-circle"
                  : t.type === "error"
                    ? "fa-exclamation-circle"
                    : "fa-info-circle"
              }`}
            />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
