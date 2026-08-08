"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, IdCard, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { formatRutInput } from "@/lib/auth/rut";
import { signInAction } from "@/features/auth/actions";

/**
 * Formulario de acceso.
 *
 * Muestra exclusivamente RUT y CONTRASEÑA (§7). El identificador interno que
 * Supabase Auth necesita se calcula en el servidor y jamás aparece aquí.
 */
export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [rut, setRut] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const formData = new FormData();
    formData.set("rut", rut);
    formData.set("password", password);
    if (nextPath) formData.set("siguiente", nextPath);

    startTransition(async () => {
      const result = await signInAction(formData);

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      // `refresh()` obliga a releer la sesión en el servidor antes de navegar
      router.replace(result.data.next);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}

      <Field label="RUT" required error={fieldErrors.rut} htmlFor="rut">
        <Input
          id="rut"
          name="rut"
          value={rut}
          // Formatea mientras se escribe; se aceptan los tres formatos de §7
          onChange={(event) => setRut(formatRutInput(event.target.value))}
          placeholder="12.345.678-9"
          autoComplete="username"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          disabled={pending}
          invalid={Boolean(fieldErrors.rut)}
          leading={<IdCard className="size-4" aria-hidden />}
        />
      </Field>

      <Field label="Contraseña" required error={fieldErrors.password} htmlFor="password">
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            disabled={pending}
            invalid={Boolean(fieldErrors.password)}
            leading={<Lock className="size-4" aria-hidden />}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-subtle hover:text-ink"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </Field>

      <Button type="submit" size="lg" fullWidth loading={pending} className="mt-2">
        {pending ? "Verificando…" : "Ingresar"}
      </Button>
    </form>
  );
}
