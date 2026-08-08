import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";

/**
 * Pantalla de estado terminal: el usuario tiene sesión pero no puede operar.
 *
 * Explica qué ocurre y ofrece la única acción sensata: cerrar sesión. No se
 * muestran datos ni navegación, porque no hay nada a lo que pueda acceder.
 */
export function EstadoScreen({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-[var(--shadow-card)] sm:p-8">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-muted">
          {icon}
        </div>

        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{description}</p>

        {children}

        <form action={signOutAction} className="mt-6">
          <Button
            type="submit"
            variant="secondary"
            fullWidth
            icon={<LogOut className="size-4" aria-hidden />}
          >
            Cerrar sesión
          </Button>
        </form>
      </div>
    </main>
  );
}
