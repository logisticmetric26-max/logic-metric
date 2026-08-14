"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CloudRain, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { FilterSelect } from "@/components/ui/filters";
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
}: {
  date: string;
  terminalId: string | null;
  terminalName: string | null;
  canEdit: boolean;
  /** Terminales autorizados del usuario. */
  terminals: { id: string; name: string }[];
  rainReason: string | null;
  /** Cifras ya calculadas en el servidor para el terminal mostrado. */
  progress: { bmDone: number; bodyDone: number; expected: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [rainOpen, setRainOpen] = useState(false);

  function marcarTodos(field: "bm_completed" | "body_wash_completed", etiqueta: string) {
    if (!terminalId) return;

    startTransition(async () => {
      const result = await bulkMarkBusWashAction({ date, terminalId, field });

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

  const bmPercent = porcentaje(progress.bmDone, progress.expected);
  const bodyPercent = porcentaje(progress.bodyDone, progress.expected);

  return (
    <>
      <Card solid className="mb-4">
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          {/* El selector filtra el listado completo, no sólo estas cifras:
              la consulta se hace ya filtrada en la base. */}
          {terminals.length > 1 && (
            <FilterSelect
              paramName="terminal"
              label="Terminal"
              allLabel="Todos mis terminales"
              options={terminals.map((terminal) => ({ value: terminal.id, label: terminal.name }))}
              className="w-full sm:max-w-xs"
            />
          )}

          {/* Avance del día, sin metas: cuántos van de cuántos. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Progreso etiqueta="Barrido y mopeo" done={progress.bmDone} total={progress.expected} percent={bmPercent} />
            <Progreso etiqueta="Lavado de carrocería" done={progress.bodyDone} total={progress.expected} percent={bodyPercent} />
          </div>

          {canEdit && (
            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:items-center">
              {terminalId ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => marcarTodos("bm_completed", "barrido y mopeo")}
                    icon={
                      pending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Sparkles className="size-4" aria-hidden />
                      )
                    }
                  >
                    Registrar B&M de todos
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => marcarTodos("body_wash_completed", "lavado de carrocería")}
                    icon={
                      pending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Check className="size-4" aria-hidden />
                      )
                    }
                  >
                    Registrar lavado de todos
                  </Button>

                  <Button
                    size="sm"
                    variant={rainReason ? "subtle" : "ghost"}
                    disabled={pending}
                    onClick={() => setRainOpen(true)}
                    icon={<CloudRain className="size-4" aria-hidden />}
                  >
                    {rainReason ? "Día de lluvia registrado" : "Marcar día de lluvia"}
                  </Button>

                  <p className="text-[11.5px] text-ink-muted sm:ml-auto">
                    Se aplica a <strong className="font-medium text-ink-secondary">{terminalName}</strong>.
                    No toca los buses en reparación ni los marcados «no se lava».
                  </p>
                </>
              ) : (
                <p className="text-[12px] text-ink-muted">
                  Elija un terminal arriba para registrar de forma masiva. Un registro sobre todos
                  los terminales a la vez es difícil de deshacer.
                </p>
              )}
            </div>
          )}

          {rainReason && (
            <p className="flex items-start gap-2 rounded-md bg-info-50 px-3 py-2 text-[12px] text-info-700">
              <CloudRain className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <strong className="font-medium">Día de lluvia.</strong> {rainReason}
              </span>
            </p>
          )}
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

function Progreso({
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
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-secondary">{etiqueta}</span>
        <span className="text-[19px] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">
          {percent === null ? "—" : `${percent}%`}
        </span>
      </div>

      <div className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-fill-subtle">
        <div
          className={cn("h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-[var(--ease-emphasis)]")}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>

      <p className="mt-1 text-[11px] text-ink-subtle tabular-nums">
        {formatNumber(done)} de {formatNumber(total)} buses
      </p>
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
