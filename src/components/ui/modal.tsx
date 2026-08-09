"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Modal responsive (§4).
 *
 * En escritorio es un diálogo centrado; en móvil sube desde abajo como bottom
 * sheet, con el contenido desplazable dentro del propio panel para que nunca
 * desborde la pantalla.
 */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Impide cerrar mientras hay una operación en curso. */
  busy?: boolean;
}

const SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  busy = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }

    document.addEventListener("keydown", onKeyDown);

    // Bloquea el scroll de fondo mientras el modal está abierto
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // El foco entra al panel para que teclado y lector de pantalla lo sigan
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, busy]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="animate-fade-in absolute inset-0 bg-scrim backdrop-blur-[3px]"
        onClick={busy ? undefined : onClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "glass-strong animate-slide-up relative flex max-h-[92dvh] w-full flex-col",
          "rounded-t-[20px] border border-border shadow-[var(--shadow-overlay)] outline-none",
          "sm:max-h-[85dvh] sm:rounded-lg",
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2
              id="modal-title"
              className="text-[17px] font-semibold tracking-[-0.02em] text-ink"
            >
              {title}
            </h2>
            {description && <p className="mt-1 text-[13px] text-ink-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="-m-1 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-fill hover:text-ink disabled:opacity-50"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {children}
        </div>

        {footer && (
          <div className="safe-bottom flex flex-col-reverse gap-2 border-t border-border bg-surface-subtle px-4 py-3.5 sm:flex-row sm:justify-end sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** §12 · Confirmación explícita para acciones destructivas. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      busy={loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-ink-secondary">{message}</div>
    </Modal>
  );
}

/** Panel lateral para filtros en móvil (§4). */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="animate-fade-in absolute inset-0 bg-scrim backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="glass-strong animate-slide-in-right absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-border shadow-[var(--shadow-overlay)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-m-1 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-fill hover:text-ink"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="scroll-area flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="safe-bottom flex gap-2 border-t border-border px-4 py-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
