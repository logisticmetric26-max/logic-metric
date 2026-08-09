"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { initialsFor } from "@/lib/avatar";

const SIZES = {
  sm: { box: "size-7", text: "text-[10px]", dot: "size-2 border-[1.5px]" },
  md: { box: "size-9", text: "text-[12px]", dot: "size-2.5 border-2" },
  lg: { box: "size-12", text: "text-[15px]", dot: "size-3 border-2" },
  xl: { box: "size-24", text: "text-[28px]", dot: "size-4 border-[3px]" },
} as const;

/**
 * Foto de perfil con reserva de iniciales.
 *
 * Si la imagen no carga —red caída, archivo borrado a mano del bucket— se
 * muestran las iniciales en lugar del icono roto del navegador: un avatar
 * partido en una tabla de usuarios parece un error de la aplicación.
 *
 * El punto de presencia va aquí y no al lado porque acompaña siempre a la
 * misma pieza: así ningún listado puede colocarlo de forma distinta.
 */
export function Avatar({
  name,
  src,
  size = "md",
  online,
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  /** Muestra el punto verde de «conectado». */
  online?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dimensions = SIZES[size];
  const showImage = Boolean(src) && !failed;

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-full",
          "ring-1 ring-border",
          dimensions.box,
          showImage
            ? "bg-surface-muted"
            : "bg-gradient-to-b from-brand-solid-from to-brand-solid-to text-white",
        )}
      >
        {showImage ? (
          /* Se usa <img> y no <Image>: la foto sale de un bucket externo, pesa
             como mucho 2 MB y se muestra a 96 px o menos. Pasarla por el
             optimizador obligaría a declarar el dominio remoto y añadiría una
             petición al servidor por cada avatar de cada tabla, sin ahorrar
             ancho de banda apreciable a este tamaño. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src ?? undefined}
            alt=""
            className="size-full object-cover"
            onError={() => setFailed(true)}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className={cn("font-semibold tracking-tight", dimensions.text)} aria-hidden>
            {initialsFor(name)}
          </span>
        )}
      </span>

      {online && (
        <span
          className={cn(
            "absolute right-0 bottom-0 rounded-full border-surface bg-success-600",
            dimensions.dot,
          )}
          title="Conectado"
        />
      )}
    </span>
  );
}
