import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Sin conexión" };

/**
 * Página que el service worker sirve cuando no hay red.
 *
 * No muestra ningún dato operacional: mostrar información cacheada sin avisar
 * llevaría a decidir sobre revisiones desactualizadas (§3).
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-[var(--shadow-card)] sm:p-8">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-muted">
          <WifiOff className="size-6 text-ink-muted" aria-hidden />
        </div>

        <h1 className="text-lg font-semibold text-ink">Sin conexión</h1>
        <p className="mt-2 text-sm text-ink-muted">
          No fue posible conectar con el servidor. La información operacional siempre se consulta
          en línea, por lo que no se muestran datos guardados que podrían estar desactualizados.
        </p>

        <p className="mt-4 text-sm text-ink-muted">
          Recupere la conexión y vuelva a intentarlo.
        </p>
      </div>
    </main>
  );
}
