import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

/**
 * Los botones sólidos llevan un degradado vertical muy leve y un reflejo
 * interior superior. Es lo que separa un rectángulo de color de una superficie
 * con volumen; al pulsar, el reflejo se apaga y el botón «se hunde».
 */
const VARIANTS: Record<Variant, string> = {
  primary: cn(
    "bg-gradient-to-b from-brand-solid-from to-brand-solid-to text-white",
    "shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22),0_1px_2px_rgb(15_18_34/0.10),0_2px_8px_-2px_rgb(10_108_255/0.42)]",
    "hover:brightness-[1.08]",
    "active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.18)]",
    "disabled:opacity-60 disabled:shadow-none",
  ),
  secondary: cn(
    "bg-surface text-ink ring-1 ring-ring",
    "shadow-[inset_0_1px_0_0_rgb(255_255_255/0.9),0_1px_2px_rgb(15_18_34/0.05)]",
    "hover:bg-surface-subtle hover:ring-border-strong",
    "active:bg-surface-muted active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]",
  ),
  ghost: "text-ink-secondary hover:bg-fill hover:text-ink active:bg-fill-strong",
  danger: cn(
    "bg-gradient-to-b from-danger-solid-from to-danger-solid-to text-white",
    "shadow-[inset_0_1px_0_0_rgb(255_255_255/0.20),0_1px_2px_rgb(15_18_34/0.10),0_2px_8px_-2px_rgb(216_31_54/0.42)]",
    "hover:brightness-[1.06]",
    "active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.18)]",
  ),
  subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200",
};

const SIZES: Record<Size, string> = {
  // 36–44 px de alto: objetivo táctil cómodo sin engordar la interfaz
  sm: "h-9 px-3 text-[13px] gap-1.5 rounded-sm",
  md: "h-10 px-4 text-[13px] gap-2 rounded-md",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-md",
  icon: "h-10 w-10 justify-center rounded-md",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Muestra el spinner y bloquea el botón: evita el doble envío (§64). */
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    fullWidth,
    className,
    children,
    disabled,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      // Un botón en curso no admite un segundo clic, aunque el usuario insista
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium tracking-[-0.01em] whitespace-nowrap",
        "transition-all duration-200 ease-[var(--ease-standard)]",
        "active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-55 disabled:active:scale-100",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {size !== "icon" && children}
    </button>
  );
});
