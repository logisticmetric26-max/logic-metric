"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { countUnread, mergeNotification } from "@/features/notifications/notification-kinds";
import type { NotificationRow } from "@/types/database.types";

/**
 * §Notificaciones · Estado global de avisos en tiempo real.
 *
 * Al montar, carga los últimos avisos y abre UN canal de Realtime para toda la
 * aplicación. Cuando llega un INSERT —lo empuja Supabase, ya filtrado por RLS—
 * el aviso se añade al frente y salta un toast. El contador de no leídos se
 * calcula contra una marca local de «última vez que abrí el panel».
 *
 * Un solo proveedor en el layout: así el canal no se duplica al navegar entre
 * páginas, y cada persona conectada comparte exactamente el mismo flujo.
 */
interface NotificationsContextValue {
  items: NotificationRow[];
  unread: number;
  markAllSeen: () => void;
  /** El canal está recibiendo eventos. */
  live: boolean;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const LAST_SEEN_KEY = "notifications-last-seen";

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  // El primer render debe coincidir entre servidor y cliente, así que la marca
  // guardada se lee tras montar. Se aplaza al siguiente turno del bucle de
  // eventos para no fijar estado en el cuerpo del efecto (cascada de renders).
  useEffect(() => {
    const id = window.setTimeout(() => {
      setLastSeen(window.localStorage.getItem(LAST_SEEN_KEY));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Evita que el toast salte por los avisos que ya existían al entrar: sólo los
  // que llegan DESPUÉS de la carga inicial son novedad.
  const loaded = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    void supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!active) return;
        setItems((data as NotificationRow[] | null) ?? []);
        loaded.current = true;
      });

    const channel = supabase
      .channel("notifications-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const incoming = payload.new as NotificationRow;
          setItems((current) => mergeNotification(current, incoming));

          // No molestar con lo que ya estaba antes de conectarse
          if (loaded.current) {
            toast.info(incoming.title);
          }
        },
      )
      .subscribe((status) => {
        if (active) setLive(status === "SUBSCRIBED");
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [toast]);

  const markAllSeen = useCallback(() => {
    const now = new Date().toISOString();
    window.localStorage.setItem(LAST_SEEN_KEY, now);
    setLastSeen(now);
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unread: countUnread(items, lastSeen),
      markAllSeen,
      live,
    }),
    [items, lastSeen, markAllSeen, live],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications debe usarse dentro de NotificationsProvider.");
  }
  return context;
}
