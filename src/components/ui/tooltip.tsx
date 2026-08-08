import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tooltip en CSS puro.
 *
 * Sin JavaScript ni dependencias: aparece con `:hover` y con `:focus-visible`,
 * así que también funciona con teclado. En pantallas táctiles no estorba porque
 * el contenido nunca es información imprescindible.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap",
          "rounded-md bg-ink px-2 py-1 text-xs text-white",
          "opacity-0 transition-opacity duration-150",
          "group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100",
          "hidden sm:block",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {label}
      </span>
    </span>
  );
}
