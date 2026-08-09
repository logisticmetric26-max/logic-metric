import { cookies } from "next/headers";
import { requireActiveUser } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { getPublicEnv } from "@/lib/env";

/**
 * Área privada.
 *
 * `requireActiveUser()` resuelve aquí una sola vez por request (está memoizado
 * con `cache()`), de modo que ninguna página del área privada puede renderizarse
 * sin una sesión activa y no suspendida.
 */
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const [context, cookieStore] = await Promise.all([requireActiveUser(), cookies()]);

  // La preferencia del sidebar se lee en el servidor para que el primer render
  // ya sea el correcto, sin parpadeo al hidratar.
  const collapsed = cookieStore.get("sidebar-collapsed")?.value === "1";

  // La base pública de Supabase se pasa como prop en vez de leerla en el
  // cliente: así el componente que compone la URL de la foto no depende de una
  // variable de entorno inlineada y se puede probar con cualquier valor.
  const { supabaseUrl } = getPublicEnv();

  return (
    <AppShell context={context} defaultCollapsed={collapsed} supabaseUrl={supabaseUrl}>
      {children}
    </AppShell>
  );
}
