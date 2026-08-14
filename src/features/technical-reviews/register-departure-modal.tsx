"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { TimeTextInput } from "@/components/ui/time-input";
import { useToast } from "@/components/ui/toast";
import { openReviewAction } from "@/features/technical-reviews/actions";
import { BusSearch } from "@/features/technical-reviews/bus-search";
import { hasNameAndSurname } from "@/lib/person-name";
import { isValidTimeText } from "@/lib/utils";
import type { FleetViewRow } from "@/types/database.types";

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
  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [departureTouched, setDepartureTouched] = useState(false);
  const liveNow = nowForInputParts();
  const departureDateValue = departureTouched ? departureDate : liveNow.date;
  const departureTimeValue = departureTouched ? departureTime : liveNow.time;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function reset() {
    setBus(null);
    setDriverName("");
    setDepartureDate("");
    setDepartureTime("");
    setDepartureTouched(false);
    setFieldErrors({});
    setFormError(null);
  }

  function ensureDepartureDraft() {
    if (departureTouched) return null;

    const current = nowForInputParts();
    setDepartureTouched(true);
    setDepartureDate(current.date);
    setDepartureTime(current.time);
    return current;
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const selectedDate = departureTouched ? departureDate : liveNow.date;
    const selectedTime = departureTouched ? departureTime : liveNow.time;
    const errors: Record<string, string> = {};

    if (!bus) errors.fleet_id = "Debe seleccionar el bus.";
    if (driverName.trim() === "") {
      errors.driver_name = "Debe ingresar el nombre del conductor.";
    } else if (!hasNameAndSurname(driverName)) {
      errors.driver_name = "Ingrese el nombre y el apellido del conductor.";
    }
    if (!selectedDate || !isValidTimeText(selectedTime)) {
      errors.departure_at = "Debe ingresar una fecha y una hora validas.";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const formData = new FormData();
    formData.set("fleet_id", bus!.id);
    formData.set("driver_name", driverName);
    formData.set("departure_at", buildDepartureIso(selectedDate, selectedTime));

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
      description="El proceso quedara abierto hasta que el bus regrese."
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
          hint="Busque por PPU o numero interno. Los datos se toman de la flota."
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
          label="Conductor"
          hint="Nombre y apellido, en el mismo campo."
          required
          error={fieldErrors.driver_name}
          htmlFor="driver-name"
        >
          <Input
            id="driver-name"
            value={driverName}
            onChange={(event) => setDriverName(event.target.value)}
            placeholder="Juan Perez"
            maxLength={160}
            autoComplete="off"
            autoCapitalize="words"
            disabled={pending}
            invalid={Boolean(fieldErrors.driver_name)}
          />
        </Field>

        <Field
          label="Fecha y hora de salida"
          hint="Viene puesta la hora actual. Modifiquela solo si la salida fue antes."
          error={fieldErrors.departure_at}
          htmlFor="departure-date"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="departure-date"
              type="date"
              value={departureDateValue}
              onChange={(event) => {
                const current = ensureDepartureDraft();
                setDepartureDate(event.target.value);
                if (current) setDepartureTime(current.time);
              }}
              disabled={pending}
              invalid={Boolean(fieldErrors.departure_at)}
            />
            <TimeTextInput
              id="departure-time"
              value={departureTimeValue}
              onChange={(event) => {
                const current = ensureDepartureDraft();
                setDepartureTime(event.target.value);
                if (current) setDepartureDate(current.date);
              }}
              disabled={pending}
              invalid={Boolean(fieldErrors.departure_at)}
            />
          </div>
        </Field>
      </form>
    </Modal>
  );
}

function nowForInputParts() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

function buildDepartureIso(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);

  return new Date(year, month - 1, day, hours, minutes).toISOString();
}
