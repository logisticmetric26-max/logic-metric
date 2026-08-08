"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mensajes de éxito y error (§5, §63).
 *
 * Se anuncian en una región `aria-live` para que un lector de pantalla los
 * comunique sin robar el foco.
 */

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return context;
}

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="size-4 shrink-0 text-success-600" aria-hidden />,
  error: <AlertTriangle className="size-4 shrink-0 text-danger-600" aria-hidden />,
  info: <Info className="size-4 shrink-0 text-info-600" aria-hidden />,
};

const TONES: Record<ToastTone, string> = {
  success: "border-success-200 bg-success-50/85 text-success-700",
  error: "border-danger-200 bg-danger-50/85 text-danger-700",
  info: "border-info-200 bg-info-50/85 text-info-700",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, tone, message }]);
      // Los errores permanecen más tiempo: suelen requerir una acción
      window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message: string) => push("success", message),
      error: (message: string) => push("error", message),
      info: (message: string) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "glass-strong animate-slide-up pointer-events-auto flex w-full max-w-sm items-start gap-2.5",
              "rounded-xl border px-3.5 py-3 text-[13px] shadow-[var(--shadow-overlay)]",
              TONES[toast.tone],
            )}
          >
            {ICONS[toast.tone]}
            <p className="min-w-0 flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Descartar"
              className="-m-1 shrink-0 rounded p-1 opacity-60 hover:opacity-100"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
