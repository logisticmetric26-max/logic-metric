import { forwardRef, useId } from "react";
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTROL_BASE = cn(
  "w-full rounded-[10px] bg-surface px-3 text-ink",
  "ring-1 ring-inset",
  "placeholder:text-ink-subtle",
  "transition-[box-shadow,background-color] duration-200 ease-[var(--ease-standard)]",
  // El foco se marca con un halo suave, no con un borde duro
  "focus:outline-none",
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted disabled:ring-black/[0.05]",
  // 16px en móvil evita que iOS haga zoom al enfocar el campo
  "text-base sm:text-[13px]",
);

const CONTROL_TONE = {
  normal: cn(
    "ring-black/[0.10] shadow-[inset_0_1px_2px_rgb(15_18_34/0.04)]",
    "hover:ring-black/[0.16]",
    "focus:ring-2 focus:ring-brand-500 focus:shadow-[0_0_0_4px_rgb(10_108_255/0.12)]",
  ),
  error: cn(
    "ring-danger-600 shadow-[inset_0_1px_2px_rgb(15_18_34/0.04)]",
    "focus:ring-2 focus:ring-danger-600 focus:shadow-[0_0_0_4px_rgb(216_31_54/0.12)]",
  ),
};

export function Label({
  className,
  required,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("text-[13px] font-medium text-ink-secondary", className)} {...props}>
      {children}
      {required && (
        <span className="ml-0.5 text-danger-600" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/** Envoltura de etiqueta + control + mensaje de error. */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-danger-600" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : (
        hint && <p className="text-[12px] leading-snug text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leading?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leading, ...props },
  ref,
) {
  const control = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        "h-10",
        invalid ? CONTROL_TONE.error : CONTROL_TONE.normal,
        leading && "pl-9",
        className,
      )}
      {...props}
    />
  );

  if (!leading) return control;

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-subtle">
        {leading}
      </span>
      {control}
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        "resize-y py-2",
        invalid ? CONTROL_TONE.error : CONTROL_TONE.normal,
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        "h-10 appearance-none bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat pr-9",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke-width=%272%27 stroke=%27%2364748b%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 d=%27m19.5 8.25-7.5 7.5-7.5-7.5%27/%3E%3C/svg%3E')]",
        invalid ? CONTROL_TONE.error : CONTROL_TONE.normal,
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

/** Casilla con etiqueta, con área de clic cómoda en móvil. */
export function Checkbox({
  label,
  description,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-[10px] p-2 -m-2",
        "transition-colors hover:bg-black/[0.035]",
        className,
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border-strong text-brand-600 accent-brand-600"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-muted">{description}</span>}
      </span>
    </label>
  );
}
