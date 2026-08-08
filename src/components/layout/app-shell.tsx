"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRut } from "@/lib/auth/rut";
import { visibleNavItems, ROUTE_LABELS } from "@/components/layout/navigation";
import { signOutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import type { CurrentUserContext } from "@/types/database.types";

/**
 * Estructura de la aplicación (§5).
 *
 *   Escritorio → sidebar permanente y colapsable
 *   Móvil      → sidebar en drawer, invocado desde el header
 *
 * El contenido siempre ocupa el ancho restante y su desplazamiento es interno:
 * el `body` nunca desplaza en horizontal (§4).
 */
export function AppShell({
  context,
  defaultCollapsed,
  children,
}: {
  context: CurrentUserContext;
  /**
   * Preferencia de sidebar colapsado, leída de una cookie en el servidor.
   * Viene como prop —y no de `localStorage`— para que el primer render ya sea
   * el correcto: sin parpadeo del sidebar ni desajuste de hidratación.
   */
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const items = visibleNavItems(context.permissions);
  const mainItems = items.filter((item) => item.group === "main");
  const footerItems = items.filter((item) => item.group === "footer");

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    // Cookie en lugar de localStorage: el servidor puede leerla en el siguiente
    // render. `SameSite=Lax` basta para una preferencia de interfaz.
    document.cookie = `sidebar-collapsed=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
  }

  const navigation = (
    <SidebarContent
      collapsed={collapsed}
      mainItems={mainItems}
      footerItems={footerItems}
      pathname={pathname}
      context={context}
    />
  );

  return (
    // Sin fondo propio: el ambiente del `body` debe verse a través del cristal
    <div className="flex min-h-dvh">
      {/* Sidebar de escritorio · cristal fijo sobre el fondo ambiental */}
      <aside
        className={cn(
          "glass sticky top-0 hidden h-dvh shrink-0 border-r border-border lg:flex lg:flex-col",
          "transition-[width] duration-300 ease-[var(--ease-emphasis)]",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        {navigation}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center justify-center gap-2 border-t border-border py-3 text-xs font-medium text-ink-muted transition-colors hover:bg-black/[0.03] hover:text-ink"
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {collapsed ? (
            <ChevronRight className="size-4" aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="size-4" aria-hidden />
              Colapsar
            </>
          )}
        </button>
      </aside>

      {/* Sidebar móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="glass-strong animate-slide-in-right absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border shadow-[var(--shadow-overlay)]">
            <div className="safe-top flex items-center justify-between border-b border-border px-4 py-3">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar menú"
                className="-m-1 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-black/[0.05] hover:text-ink"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <SidebarContent
              collapsed={false}
              mainItems={mainItems}
              footerItems={footerItems}
              pathname={pathname}
              context={context}
              hideBrand
              // Navegar cierra el menú: nadie quiere cerrarlo a mano cada vez
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Área principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header context={context} onOpenMenu={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5 overflow-hidden">
      {/* Degradado + reflejo interior: el logotipo lee como una pieza física */}
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-brand-500 to-brand-700 text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.35),0_2px_6px_-1px_rgb(10_108_255/0.45)] transition-transform duration-300 ease-[var(--ease-emphasis)] group-hover:scale-105">
        LM
      </span>
      {!collapsed && (
        <span className="truncate text-[15px] font-semibold tracking-[-0.015em] text-ink">
          Logic Metric
        </span>
      )}
    </Link>
  );
}

function SidebarContent({
  collapsed,
  mainItems,
  footerItems,
  pathname,
  context,
  hideBrand,
  onNavigate,
}: {
  collapsed: boolean;
  mainItems: ReturnType<typeof visibleNavItems>;
  footerItems: ReturnType<typeof visibleNavItems>;
  pathname: string;
  context: CurrentUserContext;
  hideBrand?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {!hideBrand && (
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-border",
            collapsed ? "justify-center px-2" : "px-4",
          )}
        >
          <Brand collapsed={collapsed} />
        </div>
      )}

      <nav className="scroll-area flex-1 overflow-y-auto p-2" aria-label="Menú principal">
        {!collapsed && <SectionLabel>Operación</SectionLabel>}
        <ul className="flex flex-col gap-1">
          {mainItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      </nav>

      {footerItems.length > 0 && (
        <div className="border-t border-border p-2">
          {!collapsed && <SectionLabel>Administración</SectionLabel>}
          <ul className="flex flex-col gap-1">
            {footerItems.map((item) => (
              <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
            ))}
          </ul>
        </div>
      )}

      {!collapsed && (
        <div className="safe-bottom border-t border-border px-4 py-3">
          <p className="truncate text-[13px] font-medium text-ink">{context.profile.full_name}</p>
          <p className="truncate text-xs text-ink-muted">{context.profile.job_title}</p>
        </div>
      )}
    </>
  );
}

/** Encabezado de grupo del sidebar: aporta jerarquía sin ocupar sitio. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-1 pb-2 text-[10px] font-semibold tracking-[0.07em] text-ink-subtle uppercase">
      {children}
    </p>
  );
}

function NavLink({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: ReturnType<typeof visibleNavItems>[number];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium",
          "transition-all duration-200 ease-[var(--ease-standard)]",
          collapsed && "justify-center px-0",
          active
            ? // Activo: pastilla blanca elevada, como el ítem seleccionado del Finder
              "bg-white text-brand-700 shadow-[0_1px_2px_rgb(15_18_34/0.06),0_2px_8px_-2px_rgb(15_18_34/0.08)] ring-1 ring-black/[0.04]"
            : "text-ink-secondary hover:bg-black/[0.04] hover:text-ink",
        )}
      >
        <Icon
          className={cn("size-[18px] shrink-0", active ? "text-brand-600" : "text-ink-muted")}
          aria-hidden
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    </li>
  );
}

function Header({
  context,
  onOpenMenu,
}: {
  context: CurrentUserContext;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const crumbs = buildBreadcrumbs(pathname);

  return (
    <header className="glass safe-top sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menú"
        className="-ml-1 rounded-lg p-1.5 text-ink-secondary transition-colors hover:bg-black/[0.05] hover:text-ink lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {/* Migas de pan: sólo desde tablet, en móvil el espacio es escaso */}
      <nav aria-label="Ruta" className="hidden min-w-0 flex-1 sm:block">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((crumb, index) => (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && (
                <ChevronLeft className="size-3.5 rotate-180 text-ink-subtle" aria-hidden />
              )}
              {index === crumbs.length - 1 ? (
                <span className="truncate font-medium text-ink" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="truncate text-ink-muted hover:text-ink">
                  {crumb.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-1 justify-end sm:flex-none">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-black/[0.05]"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-b from-brand-500 to-brand-700 text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.3),0_1px_3px_-1px_rgb(10_108_255/0.5)]">
              <User className="size-4" aria-hidden />
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-40 truncate text-[13px] font-medium text-ink">
                {context.profile.full_name}
              </span>
              <span className="block text-[11px] text-ink-muted">{context.profile.role_name}</span>
            </span>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
              <div
                role="menu"
                className="glass-strong animate-pop-in absolute right-0 z-20 mt-2 w-64 origin-top-right rounded-2xl border border-border p-1.5 shadow-[var(--shadow-overlay)]"
              >
                <div className="border-b border-border px-3 py-2.5">
                  <p className="truncate text-sm font-medium text-ink">
                    {context.profile.full_name}
                  </p>
                  <p className="text-xs text-ink-muted">{formatRut(context.profile.rut)}</p>
                  <p className="mt-1 truncate text-xs text-ink-muted">
                    {context.profile.job_title}
                  </p>
                  <p className="mt-1.5 text-xs text-ink-subtle">
                    {context.profile.has_global_access
                      ? "Acceso a todos los terminales"
                      : `${context.terminals.length} terminal${context.terminals.length === 1 ? "" : "es"} autorizado${context.terminals.length === 1 ? "" : "s"}`}
                  </p>
                </div>

                <form action={signOutAction} className="pt-1.5">
                  <Button
                    type="submit"
                    variant="ghost"
                    fullWidth
                    className="justify-start"
                    icon={<LogOut className="size-4" aria-hidden />}
                  >
                    Cerrar sesión
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function buildBreadcrumbs(pathname: string): { href: string; label: string }[] {
  const segments = pathname.split("/").filter(Boolean);

  return segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    // Los UUID en la ruta se muestran como «Detalle», no como un identificador
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment);
    const label = isId ? "Detalle" : (ROUTE_LABELS[segment] ?? segment);
    return { href, label };
  });
}
