import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Bell, Check, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

export function NotificationBell({ variant = "icon" }: { variant?: "icon" | "sidebar" }) {
  const navigate = useNavigate();
  const { profileId } = useTeam();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = async () => {
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
  };

  useEffect(() => {
    fetchNotifications();
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel("notifications-" + profileId)
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
  }, [profileId]);

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
      <PopoverTrigger asChild>
        {variant === "sidebar" ? (
          <button className="flex items-center gap-3 w-full text-left">
            <Bell className="h-4 w-4" />
            <span className="flex-1">Notificações</span>
            {unreadCount > 0 && (
              <span className="h-5 min-w-[20px] px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        ) : (
          <button className="relative p-2 rounded-xl hover:bg-accent/60 transition-colors">
            <Bell className="h-4.5 w-4.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4.5 min-w-[18px] px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 rounded-2xl border-border/50" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <h3 className="text-sm font-semibold">Notificações</h3>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={markAllRead}>
                <Check className="h-3 w-3" /> Ler tudo
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={clearAll}>
                <Trash2 className="h-3 w-3" /> Limpar
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma notificação</div>
          ) : (
            <div className="divide-y divide-border/30">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors ${
                    !n.read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {n.sender_profile ? (
                      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        <AvatarImage src={n.sender_profile.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {(n.sender_profile.full_name || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-1.5">
                        {!n.read && <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{n.title}</p>
                          {n.sender_profile?.full_name && (
                            <p className="text-[10px] text-muted-foreground">
                              por {n.sender_profile.full_name}
                            </p>
                          )}
                        </div>
                      </div>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
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
