"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Navegación secundaria dentro de una sección (§16).
 *
 * Son enlaces reales, no estado local: cada subsección tiene su URL, así que se
 * puede compartir, marcar como favorita y recargar sin perder el contexto.
 *
 * Forma de control segmentado sobre cristal, no de pestañas subrayadas: el
 * grupo se lee como UNA pieza con una posición seleccionada, que es lo que es.
 * La pastilla activa es la única superficie sólida del grupo, y ese contraste
 * de material —no sólo de color— hace visible la selección incluso de reojo.
 *
 * En móvil el grupo se desplaza en horizontal dentro de su contenedor, sin
 * provocar scroll horizontal en la página (§4).
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
    <nav className={cn("min-w-0", className)} aria-label="Secciones">
      <div className="scroll-area -mx-1 overflow-x-auto px-1 pb-1">
        <div className="liquid-thin edge relative inline-flex min-w-full gap-1 rounded-xl p-1 shadow-[var(--shadow-flat)] sm:min-w-0">
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
                  "flex shrink-0 items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium whitespace-nowrap",
                  "transition-all duration-200 ease-[var(--ease-standard)]",
                  active
                    ? "bg-surface text-ink shadow-[var(--shadow-card)] ring-1 ring-border"
                    : "text-ink-muted hover:bg-fill-subtle hover:text-ink-secondary",
                )}
              >
                {item.icon}
                {item.label}
                {item.badge}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
