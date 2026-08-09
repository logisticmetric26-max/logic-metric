"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { deleteReviewHistoryAction } from "@/features/technical-reviews/actions";

export function HistoryDeleteButton({
  eventId,
  internalNumber,
  ppu,
}: {
  eventId: string;
  internalNumber: string;
  ppu: string;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteReviewHistoryAction(eventId);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setConfirming(false);
      toast.success(`Historial del bus ${internalNumber} eliminado completamente.`);
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<Trash2 className="size-3.5" aria-hidden />}
        className="text-danger-600 hover:bg-danger-50 hover:text-danger-700"
        onClick={() => setConfirming(true)}
        aria-label={`Eliminar historial del bus ${internalNumber}, patente ${ppu}`}
      >
        Eliminar
      </Button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={confirmDelete}
        loading={pending}
        title="Eliminar proceso del historial"
        confirmLabel="Eliminar todo"
        message={
          <div className="space-y-3">
            <p>
              Se eliminará definitivamente el proceso del bus{" "}
              <strong>{internalNumber}</strong> ({ppu}).
            </p>
            <div className="rounded-lg border border-danger-200 bg-danger-50/70 px-3 py-2.5 text-danger-700">
              También se borrarán los rechazos detectados, el análisis del sistema,
              los registros documentales y todos los PDF adjuntos almacenados.
            </div>
            <p>Esta acción no se puede deshacer.</p>
          </div>
        }
      />
    </>
  );
}
