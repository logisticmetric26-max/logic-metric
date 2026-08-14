"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LayoutGrid, PanelLeftClose, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleNavItems, ROUTE_LABELS, type NavItem } from "@/components/layout/navigation";
import { Avatar } from "@/components/ui/avatar";
import { ProfileModal } from "@/features/profile/profile-modal";
import { PresenceHeartbeat } from "@/features/profile/presence-heartbeat";
import { NotificationsProvider } from "@/features/notifications/notifications-provider";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { avatarUrl } from "@/lib/avatar";
import type { CurrentUserContext } from "@/types/database.types";

/**
 * Estructura de la aplicación (§5).
 *
 *   Escritorio → barra lateral de cristal flotante, permanente y colapsable.
 *   Móvil      → cabecera compacta + BARRA INFERIOR tipo app, con las secciones
 *                al alcance del pulgar; lo secundario vive tras «Más».
 *
 * El cromo FLOTA: en escritorio la barra lateral y la cabecera son paneles de
 * cristal separados del borde, con el ambiente visible alrededor. En móvil van
 * a sangre, donde cada píxel de margen es espacio que le falta a los datos.
 *
 * Todo el árbol queda envuelto en el proveedor de notificaciones: un único
 * canal de tiempo real compartido por toda la sesión.
 */
export function AppShell({
  context,
  defaultCollapsed,
  supabaseUrl,
  children,
}: {
  context: CurrentUserContext;
  supabaseUrl: string;
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
    document.cookie = `sidebar-collapsed=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
  }

  return (
    <NotificationsProvider>
      <div className="flex min-h-dvh lg:gap-3 lg:p-3">
        {/* ── Barra lateral de escritorio ─────────────────────────────────── */}
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

        {/* ── Cajón «Más» de móvil (secciones de administración + perfil) ──── */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="animate-fade-in absolute inset-0 bg-scrim backdrop-blur-[3px]"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <div className="liquid-thick edge animate-slide-up absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col rounded-t-2xl pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-overlay)]">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <Brand />
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Cerrar"
                  className="-m-1 rounded-xl p-2 text-ink-muted transition-colors hover:bg-fill hover:text-ink"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              <div className="scroll-area min-h-0 overflow-y-auto px-2 pb-3">
                <SidebarContent
                  collapsed={false}
                  mainItems={mainItems}
                  footerItems={footerItems}
                  pathname={pathname}
                  context={context}
                  photo={photo}
                  onOpenProfile={openProfile}
                  hideBrand
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Área principal ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Header
            context={context}
            photo={photo}
            onOpenProfile={openProfile}
          />
          <main className="min-w-0 flex-1 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-0 lg:pb-6">
            <div className="mx-auto w-full max-w-[1560px]">{children}</div>
          </main>
        </div>

        {/* ── Barra inferior de móvil ────────────────────────────────────── */}
        <BottomNav
          mainItems={mainItems}
          hasMore={footerItems.length > 0}
          pathname={pathname}
          onOpenMore={() => setMobileOpen(true)}
          moreActive={mobileOpen}
        />

        <ProfileModal
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          context={context}
          supabaseUrl={supabaseUrl}
        />

        <PresenceHeartbeat />
      </div>
    </NotificationsProvider>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5 overflow-hidden">
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
  mainItems: NavItem[];
  footerItems: NavItem[];
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
        <Avatar name={context.profile.full_name} src={photo} size="md" />

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
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, item.href);
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
            ? "bg-brand-50 text-brand-700 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.5)] ring-1 ring-brand-200"
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
  onOpenProfile,
}: {
  context: CurrentUserContext;
  photo: string | null;
  onOpenProfile: () => void;
}) {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname);

  return (
    <header
      className={cn(
        "liquid-thin edge sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2",
        "px-4 shadow-[var(--shadow-card)] sm:px-5",
        "lg:top-3 lg:rounded-2xl",
      )}
    >
      {/* Marca compacta en móvil: sin barra lateral, es el ancla de identidad */}
      <div className="lg:hidden">
        <Brand collapsed />
      </div>

      {/* Migas de pan desde tablet */}
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

      <div className="flex flex-1 items-center justify-end gap-1 sm:flex-none">
        <NotificationBell />

        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Abrir mi perfil"
          className={cn(
            "group flex items-center gap-2.5 rounded-full p-1 sm:pr-3",
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

/**
 * §5 · Barra inferior de móvil, tipo aplicación.
 *
 * Las secciones principales al alcance del pulgar; lo administrativo, tras
 * «Más». Sólo aparece en móvil —en escritorio manda la barra lateral—, flota
 * sobre el contenido como cristal y respeta el área segura del iPhone.
 */
function BottomNav({
  mainItems,
  hasMore,
  pathname,
  onOpenMore,
  moreActive,
}: {
  mainItems: NavItem[];
  hasMore: boolean;
  pathname: string;
  onOpenMore: () => void;
  moreActive: boolean;
}) {
  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "liquid-thick edge fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "flex items-stretch justify-around gap-1 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]",
        "shadow-[0_-4px_20px_-6px_rgb(16_20_38/0.14)]",
      )}
    >
      {mainItems.map((item) => (
        <BottomTab
          key={item.href}
          href={item.href}
          icon={item.icon}
          label={shortLabel(item.label)}
          active={isActive(pathname, item.href)}
        />
      ))}

      {hasMore && (
        <BottomTab
          icon={LayoutGrid}
          label="Más"
          active={moreActive}
          onClick={onOpenMore}
        />
      )}
    </nav>
  );
}

function BottomTab({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href?: string;
  icon: NavItem["icon"];
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          "flex h-8 w-full max-w-[64px] items-center justify-center rounded-full transition-colors",
          active ? "bg-brand-50 text-brand-600" : "text-ink-muted",
        )}
      >
        <Icon className="size-[20px]" aria-hidden />
      </span>
      <span
        className={cn(
          "text-[10.5px] leading-none font-medium",
          active ? "text-brand-700" : "text-ink-muted",
        )}
      >
        {label}
      </span>
    </>
  );

  const className = "flex min-w-0 flex-1 flex-col items-center gap-1 pt-1";

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={className}>
        {content}
      </button>
    );
  }

  return (
    <Link href={href ?? "#"} aria-current={active ? "page" : undefined} className={className}>
      {content}
    </Link>
  );
}

/** Etiqueta corta para la barra inferior: una palabra entra, dos no. */
function shortLabel(label: string): string {
  const map: Record<string, string> = {
    "Revision Tecnica": "Revisión",
    "Lavado Buses": "Lavado",
  };
  return map[label] ?? label.split(" ")[0];
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function buildBreadcrumbs(pathname: string): { href: string; label: string }[] {
  const segments = pathname.split("/").filter(Boolean);

  return segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment);
    const label = isId ? "Detalle" : (ROUTE_LABELS[segment] ?? segment);
    return { href, label };
  });
}
