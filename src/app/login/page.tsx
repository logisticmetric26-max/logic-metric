import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = {
  title: "Ingresar",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const { siguiente } = await searchParams;

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      {/*
        Ambiente propio del acceso, más intenso que el del área privada: es la
        superficie que el panel de cristal recoge por detrás. Sin esto, el
        formulario se vería como una tarjeta blanca sobre gris.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 size-[38rem] rounded-full bg-[radial-gradient(circle,rgb(10_108_255/0.22),transparent_66%)] blur-2xl" />
        <div className="absolute -right-40 -bottom-52 size-[42rem] rounded-full bg-[radial-gradient(circle,rgb(120_92_255/0.20),transparent_66%)] blur-2xl" />
        <div className="absolute top-1/3 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(7_116_173/0.16),transparent_66%)] blur-2xl" />
      </div>

      <div className="w-full max-w-[26rem]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-5 flex size-14 items-center justify-center rounded-lg bg-gradient-to-b from-brand-solid-from to-brand-solid-to text-[17px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.35),0_8px_24px_-6px_rgb(10_108_255/0.55)]">
            LM
          </span>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-ink">Logic Metric</h1>
          <p className="mt-2 text-[14px] text-ink-muted">
            Ingrese con su RUT y contraseña para continuar.
          </p>
        </div>

        {/* Panel de cristal: el material dominante del acceso */}
        <div className="liquid-thick edge relative rounded-xl p-6 shadow-[var(--shadow-overlay)] sm:p-7">
          <LoginForm nextPath={siguiente} />
        </div>

        <p className="mt-7 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          Acceso restringido · si no puede ingresar, contacte al administrador
        </p>
      </div>
    </main>
  );
}
