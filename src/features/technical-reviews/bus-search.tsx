"use client";

import { useEffect, useRef, useState } from "react";
import { Bus, Check, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/feedback";
import { cn, escapeLikePattern } from "@/lib/utils";
import type { FleetViewRow } from "@/types/database.types";

/**
 * §18, §30 · Búsqueda de bus por PPU o número interno.
 *
 * Al seleccionar el bus, sus datos (PPU, número interno, terminal) se toman de
 * FLOTA — el usuario no los transcribe, así que no pueden quedar inconsistentes.
 *
 * La consulta corre con la sesión del usuario: RLS sólo devuelve buses de
 * terminales autorizados, de modo que ni siquiera es posible seleccionar un bus
 * ajeno.
 */
export function BusSearch({
  value,
  onSelect,
  disabled,
  error,
}: {
  value: FleetViewRow | null;
  onSelect: (bus: FleetViewRow | null) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FleetViewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /**
   * Limpiar los resultados y encender el indicador ocurre aquí, no en el
   * efecto: así el efecto sólo programa la consulta y no dispara renders en
   * cascada.
   */
  function onQueryChange(next: string) {
    setQuery(next);

    if (next.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
  }

  useEffect(() => {
    if (value) return;
    if (query.trim().length < 2) return;

    if (timeout.current) clearTimeout(timeout.current);

    timeout.current = setTimeout(async () => {
      const supabase = createClient();
      const raw = query.trim();
      const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
      const internalPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;

      const { data } = await supabase
        .from("fleet_view")
        .select("*")
        // Sólo buses operativos pueden iniciar un proceso
        .eq("active", true)
        .or(`ppu.ilike.${ppuPattern},internal_number.ilike.${internalPattern}`)
        .order("internal_number")
        .limit(10);

      setResults(data ?? []);
      setLoading(false);
      setOpen(true);
    }, 300);

    return () => clearTimeout(timeout.current);
  }, [query, value]);

  if (value) {
    return (
      <div
        className={cn(
          "flex items-start justify-between gap-3 rounded-lg border px-3.5 py-3",
          "border-brand-200 bg-brand-50",
        )}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Check className="size-4 shrink-0 text-brand-600" aria-hidden />
            {value.internal_number} · <span className="font-mono">{value.ppu}</span>
          </p>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-secondary sm:grid-cols-3">
            <div>
              <dt className="text-ink-muted">Terminal</dt>
              <dd className="truncate">{value.terminal_name}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Modelo</dt>
              <dd className="truncate">{value.model ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Tipo</dt>
              <dd className="truncate">{value.fuel_type_label ?? value.fuel_type}</dd>
            </div>
          </dl>
        </div>

        {!disabled && (
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setQuery("");
              setResults([]);
            }}
            aria-label="Cambiar bus"
            className="-m-1 shrink-0 rounded p-1 text-ink-muted hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Buscar por PPU o número interno…"
        aria-label="Buscar bus por PPU o número interno"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        invalid={Boolean(error)}
        leading={<Search className="size-4" aria-hidden />}
      />

      {loading && (
        <span className="absolute top-1/2 right-3 -translate-y-1/2">
          <Spinner />
        </span>
      )}

      {open && query.trim().length >= 2 && !loading && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-raised)]">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink-muted">
                No se encontraron buses activos que coincidan.
              </li>
            ) : (
              results.map((bus) => (
                <li key={bus.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(bus);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded px-2.5 py-2 text-left hover:bg-surface-muted"
                  >
                    <Bus className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {bus.internal_number} · <span className="font-mono">{bus.ppu}</span>
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {bus.terminal_name}
                        {bus.model ? ` · ${bus.model}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}
