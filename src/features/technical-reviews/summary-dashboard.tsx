"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Plus,
  Timer,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { FilterDate, FilterSelect } from "@/components/ui/filters";
import { RegisterDepartureModal } from "@/features/technical-reviews/register-departure-modal";
import { formatNumber } from "@/lib/format";
import type { TechnicalReviewSummary } from "@/types/database.types";

/**
 * §17 · Resumen operacional.
 *
 * Los indicadores vienen de una función SQL que se evalúa con las políticas RLS
 * del usuario: es imposible que un número incluya terminales a los que no tiene
 * acceso. Nunca se muestran valores de ejemplo — si no hay datos, el indicador
 * es cero.
 *
 * Cada indicador enlaza a la vista donde está su detalle.
 */
export function SummaryDashboard({
  summary,
  terminals,
  canCreate,
  periodLabel,
}: {
  summary: TechnicalReviewSummary;
  terminals: { id: string; name: string }[];
  canCreate: boolean;
  periodLabel: string;
}) {
  const [registering, setRegistering] = useState(false);

  const indicators = [
    {
      label: "Buses en revisión",
      value: summary.in_review,
      tone: "info" as const,
      icon: <Timer className="size-4" aria-hidden />,
      href: "/revision-tecnica/en-revision",
      hint: "Procesos abiertos",
    },
    {
      label: "Aprobados",
      value: summary.approved,
      tone: "success" as const,
      icon: <CheckCircle2 className="size-4" aria-hidden />,
      href: "/revision-tecnica/historial?resultado=APPROVED",
      hint: periodLabel,
    },
    {
      label: "Rechazados",
      value: summary.rejected,
      tone: "danger" as const,
      icon: <XCircle className="size-4" aria-hidden />,
      href: "/revision-tecnica/rechazados",
      hint: periodLabel,
    },
    {
      label: "No enviados",
      value: summary.not_sent,
      tone: "neutral" as const,
      icon: <ClipboardList className="size-4" aria-hidden />,
      href: "/revision-tecnica/no-enviados",
      hint: periodLabel,
    },
    {
      label: "Próximos a vencer",
      value: summary.expiring_soon,
      tone: "warning" as const,
      icon: <CalendarClock className="size-4" aria-hidden />,
      href: "/revision-tecnica/vencimientos?estado=EXPIRING_SOON",
      hint: `Dentro de ${summary.expiring_soon_days} días`,
    },
    {
      label: "Vencidos",
      value: summary.expired,
      tone: "danger" as const,
      icon: <AlertTriangle className="size-4" aria-hidden />,
      href: "/revision-tecnica/vencimientos?estado=EXPIRED",
      hint: "Estado actual de la flota",
    },
  ];

  return (
    <>
      <Card className="mb-5">
        <CardHeader
          title="Período y filtros"
          description="Los vencimientos reflejan el estado actual de la flota y no dependen del período."
          actions={
            canCreate ? (
              <Button
                onClick={() => setRegistering(true)}
                icon={<Plus className="size-4" aria-hidden />}
              >
                Registrar salida
              </Button>
            ) : undefined
          }
        />
        <div className="flex flex-wrap items-end gap-3 px-4 py-4 sm:px-5">
          <FilterDate paramName="desde" label="Desde" className="w-full sm:w-44" />
          <FilterDate paramName="hasta" label="Hasta" className="w-full sm:w-44" />
          {/* §17 · el selector de terminal sólo aparece si tiene más de uno */}
          {terminals.length > 1 && (
            <FilterSelect
              paramName="terminal"
              label="Terminal"
              allLabel="Todos mis terminales"
              options={terminals.map((terminal) => ({
                value: terminal.id,
                label: terminal.name,
              }))}
              className="w-full sm:w-56"
            />
          )}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {indicators.map((indicator) => (
          <Link
            key={indicator.label}
            href={indicator.href}
            className="rounded-xl focus-visible:outline-2"
          >
            <StatCard
              label={indicator.label}
              value={formatNumber(indicator.value)}
              tone={indicator.tone}
              icon={indicator.icon}
              hint={indicator.hint}
            />
          </Link>
        ))}
      </div>

      {canCreate && (
        <RegisterDepartureModal open={registering} onClose={() => setRegistering(false)} />
      )}
    </>
  );
}
