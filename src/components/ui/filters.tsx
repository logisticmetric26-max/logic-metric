"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/modal";
import { Input } from "@/components/ui/field";
import { TimeTextInput } from "@/components/ui/time-input";
import { cn, isValidTimeText } from "@/lib/utils";

/**
 * Filtros y búsqueda sincronizados con la URL (§65, §66).
 *
 * El estado vive en el querystring: los filtros son compartibles, sobreviven a
 * una recarga y llegan al servidor, que es donde realmente se filtra y pagina.
 */

function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }

    // Cualquier cambio de filtro devuelve a la primera página
    params.delete("pagina");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return { searchParams, setParams, pathname, router };
}

/** Buscador con retardo: no dispara una consulta por cada tecla. */
export function SearchField({
  placeholder = "Buscar…",
  paramName = "q",
  className,
}: {
  placeholder?: string;
  paramName?: string;
  className?: string;
}) {
  const { searchParams, setParams } = useUrlState();
  const urlValue = searchParams.get(paramName) ?? "";

  const [value, setValue] = useState(urlValue);
  const [lastUrlValue, setLastUrlValue] = useState(urlValue);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Realinea el campo cuando la URL cambia por fuera del propio input
  // (navegación con el botón atrás, «limpiar filtros»). Es el ajuste de estado
  // durante el render que recomienda React, no un efecto: se resuelve antes de
  // pintar y no provoca un render en cascada.
  if (urlValue !== lastUrlValue) {
    setLastUrlValue(urlValue);
    setValue(urlValue);
  }

  function onChange(next: string) {
    setValue(next);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setParams({ [paramName]: next.trim() || null }), 350);
  }

  useEffect(() => () => clearTimeout(timeout.current), []);

  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        leading={<Search className="size-4" aria-hidden />}
        className="pr-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute inset-y-0 right-2 flex items-center text-ink-subtle hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Selector que escribe directamente en la URL. */
export function FilterSelect({
  paramName,
  label,
  options,
  allLabel = "Todos",
  className,
}: {
  paramName: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
}) {
  const { searchParams, setParams } = useUrlState();
  const value = searchParams.get(paramName) ?? "";

  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11px] font-medium text-ink-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => setParams({ [paramName]: event.target.value || null })}
        className="h-10 w-full rounded-md bg-surface px-3 text-base text-ink ring-1 ring-inset ring-ring transition-shadow hover:ring-border-strong focus:ring-2 focus:ring-brand-500 focus:outline-none sm:text-[13px]"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterDate({
  paramName,
  label,
  className,
}: {
  paramName: string;
  label: string;
  className?: string;
}) {
  const { searchParams, setParams } = useUrlState();
  const value = searchParams.get(paramName) ?? "";

  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11px] font-medium text-ink-muted">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => setParams({ [paramName]: event.target.value || null })}
        className="h-10 w-full rounded-md bg-surface px-3 text-base text-ink ring-1 ring-inset ring-ring transition-shadow hover:ring-border-strong focus:ring-2 focus:ring-brand-500 focus:outline-none sm:text-[13px]"
      />
    </label>
  );
}

export function FilterTime({
  paramName,
  label,
  className,
}: {
  paramName: string;
  label: string;
  className?: string;
}) {
  const { searchParams, setParams } = useUrlState();
  const urlValue = searchParams.get(paramName) ?? "";
  const [value, setValue] = useState(urlValue);
  const [lastUrlValue, setLastUrlValue] = useState(urlValue);

  if (urlValue !== lastUrlValue) {
    setLastUrlValue(urlValue);
    setValue(urlValue);
  }

  function onChange(next: string) {
    setValue(next);

    if (next === "") {
      setParams({ [paramName]: null });
      return;
    }

    if (isValidTimeText(next)) {
      setParams({ [paramName]: next });
    }
  }

  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11px] font-medium text-ink-muted">{label}</span>
      <TimeTextInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      />
    </label>
  );
}

/**
 * Barra de filtros.
 * En escritorio se muestra en línea; en móvil se recoge en un drawer para no
 * comerse la pantalla (§4).
 */
export function FilterBar({
  search,
  children,
  actions,
  activeCount = 0,
}: {
  search?: ReactNode;
  children?: ReactNode;
  /** Acciones principales de la sección (crear, registrar…). */
  actions?: ReactNode;
  activeCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const { pathname, router } = useUrlState();

  const hasFilters = Boolean(children);

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        {search}

        {hasFilters && (
          <>
            <div className="hidden flex-wrap items-end gap-3 lg:flex">{children}</div>

            <Button
              variant="secondary"
              size="sm"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              icon={<SlidersHorizontal className="size-4" aria-hidden />}
            >
              Filtros
              {activeCount > 0 && (
                <span className="ml-1 rounded-full bg-brand-solid-to px-1.5 text-[11px] text-white tabular-nums">
                  {activeCount}
                </span>
              )}
            </Button>
          </>
        )}

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="hidden lg:inline-flex"
            onClick={() => router.replace(pathname)}
          >
            Limpiar filtros
          </Button>
        )}

        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Filtros"
        footer={
          <>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                router.replace(pathname);
                setOpen(false);
              }}
            >
              Limpiar
            </Button>
            <Button fullWidth onClick={() => setOpen(false)}>
              Aplicar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">{children}</div>
      </Drawer>
    </>
  );
}
