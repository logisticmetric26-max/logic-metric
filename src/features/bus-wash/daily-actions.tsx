"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CloudRain, FileText, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { FilterSelect, SearchField } from "@/components/ui/filters";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bulkMarkBusWashAction, setBusWashRainDayAction } from "@/features/bus-wash/actions";

/**
 * §Lavado · Acciones del día.
 *
 * Lo que de verdad se hace al cerrar el turno: casi toda la flota cumplió, así
 * que se marca todo de una vez y después se corrigen las excepciones. Marcar
 * cuatrocientas casillas a mano no es un flujo de trabajo.
 *
 * B&M y carrocería van en botones SEPARADOS porque son dos faenas distintas:
 * bajo lluvia se barre y se mopea igual, pero no se lava carrocería.
 *
 * Ambos actúan sobre el terminal seleccionado arriba. Sin terminal elegido no
 * se ofrecen: un registro masivo sobre «todos mis terminales» es exactamente el
 * tipo de acción que se lamenta después.
 */
export function BusWashDailyActions({
  date,
  terminalId,
  terminalName,
  canEdit,
  rainReason,
  progress,
  terminals,
  search,
}: {
  date: string;
  terminalId: string | null;
  terminalName: string | null;
  canEdit: boolean;
  /** Terminales autorizados del usuario. */
  terminals: { id: string; name: string }[];
  /** Texto de búsqueda vigente, para conservarlo en los enlaces. */
  search: string;
  rainReason: string | null;
  /** Cifras ya calculadas en el servidor para el terminal mostrado. */
  progress: { bmDone: number; bodyDone: number; expected: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [rainOpen, setRainOpen] = useState(false);

  // Los terminales sobre los que se actúa son EXACTAMENTE los que la pantalla
  // está mostrando: uno si hay filtro, todos los autorizados si no. Esconder
  // los botones cuando no hay filtro dejaba la función invisible por defecto.
  // Alcance ESTRICTO: sólo el terminal filtrado. Aplicar un masivo a los demás
  // terminales a la vez es exactamente lo que no se quiere; sin filtro los
  // botones se ven pero no se pueden pulsar, con el motivo escrito debajo.
  const alcance = terminalId ? [terminalId] : [];
  const alcanceLabel = terminalName ?? "—";
  const sinTerminal = alcance.length === 0;

  function marcarTodos(field: "bm_completed" | "body_wash_completed", etiqueta: string) {
    if (alcance.length === 0) return;

    startTransition(async () => {
      const result = await bulkMarkBusWashAction({ date, terminalIds: alcance, field });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.data.updated === 0
          ? `No había buses pendientes de ${etiqueta}.`
          : `${formatNumber(result.data.updated)} buses marcados en ${etiqueta}.`,
      );
      router.refresh();
    });
  }

  function hojaHref(tipo: "bm" | "carroceria") {
    const parametros = new URLSearchParams({ tipo });
    if (terminalId) parametros.set("terminal", terminalId);
    return `/api/lavado/pendientes?${parametros.toString()}`;
  }

  // `search` se recibe para que el componente se vuelva a renderizar cuando
  // cambia la búsqueda; el valor lo pinta `SearchField` desde la propia URL.
  void search;

  const bmPercent = porcentaje(progress.bmDone, progress.expected);
  const bodyPercent = porcentaje(progress.bodyDone, progress.expected);

  return (
    <>
      {/* UNA sola barra: filtro, avance y acciones.
          Antes eran tres tarjetas apiladas que empujaban la tabla fuera de la
          pantalla; en un control diario, la tabla es el trabajo y todo lo demás
          es contexto que debe caber en una franja. */}
      <Card solid className="mb-3">
        <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {terminals.length > 1 && (
              <FilterSelect
                paramName="terminal"
                label=""
                allLabel="Todos mis terminales"
                options={terminals.map((terminal) => ({ value: terminal.id, label: terminal.name }))}
                className="w-full lg:w-56"
              />
            )}

            {/* Buscador junto al filtro: se busca por patente o número interno
                mientras se está registrando, sin bajar hasta la tabla. */}
            <SearchField
              paramName="buscar"
              placeholder="Patente o número interno…"
              className="w-full lg:w-56"
            />

            {/* Avance en línea, no en tarjetas: dos cifras no necesitan
                doscientos píxeles de alto cada una. */}
            <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2">
              <Avance etiqueta="B&M" done={progress.bmDone} total={progress.expected} percent={bmPercent} />
              <Avance etiqueta="Carrocería" done={progress.bodyDone} total={progress.expected} percent={bodyPercent} />
            </div>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending || sinTerminal}
                  title={sinTerminal ? "Elija un terminal para registrar" : undefined}
                  onClick={() => marcarTodos("bm_completed", "barrido y mopeo")}
                  icon={
                    pending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="size-4" aria-hidden />
                    )
                  }
                >
                  Todo B&M
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending || sinTerminal}
                  title={sinTerminal ? "Elija un terminal para registrar" : undefined}
                  onClick={() => marcarTodos("body_wash_completed", "lavado de carrocería")}
                  icon={
                    pending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="size-4" aria-hidden />
                    )
                  }
                >
                  Todo lavado
                </Button>

                <Button
                  size="sm"
                  variant={rainReason ? "subtle" : "ghost"}
                  disabled={pending || !terminalId}
                  title={terminalId ? undefined : "Elija un terminal para justificar la lluvia"}
                  onClick={() => setRainOpen(true)}
                  icon={<CloudRain className="size-4" aria-hidden />}
                >
                  Lluvia
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <span className="text-[10.5px] font-semibold tracking-[0.05em] text-ink-subtle uppercase">
              Pendientes de ayer
            </span>
            <Link
              href={hojaHref("bm")}
              // Descarga directa del archivo, no una vista para imprimir
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary transition-colors hover:bg-fill-subtle hover:text-ink"
            >
              <FileText className="size-3.5" aria-hidden />
              PDF pendientes B&M
            </Link>
            <Link
              href={hojaHref("carroceria")}
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary transition-colors hover:bg-fill-subtle hover:text-ink"
            >
              <FileText className="size-3.5" aria-hidden />
              PDF pendientes carrocería
            </Link>
          </div>

          <p className="text-[11px] leading-snug text-ink-subtle">
            Los registros masivos se aplican a{" "}
            <strong className="font-medium text-ink-secondary">{alcanceLabel}</strong> y no tocan los
            buses en reparación ni los marcados «no se lava».
            {rainReason && (
              <span className="ml-1 text-info-700">
                · Día de lluvia: {rainReason}
              </span>
            )}
          </p>
        </div>
      </Card>

      {terminalId && (
        <RainModal
          open={rainOpen}
          onClose={() => setRainOpen(false)}
          date={date}
          terminalId={terminalId}
          terminalName={terminalName}
          currentReason={rainReason}
        />
      )}
    </>
  );
}

