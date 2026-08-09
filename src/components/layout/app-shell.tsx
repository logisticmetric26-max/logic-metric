"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, PanelLeftClose, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleNavItems, ROUTE_LABELS } from "@/components/layout/navigation";
import { Avatar } from "@/components/ui/avatar";
import { ProfileModal } from "@/features/profile/profile-modal";
import { PresenceHeartbeat } from "@/features/profile/presence-heartbeat";
import { avatarUrl } from "@/lib/avatar";
import type { CurrentUserContext } from "@/types/database.types";

/**
 * Estructura de la aplicación (§5).
 *
 *   Escritorio → barra lateral permanente y colapsable
 *   Móvil      → barra lateral en drawer, invocada desde la cabecera
 *
 * El cromo FLOTA: en escritorio la barra lateral y la cabecera son paneles de
 * cristal separados del borde de la ventana, con el ambiente visible alrededor.
 * Un panel pegado a los bordes se lee como una franja pintada; uno separado se
 * lee como una pieza por encima del contenido, que es exactamente lo que hace:
 * el contenido se desplaza por debajo.
 *
 * En móvil el cromo va a sangre a propósito: con 390 px de ancho, el margen
 * alrededor es espacio que le falta a los datos.
 */
export function AppShell({
  context,
  defaultCollapsed,
  supabaseUrl,
  children,
}: {
  context: CurrentUserContext;
  /** Base pública de Supabase, para componer la URL de la foto de perfil. */
  supabaseUrl: string;
  /**
   * Preferencia de barra lateral colapsada, leída de una cookie en el servidor.
   * Viene como prop —y no de `localStorage`— para que el primer render ya sea
   * el correcto: sin parpadeo de la barra ni desajuste de hidratación.
   */
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [profileOpen, setProfileOpen] = useState(false);

  const photo = avatarUrl(context.profile.avatar_path, supabaseUrl);

  function openProfile() {
    setProfileOpen(true);
    setMobileOpen(false);
  }

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

  return (
    // Sin fondo propio: el ambiente del `body` debe verse a través del cristal
    <div className="flex min-h-dvh lg:gap-3 lg:p-3">
      {/* ── Barra lateral de escritorio · panel de cristal flotante ────────── */}
      <aside
        className={cn(
          "liquid edge sticky top-3 hidden h-[calc(100dvh-1.5rem)] shrink-0 flex-col",
          "rounded-2xl shadow-[var(--shadow-floating)] lg:flex",
          "transition-[width] duration-300 ease-[var(--ease-emphasis)]",
          collapsed ? "w-[4.75rem]" : "w-[15.5rem]",
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          mainItems={mainItems}
          footerItems={footerItems}
          pathname={pathname}
          context={context}
          photo={photo}
          onOpenProfile={openProfile}
        />

        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "m-2 mt-0 flex items-center justify-center gap-2 rounded-xl py-2.5",
            "text-[12px] font-medium text-ink-muted",
            "transition-colors duration-200 hover:bg-fill-subtle hover:text-ink",
          )}
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

      {/* ── Barra lateral móvil ────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-scrim backdrop-blur-[3px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="liquid-thick edge animate-slide-in-right absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col shadow-[var(--shadow-overlay)]">
            <div className="flex items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-3">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar menú"
                className="-m-1 rounded-xl p-2 text-ink-muted transition-colors hover:bg-fill hover:text-ink"
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
              photo={photo}
              onOpenProfile={openProfile}
              hideBrand
              // Navegar cierra el menú: nadie quiere cerrarlo a mano cada vez
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Área principal ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Header
          context={context}
          photo={photo}
          onOpenMenu={() => setMobileOpen(true)}
          onOpenProfile={openProfile}
        />
        <main className="min-w-0 flex-1 px-4 pb-6 sm:px-6 lg:px-0">
          <div className="mx-auto w-full max-w-[1560px]">{children}</div>
        </main>
      </div>

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        context={context}
        supabaseUrl={supabaseUrl}
      />

      {/* Marca presencia mientras la pestaña esté visible */}
      <PresenceHeartbeat />
    </div>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5 overflow-hidden">
      {/* Degradado, reflejo interior y halo del propio color: el logotipo se lee
          como una pieza física iluminada, no como un cuadrado azul. */}
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          "bg-gradient-to-b from-brand-solid-from to-brand-solid-to text-[13px] font-bold tracking-tight text-white",
          "shadow-[inset_0_1px_0_0_rgb(255_255_255/0.4),0_2px_10px_-2px_rgb(10_108_255/0.55)]",
          "transition-transform duration-300 ease-[var(--ease-emphasis)] group-hover:scale-[1.06]",
        )}
      >
        LM
      </span>
      {!collapsed && (
        <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink">
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
  photo,
  onOpenProfile,
  hideBrand,
  onNavigate,
}: {
  collapsed: boolean;
  mainItems: ReturnType<typeof visibleNavItems>;
  footerItems: ReturnType<typeof visibleNavItems>;
  pathname: string;
  context: CurrentUserContext;
  photo: string | null;
  onOpenProfile: () => void;
  hideBrand?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {!hideBrand && (
        <div
          className={cn(
            "flex h-16 shrink-0 items-center",
            collapsed ? "justify-center px-2" : "px-4",
          )}
        >
          <Brand collapsed={collapsed} />
        </div>
      )}

      <nav className="scroll-area flex-1 overflow-y-auto px-2 pb-2" aria-label="Menú principal">
        {!collapsed && <SectionLabel>Operación</SectionLabel>}
        <ul className="flex flex-col gap-0.5">
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

        {footerItems.length > 0 && (
          <>
            {!collapsed && <SectionLabel className="pt-5">Administración</SectionLabel>}
            {collapsed && <div className="my-3 h-px bg-border" />}
            <ul className="flex flex-col gap-0.5">
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
          </>
        )}
      </nav>

      {/* Bloque de usuario · abre el perfil.
          Antes era texto muerto: mostraba quién eras y no llevaba a ninguna
          parte, con lo que la foto y la contraseña no tenían dónde vivir. */}
      <button
        type="button"
        onClick={onOpenProfile}
        aria-label="Abrir mi perfil"
        className={cn(
          "group mx-2 mb-[calc(0.5rem+env(safe-area-inset-bottom))] flex items-center gap-2.5 rounded-xl text-left",
          "transition-colors duration-200 hover:bg-fill-subtle",
          collapsed ? "justify-center p-2" : "px-2.5 py-2",
        )}
      >
        <Avatar name={context.profile.full_name} src={photo} size={collapsed ? "md" : "md"} />

        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-ink">
                {context.profile.full_name}
              </span>
              <span className="block truncate text-[11px] text-ink-muted">
                {context.profile.job_title}
              </span>
            </span>
            <Settings2
              className="size-4 shrink-0 text-ink-subtle transition-colors group-hover:text-ink-secondary"
              aria-hidden
            />
          </>
        )}
      </button>
    </>
  );
}

