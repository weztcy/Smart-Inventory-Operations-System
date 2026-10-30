"use client";

// Notifikasi toast sederhana + provider global.
import {
  createContext, useCallback, useContext, useMemo, useState,
  type ReactNode,
} from "react";
import clsx from "clsx";

type Toast = { id: number; message: string; kind: "success" | "error" | "info" };

const ToastContext = createContext<{
  push: (message: string, kind?: Toast["kind"]) => void;
}>({ push: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-100 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "pointer-events-auto rounded-lg px-4 py-3 text-sm shadow-lg ring-1",
              t.kind === "success" && "bg-emerald-600 text-white ring-emerald-700",
              t.kind === "error" && "bg-red-600 text-white ring-red-700",
              t.kind === "info" && "bg-slate-800 text-white ring-slate-900",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
