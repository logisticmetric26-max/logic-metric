"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/format";

/**
 * §20 · Tiempo transcurrido desde la salida.
 *
 * Se recalcula sobre la marca real cada minuto, así que el valor sigue siendo
 * correcto aunque la pestaña lleve horas abierta. El primer render usa el mismo
 * cálculo que el servidor para evitar un desajuste de hidratación visible.
 */
export function ElapsedTime({ from }: { from: string }) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(from));

  useEffect(() => {
    const interval = setInterval(() => setElapsed(formatElapsed(from)), 60_000);
    return () => clearInterval(interval);
  }, [from]);

  return (
    <span className="tabular-nums" title="Tiempo transcurrido desde la salida">
      {elapsed}
    </span>
  );
}
