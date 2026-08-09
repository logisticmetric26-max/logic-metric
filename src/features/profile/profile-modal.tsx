"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Check, KeyRound, Loader2, LogOut, Trash2, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { formatRut } from "@/lib/auth/rut";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  avatarObjectPath,
  avatarUrl,
} from "@/lib/avatar";
import { changeOwnPasswordAction, setOwnAvatarAction } from "@/features/profile/actions";
import { signOutAction } from "@/features/auth/actions";
import { formatFileSize } from "@/lib/format";
import type { CurrentUserContext } from "@/types/database.types";

/**
 * §11 · Ventana de perfil.
 *
 * Una sola ventana con las dos cosas que un usuario puede cambiar de sí mismo
 * —foto y contraseña— y, arriba, la ficha completa en modo lectura: quién es,
 * qué rol tiene y a qué terminales llega. Ese resumen es la mitad del valor:
 * responde «¿por qué no veo tal terminal?» sin abrir ACCESO ni preguntar.
 *
 * Lo que NO está aquí es deliberado. RUT, nombre, cargo, rol y terminales son
 * atribuciones que concede un administrador; si cada quien pudiera editarlas,
 * cualquiera podría ampliarse el alcance (§56).
 */
export function ProfileModal({
  open,
  onClose,
  context,
  supabaseUrl,
}: {
  open: boolean;
  onClose: () => void;
  context: CurrentUserContext;
  /** Base pública para componer la URL de la foto. */
  supabaseUrl: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mi perfil"
      size="md"
      footer={
        // Cerrar sesión vivía en el menú de la cabecera que este perfil
        // sustituye. Se mantiene a un clic de los dos accesos, y separado de
        // las acciones de guardado para no confundirse con ellas.
        <div className="flex flex-1 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              icon={<LogOut className="size-4" aria-hidden />}
            >
              Cerrar sesión
            </Button>
          </form>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <AvatarSection context={context} supabaseUrl={supabaseUrl} />
        <IdentitySection context={context} />
        <PasswordSection />
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Foto
// -----------------------------------------------------------------------------

function AvatarSection({
  context,
  supabaseUrl,
}: {
  context: CurrentUserContext;
  supabaseUrl: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Vista previa local inmediata: subir y esperar deja la interfaz muda varios
  // segundos con conexiones lentas, y el usuario duda si el clic funcionó.
  const [preview, setPreview] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(context.profile.avatar_path);

  const current = preview ?? avatarUrl(path, supabaseUrl);

  async function upload(file: File) {
    setError(null);
    setDone(false);

    if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
      setError("El archivo debe ser una imagen JPG, PNG o WEBP.");
      return;
    }

    if (file.size > AVATAR_MAX_BYTES) {
      setError(
        `La imagen pesa ${formatFileSize(file.size)} y el máximo son ${formatFileSize(AVATAR_MAX_BYTES)}.`,
      );
      return;
    }

    setPending(true);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    try {
      const supabase = createClient();
      const destination = avatarObjectPath(context.profile.id, file.name);

      // Sube el navegador con la sesión del usuario: las políticas del bucket
      // sólo le permiten escribir dentro de su propia carpeta.
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(destination, file, { cacheControl: "3600", upsert: false, contentType: file.type });

      if (uploadError) throw uploadError;

      const result = await setOwnAvatarAction(destination);
      if (!result.ok) throw new Error(result.error);

      // El archivo anterior se borra DESPUÉS de que la ficha apunte al nuevo:
      // si se borrara antes y fallara la subida, el usuario se quedaría sin foto.
      if (path) {
        await supabase.storage.from("avatars").remove([path]);
      }

      setPath(destination);
      setDone(true);
    } catch (cause) {
      setPreview(null);
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "No fue posible guardar la imagen.",
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removePhoto() {
    setError(null);
    setDone(false);
    setPending(true);

    try {
      const result = await setOwnAvatarAction(null);
      if (!result.ok) throw new Error(result.error);

      if (path) {
        const supabase = createClient();
        await supabase.storage.from("avatars").remove([path]);
      }

      setPath(null);
      setPreview(null);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible quitar la imagen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar name={context.profile.full_name} src={current} size="xl" />
          {pending && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-scrim">
              <Loader2 className="size-5 animate-spin text-white" aria-hidden />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
            {context.profile.full_name}
          </p>
          <p className="truncate text-[13px] text-ink-muted">{context.profile.job_title}</p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
              icon={<Camera className="size-4" aria-hidden />}
            >
              {path ? "Cambiar foto" : "Subir foto"}
            </Button>
            {path && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={removePhoto}
                icon={<Trash2 className="size-4" aria-hidden />}
              >
                Quitar
              </Button>
            )}
          </div>

          <p className="mt-2 text-[11.5px] text-ink-subtle">
            JPG, PNG o WEBP · máximo {formatFileSize(AVATAR_MAX_BYTES)}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_MIME_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {error && <Alert tone="danger">{error}</Alert>}
      {done && !error && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-success-700">
          <Check className="size-3.5" aria-hidden />
          Foto actualizada.
        </p>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Ficha
// -----------------------------------------------------------------------------

function IdentitySection({ context }: { context: CurrentUserContext }) {
  const terminals = context.profile.has_global_access
    ? "Todos los terminales"
    : context.terminals.map((terminal) => terminal.name).join(", ") || "—";

  const rows = [
    { label: "RUT", value: formatRut(context.profile.rut) },
    { label: "Cargo", value: context.profile.job_title },
    { label: "Rol", value: context.profile.role_name },
    { label: "Terminales", value: terminals },
  ];

  return (
    <section>
      <SectionTitle icon={<UserRound className="size-3.5" aria-hidden />}>
        Ficha
      </SectionTitle>

      <dl className="divide-y divide-border rounded-md border border-border bg-surface-subtle px-3.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-4 py-2.5">
            <dt className="w-24 shrink-0 text-[12px] text-ink-muted">{row.label}</dt>
            <dd className="min-w-0 flex-1 text-[13px] text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 text-[11.5px] text-ink-subtle">
        Estos datos los administra el área de Acceso. Si algo no corresponde, solicite el cambio.
      </p>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Contraseña
// -----------------------------------------------------------------------------

function PasswordSection() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setDone(false);

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await changeOwnPasswordAction(formData);

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      formRef.current?.reset();
      setDone(true);
    });
  }

  return (
    <section>
      <SectionTitle icon={<KeyRound className="size-3.5" aria-hidden />}>Seguridad</SectionTitle>

      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        {done && !error && <Alert tone="success">Su contraseña se cambió correctamente.</Alert>}

        <Field
          label="Contraseña actual"
          required
          error={fieldErrors.current_password}
          htmlFor="current_password"
        >
          <Input
            id="current_password"
            name="current_password"
            type="password"
            autoComplete="current-password"
            disabled={pending}
            invalid={Boolean(fieldErrors.current_password)}
            required
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Contraseña nueva"
            required
            error={fieldErrors.new_password}
            htmlFor="new_password"
          >
            <Input
              id="new_password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              disabled={pending}
              invalid={Boolean(fieldErrors.new_password)}
              required
            />
          </Field>

          <Field
            label="Repetir la nueva"
            required
            error={fieldErrors.confirm_password}
            htmlFor="confirm_password"
          >
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              disabled={pending}
              invalid={Boolean(fieldErrors.confirm_password)}
              required
            />
          </Field>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={pending}>
            Cambiar contraseña
          </Button>
        </div>
      </form>
    </section>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.05em] text-ink-muted uppercase">
      {icon}
      {children}
    </h3>
  );
}
