import { cookies } from "next/headers";
import { requireActiveUser } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";

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

  return (
    <AppShell context={context} defaultCollapsed={collapsed}>
      {children}
    </AppShell>
  );
}
