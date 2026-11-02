"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

type Toast = { id: number; message: string; tone: "success" | "error" };
const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4000);
  }, []);
  return <ToastContext.Provider value={toast}>
    {children}
    <div aria-live="polite" className="fixed bottom-5 right-5 z-50 flex w-[min(90vw,380px)] flex-col gap-2">
      {toasts.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-sage/20 bg-white px-4 py-3 shadow-lg">
        {item.tone === "success" ? <CheckCircle2 className="text-sage" size={18} /> : <XCircle className="text-rose-700" size={18} />}
        <p className="flex-1 text-sm">{item.message}</p>
        <button aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((toastItem) => toastItem.id !== item.id))}><X size={16} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  return useContext(ToastContext);
}