/** Encabezado de grupo: aporta jerarquía sin ocupar sitio. */
function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "px-3 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-ink-subtle uppercase",
        className,
      )}
    >
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
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium",
          "transition-all duration-200 ease-[var(--ease-standard)]",
          collapsed && "justify-center px-0",
          active
            ? // Pastilla con el tinte de marca y su propio canto: el elemento
              // seleccionado es la única pieza encendida de la barra.
              "bg-brand-50 text-brand-700 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.5)] ring-1 ring-brand-200"
            : "text-ink-secondary hover:bg-fill-subtle hover:text-ink",
        )}
      >
        <Icon
          className={cn(
            "size-[18px] shrink-0 transition-colors",
            active ? "text-brand-600" : "text-ink-muted group-hover:text-ink-secondary",
          )}
          aria-hidden
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    </li>
  );
}

function Header({
  context,
  photo,
  onOpenMenu,
  onOpenProfile,
}: {
  context: CurrentUserContext;
  photo: string | null;
  onOpenMenu: () => void;
  onOpenProfile: () => void;
}) {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname);

  return (
    <header
      className={cn(
        "liquid-thin edge sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3",
        "px-4 shadow-[var(--shadow-card)] sm:px-5",
        // Flotante en escritorio, a sangre en móvil
        "lg:top-3 lg:rounded-2xl",
      )}
    >
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menú"
        className="-ml-1 rounded-xl p-2 text-ink-secondary transition-colors hover:bg-fill hover:text-ink lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {/* Migas de pan: sólo desde tablet, en móvil el espacio es escaso */}
      <nav aria-label="Ruta" className="hidden min-w-0 flex-1 sm:block">
        <ol className="flex items-center gap-1 text-[13px]">
          {crumbs.map((crumb, index) => (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1">
              {index > 0 && (
                <ChevronRight className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
              )}
              {index === crumbs.length - 1 ? (
                <span className="truncate font-semibold text-ink" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate text-ink-muted transition-colors hover:text-ink"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Identidad · abre el perfil.
          Un solo destino desde los dos sitios donde aparece el usuario: antes
          este botón desplegaba un menú con la ficha en modo lectura y nada que
          hacer con ella. */}
      <div className="flex flex-1 justify-end sm:flex-none">
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Abrir mi perfil"
          className={cn(
            "group flex items-center gap-2.5 rounded-full py-1 pr-1 pl-1 sm:pr-3",
            "transition-colors duration-200 hover:bg-fill",
          )}
        >
          <Avatar name={context.profile.full_name} src={photo} size="md" />
          <span className="hidden text-left sm:block">
            <span className="block max-w-40 truncate text-[12.5px] font-medium text-ink">
              {context.profile.full_name}
            </span>
            <span className="block text-[11px] text-ink-muted">{context.profile.role_name}</span>
          </span>
        </button>
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
