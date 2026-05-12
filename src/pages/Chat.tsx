import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Hash, Church } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Message {
  id: string;
  team_id: string;
  culto_id: string | null;
  sender_profile_id: string;
  content: string;
  created_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null };
}

export default function Chat() {
  const { currentTeam, profileId, loading: teamLoading } = useTeam();
  const [activeCultoId, setActiveCultoId] = useState<string | null>(null); // null = general chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch upcoming cultos for channel list
  const { data: cultos = [] } = useQuery({
    queryKey: ["chat-cultos", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("cultos")
        .select("id, name, date")
        .eq("team_id", currentTeam.id)
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(10);
      return data ?? [];
    },
    enabled: !!currentTeam,
  });

  // Fetch messages for the active channel
  const fetchMessages = async () => {
    if (!currentTeam) return;
    let query = supabase
      .from("messages")
      .select("*, profiles:sender_profile_id(full_name, avatar_url)")
      .eq("team_id", currentTeam.id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (activeCultoId) {
      query = query.eq("culto_id", activeCultoId);
    } else {
      query = query.is("culto_id", null);
    }

    const { data } = await query;
    setMessages((data as Message[]) ?? []);
  };

  useEffect(() => {
    if (teamLoading || !currentTeam) return;
    fetchMessages();
  }, [teamLoading, currentTeam, activeCultoId]);

  // Realtime subscription
  useEffect(() => {
    if (!currentTeam) return;

    const channel = supabase
      .channel("chat-" + currentTeam.id + "-" + (activeCultoId || "general"))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `team_id=eq.${currentTeam.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as any;
          // Only add if it matches the active channel
          if (activeCultoId && newMsg.culto_id !== activeCultoId) return;
          if (!activeCultoId && newMsg.culto_id !== null) return;

          // Fetch the sender profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", newMsg.sender_profile_id)
            .single();

          setMessages((prev) => [
            ...prev,
            { ...newMsg, profiles: profile } as Message,
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTeam, activeCultoId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !currentTeam || !profileId || sending) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      team_id: currentTeam.id,
      culto_id: activeCultoId,
      sender_profile_id: profileId,
      content: newMessage.trim(),
    } as any);
    if (!error) setNewMessage("");
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (teamLoading) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-10 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  // Group messages by date
  const groupedMessages: { date: string; msgs: Message[] }[] = [];
  messages.forEach((msg) => {
    const date = format(new Date(msg.created_at), "yyyy-MM-dd");
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === date) {
      last.msgs.push(msg);
    } else {
      groupedMessages.push({ date, msgs: [msg] });
    }
  });

  const activeChannelName = activeCultoId
    ? cultos.find((c: any) => c.id === activeCultoId)?.name ?? "Culto"
    : "Geral";

  return (
    <div className="max-w-6xl mx-auto animate-in-up h-full flex flex-col overflow-hidden">
      <h1 className="text-2xl font-semibold tracking-tight mb-4 shrink-0">Chat</h1>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Desktop channel sidebar */}
        <div className="hidden lg:flex flex-col w-56 shrink-0">
          <GlassCard className="p-2 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">Canais</p>
            <button
              onClick={() => setActiveCultoId(null)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeCultoId === null
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <Hash className="h-4 w-4" /> Geral
            </button>
            {cultos.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setActiveCultoId(c.id)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left ${
                  activeCultoId === c.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <Church className="h-4 w-4 shrink-0" />
                <span className="truncate">{c.name}</span>
                <span className="text-[10px] opacity-60 shrink-0 ml-auto">
                  {format(new Date(c.date + "T12:00:00"), "dd/MM")}
                </span>
              </button>
            ))}
          </GlassCard>
        </div>

        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Mobile channel pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-3 scrollbar-hide shrink-0 lg:hidden">
            <button
              onClick={() => setActiveCultoId(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                activeCultoId === null
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-accent/50 text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              <Hash className="h-3 w-3" /> Geral
            </button>
            {cultos.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setActiveCultoId(c.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                  activeCultoId === c.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-accent/50 text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                <Church className="h-3 w-3" />
                {c.name}
                <span className="opacity-60">
                  {format(new Date(c.date + "T12:00:00"), "dd/MM")}
                </span>
              </button>
            ))}
          </div>

          {/* Chat area */}
          <GlassCard className="flex flex-col flex-1 min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">
                    Nenhuma mensagem em <span className="font-medium">{activeChannelName}</span>. Comece a conversa!
                  </p>
                </div>
              ) : (
                groupedMessages.map((group) => (
                  <div key={group.date}>
                    <div className="flex items-center justify-center my-3">
                      <span className="text-[10px] text-muted-foreground bg-accent/60 px-2.5 py-0.5 rounded-full">
                        {format(new Date(group.date + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                      </span>
                    </div>
                    {group.msgs.map((msg, i) => {
                      const isMe = msg.sender_profile_id === profileId;
                      const profile = msg.profiles as any;
                      const prevMsg = i > 0 ? group.msgs[i - 1] : null;
                      const sameAsPrev = prevMsg?.sender_profile_id === msg.sender_profile_id;
                      const initials = profile?.full_name
                        ?.split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() ?? "?";

                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""} ${sameAsPrev ? "mt-0.5" : "mt-3"}`}
                        >
                          {!isMe && !sameAsPrev ? (
                            <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                              <AvatarFallback className="text-[9px] bg-accent">{initials}</AvatarFallback>
                            </Avatar>
                          ) : !isMe ? (
                            <div className="w-7 shrink-0" />
                          ) : null}
                          <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                            {!sameAsPrev && !isMe && (
                              <p className="text-[10px] font-medium text-muted-foreground mb-0.5 ml-1">
                                {profile?.full_name ?? "Usuário"}
                              </p>
                            )}
                            <div
                              className={`px-3 py-1.5 rounded-2xl text-sm leading-relaxed ${
                                isMe
                                  ? "bg-primary text-primary-foreground rounded-tr-md"
                                  : "bg-accent text-accent-foreground rounded-tl-md"
                              }`}
                            >
                              {msg.content}
                            </div>
                            <p className={`text-[9px] text-muted-foreground mt-0.5 ${isMe ? "text-right mr-1" : "ml-1"}`}>
                              {format(new Date(msg.created_at), "HH:mm")}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border/50 shrink-0">
              <div className="flex gap-2 items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Mensagem em ${activeChannelName}...`}
                  className="flex-1 bg-accent/40 border border-border/50 rounded-xl px-3.5 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                />
                <Button
                  size="icon"
                  className="rounded-xl h-9 w-9 shrink-0"
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>{/* end flex-1 */}
      </div>{/* end flex */}
    </div>
  );
}
