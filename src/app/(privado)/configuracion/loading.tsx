import { SectionLoading } from "@/components/layout/section-loading";

/**
 * Estado de carga de la sección. Next lo muestra en cuanto se pulsa el enlace,
 * sin esperar a los datos, y lo precarga al pasar el puntero por encima.
 */
export default function Loading() {
  return <SectionLoading />;
}
