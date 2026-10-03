import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { PopoverAnchor } from "@radix-ui/react-popover";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Bell, Check, Trash2, MessageSquareText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ToolbarButton } from "@/components/shell/ToolbarButton";
import { useBlockedIds } from "@/components/chat/useBlockedUsers";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SenderProfile {
  full_name: string | null;
  avatar_url: string | null;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
  sender_profile_id: string | null;
  sender_profile: SenderProfile | null;
}

interface NotificationBellProps {
  variant?: "icon" | "sidebar" | "toolbar";
  /** Abertura controlada (ex.: aberto pelo item "Notificações" do menu da barra superior). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Troca o botão por uma âncora: o popover abre a partir do que `anchor` renderizar. */
  anchor?: (unreadCount: number) => ReactNode;
}

export function NotificationBell({ variant = "icon", open: openProp, onOpenChange, anchor }: NotificationBellProps) {
  const navigate = useNavigate();
  const { profileId } = useTeam();
  const [allNotifications, setNotifications] = useState<Notification[]>([]);
  // Avisos escritos por quem você bloqueou ("Enviar aviso ao time") não aparecem,
  // como as mensagens dessa pessoa no chat. Avisos do sistema (escala etc.) ficam.
  const { ids: blockedIds } = useBlockedIds(profileId);
  const notifications = useMemo(
    () => allNotifications.filter((n) => !(n.type === "manual" && n.sender_profile_id && blockedIds.has(n.sender_profile_id))),
    [allNotifications, blockedIds],
  );
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setOpenState(v);
    onOpenChange?.(v);
  };
  // O shell monta mais de um sino (barra lateral + barra superior/Início). O supabase-js
  // reaproveita canais com o mesmo nome, e o removeChannel de um derrubaria o do outro.
  const channelKey = useRef(Math.random().toString(36).slice(2, 10));

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!profileId) return;
    const { data } = await supabase
      .from("notifications")
      .select("*, sender_profile:profiles!notifications_sender_profile_id_fkey(full_name, avatar_url)")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(20);

    const mapped = (data ?? []).map((n: any) => ({
      ...n,
      sender_profile: n.sender_profile ?? null,
    }));
    setNotifications(mapped);
  }, [profileId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!profileId) { setNotifications([]); return; }
    const refresh = () => { void fetchNotifications(); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [profileId, fetchNotifications]);

  useEffect(() => { if (open) void fetchNotifications(); }, [open, fetchNotifications]);

  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel("notifications-" + profileId + "-" + channelKey.current)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${profileId}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId, fetchNotifications]);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true } as any).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    if (!profileId) return;
    await supabase.from("notifications").update({ read: true } as any).eq("profile_id", profileId).eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = async () => {
    if (!profileId) return;
    await supabase.from("notifications").delete().eq("profile_id", profileId);
    setNotifications([]);
  };

  const handleClick = (n: Notification) => {
    if (!n.read) markAsRead(n.id);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {anchor ? (
        <PopoverAnchor asChild>
          <div>{anchor(unreadCount)}</div>
        </PopoverAnchor>
      ) : (
      <PopoverTrigger asChild>
        {variant === "toolbar" ? (
          // Barra superior (iOS 27): círculo de vidro com o contador vermelho padrão do sistema.
          <ToolbarButton
            aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : "Notificações"}
            icon={<Bell strokeWidth={2.2} />}
          >
            {unreadCount > 0 && (
              <span className="absolute z-[5] -top-1 -right-1 h-[18px] min-w-[18px] px-1 flex items-center justify-center rounded-full bg-ios-red text-white text-[11px] font-semibold leading-none" aria-hidden="true">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </ToolbarButton>
        ) : variant === "sidebar" ? (
          <button className="flex items-center gap-3 w-full text-left">
            <Bell className="h-[19px] w-[19px]" aria-hidden="true" />
            <span className="flex-1">Notificações</span>
            {unreadCount > 0 && (
              <span className="h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full bg-ios-red text-white text-[11px] font-semibold leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        ) : (
          <button className="relative p-2 rounded-xl hover:bg-accent/60 transition-colors">
            <Bell className="h-4.5 w-4.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-[18px] min-w-[18px] px-1 flex items-center justify-center rounded-full bg-ios-red text-white text-[11px] font-semibold leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}
      </PopoverTrigger>
      )}
      <PopoverContent
        className="w-[340px] max-w-[calc(100vw-2rem)] p-0"
        // Barra lateral: abre ao lado dela, sem cobrir a navegação. Celular: margem de 16pt como os menus.
        side={variant === "sidebar" ? "right" : "bottom"}
        align={anchor ? "start" : "end"}
        sideOffset={variant === "sidebar" ? 36 : 8}
        collisionPadding={16}
      >
        <div className="flex items-center justify-between pl-4 pr-2 py-2 border-b border-separator">
          <h3 className="text-headline">Notificações</h3>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-subhead gap-1" onClick={markAllRead}>
                <Check className="h-4 w-4" /> Ler tudo
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="text-subhead gap-1 text-ios-red" onClick={clearAll}>
                <Trash2 className="h-4 w-4" /> Limpar
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-center">
              <Bell className="h-7 w-7 text-label-tertiary" aria-hidden="true" />
              <p className="text-body text-muted-foreground">Nenhuma notificação</p>
            </div>
          ) : (
            <div>
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  // Separador recuado até o texto (16 + avatar 32 + 10), como nas listas iOS.
                  className="relative w-full text-left px-4 py-3 hover:bg-fill-quaternary active:bg-fill-tertiary transition-colors before:absolute before:top-0 before:right-0 before:left-[58px] before:border-t before:border-separator first:before:hidden"
                >
                  <div className="flex items-start gap-2.5">
                    {n.sender_profile ? (
                      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                        <AvatarImage src={n.sender_profile.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {(n.sender_profile.full_name || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-fill-tertiary flex items-center justify-center shrink-0 mt-0.5">
                        <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-1.5">
                        {!n.read && <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-ios-blue shrink-0" aria-label="Não lida" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-subhead font-semibold">{n.title}</p>
                          {n.type === "support_feedback" && <p className="flex items-center gap-1 text-caption1 text-muted-foreground"><MessageSquareText size={11} />Equipe +Louvor</p>}
                          {n.type !== "support_feedback" && n.sender_profile?.full_name && (
                            <p className="text-caption1 text-muted-foreground">
                              por {n.sender_profile.full_name}
                            </p>
                          )}
                        </div>
                      </div>
                      {n.body && <p className="text-footnote text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-caption1 text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
