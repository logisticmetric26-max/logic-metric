"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Navegación secundaria dentro de una sección (§16).
 *
 * Son enlaces reales, no estado local: cada subsección tiene su URL, por lo que
 * se puede compartir, marcar como favorita y recargar sin perder el contexto.
 *
 * En móvil el grupo se desplaza horizontalmente dentro de su contenedor, sin
 * provocar scroll horizontal en la página.
 */

export interface TabItem {
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  /** Coincidencia exacta: útil para la pestaña índice de la sección. */
  exact?: boolean;
}

export function Tabs({ items, className }: { items: TabItem[]; className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn("border-b border-border", className)} aria-label="Secciones">
      <div className="scroll-area -mb-px flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap",
                "transition-all duration-200 ease-[var(--ease-standard)]",
                active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-ink-muted hover:border-black/15 hover:text-ink",
              )}
            >
              {item.icon}
              {item.label}
              {item.badge}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
