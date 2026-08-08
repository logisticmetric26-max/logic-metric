"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { setExpiringSoonDaysAction } from "@/features/technical-reviews/actions";

/**
 * §38 · Umbral de «próximo a vencer», configurable.
 *
 * No es una constante del código: vive en `app_settings` y la vista de
 * vencimientos lo lee desde la base, de modo que cambiarlo reclasifica los
 * buses inmediatamente y sin desplegar.
 */
export function ExpiringSoonSetting({
  days,
  canEdit,
}: {
  days: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(days));
  const [pending, startTransition] = useTransition();

  function save() {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
      toast.error("Indique un número de días entre 1 y 365.");
      return;
    }

    startTransition(async () => {
      const result = await setExpiringSoonDaysAction(parsed);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Umbral actualizado.");
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <CalendarClock className="size-4 shrink-0 text-ink-muted" aria-hidden />

      {editing ? (
        <>
          <label htmlFor="expiring-days" className="text-sm text-ink-secondary">
            Se considera próximo a vencer dentro de
          </label>
          <Input
            id="expiring-days"
            type="number"
            min={1}
            max={365}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-24"
            disabled={pending}
            autoFocus
          />
          <span className="text-sm text-ink-secondary">días</span>
          <Button
            size="sm"
            onClick={save}
            loading={pending}
            icon={<Check className="size-4" aria-hidden />}
          >
            Guardar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(String(days));
              setEditing(false);
            }}
            disabled={pending}
          >
            Cancelar
          </Button>
        </>
      ) : (
        <>
          <p className="flex-1 text-sm text-ink-secondary">
            Un bus se marca <strong className="text-ink">próximo a vencer</strong> cuando le quedan{" "}
            <strong className="text-ink">{days} días</strong> o menos.
          </p>
          {canEdit && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing(true)}
              icon={<Pencil className="size-4" aria-hidden />}
            >
              Cambiar
            </Button>
          )}
        </>
      )}
    </div>
  );
}
