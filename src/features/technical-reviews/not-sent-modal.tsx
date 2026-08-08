"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { BusSearch } from "@/features/technical-reviews/bus-search";
import { createNotSentAction, updateNotSentAction } from "@/features/technical-reviews/actions";
import { todayInZone } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { FleetViewRow, TechnicalReviewNotSentViewRow } from "@/types/database.types";
import { useEffect } from "react";

/**
 * §30-§34 · Registro de bus NO enviado a planta.
 *
 * Deliberadamente simple: bus, fecha, motivo y OT opcional. No pide documentos,
 * ni guía, ni resultado, ni fecha de vencimiento — un no envío no es una
 * revisión y no altera nada del historial del bus (§33, §34).
 */
export function NotSentModal({
  open,
  onClose,
  record,
}: {
  open: boolean;
  onClose: () => void;
  record?: TechnicalReviewNotSentViewRow;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [bus, setBus] = useState<FleetViewRow | null>(null);
  const [eventDate, setEventDate] = useState(record?.event_date ?? todayInZone());
  const [reason, setReason] = useState(record?.reason ?? "");
  const [workOrder, setWorkOrder] = useState(record?.work_order_number ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Al editar, se recupera el bus del registro para mostrarlo ya seleccionado
  useEffect(() => {
    if (!record || bus) return;

    void createClient()
      .from("fleet_view")
      .select("*")
      .eq("id", record.fleet_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBus(data);
      });
  }, [record, bus]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (!bus) errors.fleet_id = "Debe seleccionar el bus.";
    // §31 · el motivo es obligatorio
    if (reason.trim() === "") {
      errors.reason = "Debe ingresar el motivo por el cual el bus no fue enviado.";
    }
    if (eventDate === "") errors.event_date = "Debe indicar la fecha.";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const formData = new FormData();
    if (record) formData.set("id", record.id);
    formData.set("fleet_id", bus!.id);
    formData.set("event_date", eventDate);
    formData.set("reason", reason);
    formData.set("work_order_number", workOrder);

    startTransition(async () => {
      const result = record
        ? await updateNotSentAction(formData)
        : await createNotSentAction(formData);

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast.success(record ? "Registro actualizado." : "Registro de no envío guardado.");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={pending}
      title={record ? "Editar registro de no envío" : "Registrar bus no enviado"}
      description="Este registro no abre un proceso de revisión ni modifica el vencimiento del bus."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="not-sent-form" loading={pending}>
            {record ? "Guardar cambios" : "Registrar"}
          </Button>
        </>
      }
    >
      <form id="not-sent-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}

        <Field
          label="Bus"
          required
          hint="Busque por PPU o número interno."
          error={fieldErrors.fleet_id}
        >
          <BusSearch value={bus} onSelect={setBus} disabled={pending} error={fieldErrors.fleet_id} />
        </Field>

        <Field label="Fecha" required error={fieldErrors.event_date} htmlFor="not-sent-date">
          <Input
            id="not-sent-date"
            type="date"
            value={eventDate}
            max={todayInZone()}
            onChange={(event) => setEventDate(event.target.value)}
            disabled={pending}
            invalid={Boolean(fieldErrors.event_date)}
          />
        </Field>

        <Field
          label="Motivo de no envío"
          required
          hint="Describa por qué el bus no salió a planta."
          error={fieldErrors.reason}
          htmlFor="not-sent-reason"
        >
          <Textarea
            id="not-sent-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            rows={3}
            disabled={pending}
            invalid={Boolean(fieldErrors.reason)}
          />
        </Field>

        <Field
          label="Número de OT"
          hint="Opcional. Permite buscar este registro posteriormente."
          error={fieldErrors.work_order_number}
          htmlFor="not-sent-ot"
        >
          <Input
            id="not-sent-ot"
            value={workOrder}
            onChange={(event) => setWorkOrder(event.target.value)}
            maxLength={40}
            autoCapitalize="characters"
            disabled={pending}
            invalid={Boolean(fieldErrors.work_order_number)}
          />
        </Field>
      </form>
    </Modal>
  );
}
