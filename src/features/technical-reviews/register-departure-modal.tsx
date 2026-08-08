"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { BusSearch } from "@/features/technical-reviews/bus-search";
import { openReviewAction } from "@/features/technical-reviews/actions";
import type { FleetViewRow } from "@/types/database.types";

/**
 * §18 · Registro de salida a planta.
 *
 * Sólo se pide bus, conductor y momento de salida. NO se pide resultado: el
 * proceso queda abierto hasta que el bus regrese (§18, §20).
 *
 * Si el bus ya tiene un proceso abierto, la base lo rechaza y aquí se muestra
 * el mensaje correspondiente (§19).
 */
export function RegisterDepartureModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [bus, setBus] = useState<FleetViewRow | null>(null);
  const [driverName, setDriverName] = useState("");
  const [departureAt, setDepartureAt] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function reset() {
    setBus(null);
    setDriverName("");
    setDepartureAt("");
    setFieldErrors({});
    setFormError(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (!bus) errors.fleet_id = "Debe seleccionar el bus.";
    if (driverName.trim() === "") errors.driver_name = "Debe ingresar el nombre del conductor.";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const formData = new FormData();
    formData.set("fleet_id", bus!.id);
    formData.set("driver_name", driverName);
    // Vacío = momento del registro
    formData.set("departure_at", departureAt ? new Date(departureAt).toISOString() : "");

    startTransition(async () => {
      const result = await openReviewAction(formData);

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast.success("Salida a planta registrada correctamente.");
      reset();
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      busy={pending}
      title="Registrar salida a planta"
      description="El proceso quedará abierto hasta que el bus regrese."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" form="departure-form" loading={pending}>
            Registrar salida
          </Button>
        </>
      }
    >
      <form id="departure-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}

        <Field
          label="Bus"
          required
          hint="Busque por PPU o número interno. Los datos se toman de la flota."
          error={fieldErrors.fleet_id}
        >
          <BusSearch
            value={bus}
            onSelect={setBus}
            disabled={pending}
            error={fieldErrors.fleet_id}
          />
        </Field>

        <Field
          label="Nombre del conductor"
          required
          error={fieldErrors.driver_name}
          htmlFor="driver-name"
        >
          <Input
            id="driver-name"
            value={driverName}
            onChange={(event) => setDriverName(event.target.value)}
            maxLength={160}
            autoComplete="off"
            disabled={pending}
            invalid={Boolean(fieldErrors.driver_name)}
          />
        </Field>

        <Field
          label="Fecha y hora de salida"
          hint="Déjelo vacío para registrar la salida en este momento."
          error={fieldErrors.departure_at}
          htmlFor="departure-at"
        >
          <Input
            id="departure-at"
            type="datetime-local"
            value={departureAt}
            onChange={(event) => setDepartureAt(event.target.value)}
            disabled={pending}
            invalid={Boolean(fieldErrors.departure_at)}
          />
        </Field>
      </form>
    </Modal>
  );
}