function porcentaje(done: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((done / total) * 100);
}

function Avance({
  etiqueta,
  done,
  total,
  percent,
}: {
  etiqueta: string;
  done: number;
  total: number;
  percent: number | null;
}) {
  return (
    <div className="min-w-[9rem] flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-secondary">{etiqueta}</span>
        <span className="text-[13px] leading-none font-semibold text-ink tabular-nums">
          {percent === null ? "—" : `${percent}%`}
          <span className="ml-1.5 text-[10.5px] font-normal text-ink-subtle">
            {formatNumber(done)}/{formatNumber(total)}
          </span>
        </span>
      </div>

      <div className="mt-1 h-[5px] w-full overflow-hidden rounded-full bg-fill-subtle">
        <div
          className={cn("h-full rounded-full bg-brand-600 transition-[width] duration-500")}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Justificación del día de lluvia.
 *
 * Se exige escribirla: una marca sin explicación no justifica nada ante quien
 * revise el incumplimiento meses después.
 */
function RainModal({
  open,
  onClose,
  date,
  terminalId,
  terminalName,
  currentReason,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  terminalId: string;
  terminalName: string | null;
  currentReason: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState(currentReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function guardar(valor: string | null) {
    setError(null);

    startTransition(async () => {
      const result = await setBusWashRainDayAction({ date, terminalId, reason: valor });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(valor === null ? "Se quitó el día de lluvia." : "Día de lluvia registrado.");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Día de lluvia"
      description={`No se lavó carrocería en ${terminalName ?? "este terminal"}.`}
      size="sm"
      busy={pending}
      footer={
        <div className="flex flex-1 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {currentReason ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => guardar(null)}>
              Quitar marca
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" size="sm" disabled={pending} onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" loading={pending} onClick={() => guardar(reason)}>
              Guardar
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert tone="danger">{error}</Alert>}

        <p className="text-[12.5px] leading-relaxed text-ink-secondary">
          El barrido y mopeo se sigue registrando con normalidad, y el lavado de carrocería
          <strong className="font-medium text-ink"> tampoco queda bloqueado</strong>: si escampa y
          alcanzan a lavar, márquelo igual.
        </p>

        <Field label="Motivo" required htmlFor="rain-reason">
          <Input
            id="rain-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Lluvia durante toda la jornada"
            maxLength={500}
            disabled={pending}
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}
