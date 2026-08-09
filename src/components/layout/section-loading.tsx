import { Card } from "@/components/ui/card";
import { CardsSkeleton, Skeleton } from "@/components/ui/feedback";

/**
 * Esqueleto de carga de una sección.
 *
 * Existe por una razón medible: cada página del área privada se arma en el
 * servidor y tarda entre 0,7 y 1,6 s en devolver el primer byte. Sin un archivo
 * `loading.tsx`, el navegador se queda en la página anterior durante todo ese
 * rato y el clic parece no haber funcionado — el usuario vuelve a pulsar.
 *
 * Con él, Next corta la respuesta en dos: pinta este esqueleto de inmediato y
 * rellena el contenido cuando llega. Además puede PRECARGARLO al pasar el
 * puntero por el enlace, así que en la práctica el cambio de pestaña se siente
 * instantáneo aunque los datos sigan tardando lo mismo.
 *
 * Las pestañas y el título viven en el layout, que no se vuelve a renderizar:
 * durante la espera se ve exactamente dónde se está.
 */
export function SectionLoading({
  rows = 6,
  filters = true,
}: {
  rows?: number;
  /** Conservado por compatibilidad; las tarjetas ya no usan columnas rígidas. */
  columns?: number;
  /** Reserva el espacio de la barra de filtros para que nada salte al llegar. */
  filters?: boolean;
}) {
  return (
    <Card solid aria-busy="true" aria-label="Cargando">
      {filters && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <Skeleton className="h-10 w-full max-w-[18rem] rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
      )}
      <CardsSkeleton count={rows} />
    </Card>
  );
}
