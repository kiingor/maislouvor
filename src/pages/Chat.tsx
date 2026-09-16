import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Hash, Church, Settings, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { ChatEmojiPicker } from "@/components/ChatEmojiPicker";
import { ChatChannelsModal, CustomChannel } from "@/components/ChatChannelsModal";
import { ChatAudioRecorder } from "@/components/ChatAudioRecorder";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";

interface Message {
  id: string;
  team_id: string;
  culto_id: string | null;
  channel_id: string | null;
  message_type: string;
  attachment_path: string | null;
  sender_profile_id: string;
  content: string | null;
  created_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null };
}

// Active channel selection. Exactly one of these shapes is active at a time.
type ActiveChannel =
  | { kind: "general" }
  | { kind: "custom"; id: string }
  | { kind: "culto"; id: string };

export default function Chat() {
  const { currentTeam, profileId, can, loading: teamLoading } = useTeam();
  const canEdit = can("chat", "editar");
  const { toast } = useToast();
  const [active, setActive] = useState<ActiveChannel>({ kind: "general" });
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [channelsModalOpen, setChannelsModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

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

  // Fetch custom channels for the team
  const { data: customChannels = [], refetch: refetchChannels } = useQuery({
    queryKey: ["chat-channels", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("channels" as any)
        .select("id, team_id, name, description, sort_order")
        .eq("team_id", currentTeam.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      return (data as unknown as CustomChannel[]) ?? [];
    },
    enabled: !!currentTeam,
  });

  // If the active custom channel was deleted, fall back to "Geral".
  useEffect(() => {
    if (active.kind === "custom" && !customChannels.some((c) => c.id === active.id)) {
      setActive({ kind: "general" });
    }
  }, [customChannels, active]);

  // Realtime subscription on channels list so the sidebar updates for everyone.
  useEffect(() => {
    if (!currentTeam) return;
    const ch = supabase
      .channel("chat-channels-" + currentTeam.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channels", filter: `team_id=eq.${currentTeam.id}` },
        () => refetchChannels()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [currentTeam, refetchChannels]);

  // Decide whether a message belongs to the currently active channel.
  const matchesActive = (m: { culto_id: string | null; channel_id: string | null }) => {
    if (active.kind === "general") return !m.culto_id && !m.channel_id;
    if (active.kind === "custom") return m.channel_id === active.id;
    return m.culto_id === active.id; // culto
  };

  // Fetch messages for the active channel
  const fetchMessages = async () => {
    if (!currentTeam) return;
    let query = supabase
      .from("messages")
      .select("*, profiles:sender_profile_id(full_name, avatar_url)")
      .eq("team_id", currentTeam.id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (active.kind === "general") {
      query = query.is("culto_id", null).is("channel_id", null as any);
    } else if (active.kind === "custom") {
      query = query.eq("channel_id" as any, active.id);
    } else {
      query = query.eq("culto_id", active.id);
    }

    const { data } = await query;
    setMessages((data as unknown as Message[]) ?? []);
  };

  useEffect(() => {
    if (teamLoading || !currentTeam) return;
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamLoading, currentTeam, active]);

  // Realtime subscription for messages
  useEffect(() => {
    if (!currentTeam) return;

    const channel = supabase
      .channel("chat-msgs-" + currentTeam.id + "-" + JSON.stringify(active))
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
          if (!matchesActive(newMsg)) return;

          // Fetch the sender profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", newMsg.sender_profile_id)
            .single();

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, profiles: profile } as Message];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTeam, active]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Base insert payload for the active channel.
  const channelFields = () => ({
    team_id: currentTeam!.id,
    culto_id: active.kind === "culto" ? active.id : null,
    channel_id: active.kind === "custom" ? active.id : null,
    sender_profile_id: profileId,
  });

  const handleSend = async () => {
    if (!newMessage.trim() || !currentTeam || !profileId || sending) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      ...channelFields(),
      message_type: "text",
      content: newMessage.trim(),
    } as any);
    if (error) {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    } else {
      setNewMessage("");
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  // Upload a file to the chat bucket and insert a message of the given type.
  const uploadAttachment = async (file: Blob, fileName: string, type: "image" | "audio") => {
    if (!currentTeam || !profileId || uploading) return;
    setUploading(true);
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${currentTeam.id}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("chat")
      .upload(path, file, { contentType: (file as any).type || undefined });
    if (upErr) {
      toast({ title: "Erro ao enviar anexo", description: upErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { error } = await supabase.from("messages").insert({
      ...channelFields(),
      message_type: type,
      attachment_path: path,
      content: null,
    } as any);
    if (error) {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    }
    setUploading(false);
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking same file
    if (!file) return;
    await uploadAttachment(file, file.name, "image");
  };

  const handleAudioRecorded = async (blob: Blob) => {
    await uploadAttachment(blob, "audio.webm", "audio");
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

  const activeChannelName =
    active.kind === "general"
      ? "Geral"
      : active.kind === "custom"
      ? customChannels.find((c) => c.id === active.id)?.name ?? "Canal"
      : cultos.find((c: any) => c.id === active.id)?.name ?? "Culto";

  const isActiveGeneral = active.kind === "general";
  const isActiveCustom = (id: string) => active.kind === "custom" && active.id === id;
  const isActiveCulto = (id: string) => active.kind === "culto" && active.id === id;

  return (
    <div className="max-w-6xl mx-auto animate-in-up h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 lg:hidden"
            onClick={() => setChannelsModalOpen(true)}
          >
            <Settings className="h-4 w-4" />
            Canais
          </Button>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Desktop channel sidebar */}
        <div className="hidden lg:flex flex-col w-56 shrink-0">
          <GlassCard className="p-2 space-y-1">
            <div className="flex items-center justify-between px-2 py-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Canais
              </p>
              {canEdit && (
                <button
                  onClick={() => setChannelsModalOpen(true)}
                  className="p-1 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  title="Gerenciar canais"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => setActive({ kind: "general" })}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActiveGeneral
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <Hash className="h-4 w-4" /> Geral
            </button>

            {customChannels.map((c) => (
              <button
                key={c.id}
                onClick={() => setActive({ kind: "custom", id: c.id })}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left ${
                  isActiveCustom(c.id)
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <Hash className="h-4 w-4 shrink-0" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}

            {cultos.length > 0 && (
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-2 pb-1">
                Cultos
              </p>
            )}
            {cultos.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setActive({ kind: "culto", id: c.id })}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left ${
                  isActiveCulto(c.id)
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
              onClick={() => setActive({ kind: "general" })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors shrink-0 max-w-[140px] ${
                isActiveGeneral
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-accent/50 text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              <Hash className="h-3 w-3 shrink-0" /> Geral
            </button>
            {customChannels.map((c) => (
              <button
                key={c.id}
                onClick={() => setActive({ kind: "custom", id: c.id })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors shrink-0 max-w-[140px] ${
                  isActiveCustom(c.id)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-accent/50 text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                <Hash className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {cultos.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setActive({ kind: "culto", id: c.id })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors shrink-0 max-w-[160px] ${
                  isActiveCulto(c.id)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-accent/50 text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                <Church className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.name}</span>
                <span className="opacity-60 shrink-0">
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
                  <p className="text-sm text-muted-foreground text-center px-4">
                    Nenhuma mensagem em{" "}
                    <span className="font-medium">{activeChannelName}</span>. Comece a conversa!
                  </p>
                </div>
              ) : (
                groupedMessages.map((group) => (
                  <div key={group.date}>
                    <div className="flex items-center justify-center my-3">
                      <span className="text-[10px] text-muted-foreground bg-accent/60 px-2.5 py-0.5 rounded-full">
                        {format(new Date(group.date + "T12:00:00"), "EEEE, dd 'de' MMMM", {
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                    {group.msgs.map((msg, i) => {
                      const isMe = msg.sender_profile_id === profileId;
                      const profile = msg.profiles as any;
                      const prevMsg = i > 0 ? group.msgs[i - 1] : null;
                      const sameAsPrev = prevMsg?.sender_profile_id === msg.sender_profile_id;
                      const initials =
                        profile?.full_name
                          ?.split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase() ?? "?";

                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""} ${
                            sameAsPrev ? "mt-0.5" : "mt-3"
                          }`}
                        >
                          {!isMe && !sameAsPrev ? (
                            <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                              <AvatarFallback className="text-[9px] bg-accent">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                          ) : !isMe ? (
                            <div className="w-7 shrink-0" />
                          ) : null}
                          <div
                            className={`max-w-[85%] md:max-w-[70%] flex flex-col ${
                              isMe ? "items-end" : "items-start"
                            }`}
                          >
                            {!sameAsPrev && !isMe && (
                              <p className="text-[10px] font-medium text-muted-foreground mb-0.5 ml-1 truncate max-w-full">
                                {profile?.full_name ?? "Usuário"}
                              </p>
                            )}
                            <ChatMessageBubble
                              type={msg.message_type ?? "text"}
                              content={msg.content}
                              attachmentPath={msg.attachment_path}
                              isMe={isMe}
                            />
                            <p
                              className={`text-[9px] text-muted-foreground mt-0.5 ${
                                isMe ? "text-right mr-1" : "ml-1"
                              }`}
                            >
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
            <div className="p-3 border-t border-border/50 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-1.5 items-center">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImagePick}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={uploading}
                  className="rounded-xl h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => imageInputRef.current?.click()}
                  title="Enviar imagem"
                >
                  <ImageIcon className="h-5 w-5" />
                </Button>
                <ChatEmojiPicker onSelect={insertEmoji} disabled={uploading} />
                <ChatAudioRecorder onRecorded={handleAudioRecorded} disabled={uploading} />
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Mensagem em ${activeChannelName}...`}
                  className="flex-1 min-w-0 bg-accent/40 border border-border/50 rounded-xl px-3.5 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                />
                <Button
                  size="icon"
                  className="rounded-xl h-9 w-9 shrink-0"
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sending || uploading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {uploading && (
                <p className="text-[10px] text-muted-foreground mt-1.5 ml-1">Enviando anexo…</p>
              )}
            </div>
          </GlassCard>
        </div>
        {/* end flex-1 */}
      </div>
      {/* end flex */}

      <ChatChannelsModal
        open={channelsModalOpen}
        onOpenChange={setChannelsModalOpen}
        channels={customChannels}
        onChanged={() => refetchChannels()}
      />
    </div>
  );
}
