"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Bell,
  ClipboardCheck,
  CloudRain,
  Droplets,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/presence";
import { useNotifications } from "@/features/notifications/notifications-provider";
import { notificationMeta, type NotificationTone } from "@/features/notifications/notification-kinds";

const ICONS: Record<string, LucideIcon> = {
  LogOut,
  ClipboardCheck,
  Ban,
  CloudRain,
  Droplets,
  Bell,
};

const TONE_CLASS: Record<NotificationTone, string> = {
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success-50 text-success-700",
  danger: "bg-danger-50 text-danger-700",
  warning: "bg-warning-50 text-warning-700",
  info: "bg-info-50 text-info-700",
};

/**
 * §Notificaciones · Campana de la cabecera.
 *
 * El punto sólo late cuando hay avisos sin leer; al abrir el panel se marcan
 * como vistos y el contador se apaga. El «en vivo» de la cabecera del panel
 * confirma que el canal está recibiendo, sin que haya que fiarse de la fe.
 */
export function NotificationBell() {
  const router = useRouter();
  const { items, unread, markAllSeen, live } = useNotifications();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // El tiempo relativo se calcula tras montar para no desajustar la hidratación.
  // La primera lectura se aplaza un turno para no fijar estado en el cuerpo del
  // efecto; después se refresca cada 30 s.
  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  // Cerrar al pulsar fuera o con Escape
  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) markAllSeen();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `${unread} avisos sin leer` : "Notificaciones"}
        aria-expanded={open}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-full text-ink-secondary",
          "transition-colors hover:bg-fill hover:text-ink",
          open && "bg-fill text-ink",
        )}
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-[17px] items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-semibold text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="liquid-thick edge animate-pop-in absolute right-0 z-30 mt-2 flex max-h-[70vh] w-[21rem] max-w-[calc(100vw-2rem)] origin-top-right flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-overlay)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">Notificaciones</h3>
            <span
              className={cn(
                "flex items-center gap-1.5 text-[11px] font-medium",
                live ? "text-success-700" : "text-ink-subtle",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  live ? "animate-pulse bg-success-600" : "bg-ink-subtle",
                )}
              />
              {live ? "En vivo" : "Conectando…"}
            </span>
          </div>

          <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-[12.5px] text-ink-muted">
                Sin avisos por ahora. Aquí aparecerán las salidas a planta, cierres y demás en
                cuanto ocurran.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => {
                  const meta = notificationMeta(item.kind);
                  const Icon = ICONS[meta.icon] ?? Bell;

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={!item.href}
                        onClick={() => {
                          if (item.href) {
                            router.push(item.href);
                            setOpen(false);
                          }
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                          item.href ? "hover:bg-fill-subtle" : "cursor-default",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-full",
                            TONE_CLASS[meta.tone],
                          )}
                        >
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-medium text-ink">
                            {item.title}
                          </span>
                          {item.body && (
                            <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-muted">
                              {item.body}
                            </span>
                          )}
                          <span className="mt-1 flex items-center gap-2 text-[10.5px] text-ink-subtle">
                            {now ? timeAgo(new Date(item.created_at), now) : ""}
                            {item.actor_name && <span>· {item.actor_name}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
