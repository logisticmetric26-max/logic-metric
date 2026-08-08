"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

/**
 * Paginación en servidor (§66, §67).
 *
 * La página vive en la URL y la consulta usa `range()` de PostgREST: el
 * navegador nunca recibe miles de filas para filtrarlas después.
 */
export function Pagination({
  page,
  pageSize,
  total,
  paramName = "pagina",
}: {
  page: number;
  pageSize: number;
  total: number;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete(paramName);
    else params.set(paramName, String(nextPage));

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-surface-subtle/50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-xs text-ink-muted">
        Mostrando <span className="font-medium text-ink-secondary">{formatNumber(from)}</span>–
        <span className="font-medium text-ink-secondary">{formatNumber(to)}</span> de{" "}
        <span className="font-medium text-ink-secondary">{formatNumber(total)}</span> registros
      </p>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          icon={<ChevronLeft className="size-4" aria-hidden />}
        >
          Anterior
        </Button>

        <span className="text-xs text-ink-muted tabular-nums">
          Página {page} de {totalPages}
        </span>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
        >
          Siguiente
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
