import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { DESKTOP_QUERY, useHideTabBar, useMediaQuery, useShell } from "@/contexts/ShellContext";
import { PageHeader } from "@/components/shell/PageHeader";
import { ToolbarButton } from "@/components/shell/ToolbarButton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUp, ChevronDown, Hash, Church, Loader2, MessageCircle, Settings, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ChatEmojiPicker } from "@/components/ChatEmojiPicker";
import { ChatChannelsModal, CustomChannel } from "@/components/ChatChannelsModal";
import { ChatAudioRecorder } from "@/components/ChatAudioRecorder";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { ModeratedMessage } from "@/components/chat/ModeratedMessage";
import { useChatModeration } from "@/components/chat/useChatModeration";
import { CHAT_MESSAGE_MAX } from "@/lib/chatModeration";

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

const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Teclado virtual (celular): aberto quando a viewport visual encolhe bem abaixo da maior altura
 * já vista. `overlap` = quanto o teclado cobre a viewport de layout (WebViews que só redimensionam
 * a viewport visual); em modo "adjustResize" o layout encolhe sozinho e o overlap fica em 0.
 */
function useSoftKeyboard(enabled: boolean) {
  const [state, setState] = useState({ open: false, overlap: 0 });
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setState((s) => (s.open || s.overlap ? { open: false, overlap: 0 } : s));
      return;
    }
    const vv = window.visualViewport;
    let width = window.innerWidth;
    let maxH = 0;
    const update = () => {
      if (window.innerWidth !== width) {
        width = window.innerWidth; // rotação: recomeça a medir
        maxH = 0;
      }
      const zoomed = !!vv && Math.abs(vv.scale - 1) > 0.01;
      const h = vv && !zoomed ? vv.height : window.innerHeight;
      // Teclado só conta como aberto com um campo de texto em foco: redimensionar a janela
      // (navegador no desktop, rotação) não pode esconder a barra de abas.
      const el = document.activeElement as HTMLElement | null;
      const editing =
        !!el &&
        (el.isContentEditable ||
          el.tagName === "TEXTAREA" ||
          (el instanceof HTMLInputElement && !/^(checkbox|radio|range|button|submit|reset|file|color|image|hidden)$/.test(el.type)));
      // A altura de referência só é medida sem campo em foco: redimensionar a janela não "abre" o teclado.
      if (!editing) maxH = h;
      else maxH = Math.max(maxH, h);
      const open = editing && maxH - h > 150;
      const overlap = vv && !zoomed && open ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      setState((s) => (s.open === open && s.overlap === overlap ? s : { open, overlap }));
    };
    update();
    const onFocus = () => setTimeout(update, 50);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onFocus);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onFocus);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);
  return state;
}

export default function Chat() {
  const { currentTeam, profileId, can, isAdmin, loading: teamLoading } = useTeam();
  const canEdit = can("chat", "editar");
  const { toast } = useToast();
  const shell = useShell();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [active, setActive] = useState<ActiveChannel>({ kind: "general" });
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [channelsModalOpen, setChannelsModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const nearBottomRef = useRef(true);
  const jumpRef = useRef(true);

  // Denunciar, bloquear e apagar mensagens (moderação do chat).
  const moderation = useChatModeration({
    teamId: currentTeam?.id ?? null,
    profileId,
    isTeamAdmin: isAdmin,
    onDeleted: (id) => setMessages((prev) => prev.filter((m) => m.id !== id)),
  });

  // Com o teclado aberto no celular, a barra de abas sai e o compositor desce (como no Mensagens).
  const keyboard = useSoftKeyboard(!isDesktop);
  useHideTabBar(!isDesktop && keyboard.open);

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
      // Mensagem apagada (autor, liderança ou plataforma). DELETE não aceita filtro
      // no Realtime e só traz o id; basta tirar da lista se estiver aqui.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const removedId = (payload.old as { id?: string } | null)?.id;
        if (removedId) setMessages((prev) => prev.filter((m) => m.id !== removedId));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTeam, active]);

  // A conversa rola no contêiner do shell (conteúdo passa sob as barras de vidro).
  const scrollToBottom = (behavior: ScrollBehavior) => {
    const el = shell?.scrollEl;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    else messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Ao trocar de canal, a nova conversa abre direto no fim (sem animar a lista inteira).
  useEffect(() => {
    jumpRef.current = true;
  }, [active]);

  // Auto-scroll to bottom
  useEffect(() => {
    nearBottomRef.current = true;
    scrollToBottom(jumpRef.current ? "auto" : "smooth");
    if (messages.length) jumpRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Mantém o fim da conversa visível quando imagens carregam ou o teclado muda a altura.
  useEffect(() => {
    const el = shell?.scrollEl;
    if (!el) return;
    // Só a rolagem feita pela pessoa solta o fim da conversa; as nossas (e o crescimento de
    // imagens, que chega antes do evento de rolagem) não podem desprender.
    let userScrolling = false;
    let pointerDown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const markUser = () => {
      userScrolling = true;
      clearTimeout(timer);
      timer = setTimeout(() => (userScrolling = pointerDown), 700);
    };
    const onPointerDown = () => { pointerDown = true; markUser(); };
    const onPointerUp = () => { pointerDown = false; markUser(); };
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
      if (near) nearBottomRef.current = true;
      else if (userScrolling) nearBottomRef.current = false;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", markUser, { passive: true });
    el.addEventListener("touchmove", markUser, { passive: true });
    el.addEventListener("keydown", markUser);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    const ro = new ResizeObserver(() => {
      if (nearBottomRef.current) el.scrollTo({ top: el.scrollHeight });
    });
    ro.observe(el);
    if (listRef.current) ro.observe(listRef.current);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", markUser);
      el.removeEventListener("touchmove", markUser);
      el.removeEventListener("keydown", markUser);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      ro.disconnect();
    };
  }, [shell?.scrollEl, teamLoading]);

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

  // ---- Geometria da tela cheia dentro do rolador do shell ----
  // O shell já reserva topo (barra superior) e base (barra de abas). A página ocupa a altura
  // visível e o compositor fica "grudado" logo acima da barra de abas (ou do teclado).
  // `restGap` = distância do compositor até a base da viewport; `shellPad` = folga que o shell
  // deixa embaixo. A margem negativa devolve a diferença para o compositor não "pular" no fim.
  const shellPadBottom = isDesktop ? "40px" : "(max(env(safe-area-inset-bottom), 8px) + 96px)";
  const shellPadTop = isDesktop ? "32px" : "(max(env(safe-area-inset-top), 12px) + 56px)";
  const restGap = isDesktop
    ? "24px"
    : keyboard.open
      ? `(${keyboard.overlap}px + 8px)`
      : "(max(env(safe-area-inset-bottom), 8px) + 78px)";
  const rootStyle: CSSProperties = {
    minHeight: `calc(100dvh - ${shellPadTop} - ${restGap})`,
    marginBottom: `calc(${restGap} - ${shellPadBottom})`,
  };
  const composerStyle: CSSProperties = { bottom: `calc(${restGap})` };

  if (teamLoading) {
    return (
      <div>
        <PageHeader title="Chat" />
        <div className="space-y-3" aria-hidden="true">
          <Skeleton className="h-10 w-3/5 rounded-[18px] bg-fill-tertiary" />
          <Skeleton className="h-10 w-2/5 rounded-[18px] bg-fill-tertiary ml-auto" />
          <Skeleton className="h-16 w-4/6 rounded-[18px] bg-fill-tertiary" />
        </div>
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

  // Valor do seletor de canal (menu da barra superior no celular).
  const activeValue = active.kind === "general" ? "general" : `${active.kind}:${active.id}`;
  const selectChannel = (value: string) => {
    if (value === "general") return setActive({ kind: "general" });
    const sep = value.indexOf(":");
    const kind = value.slice(0, sep);
    const id = value.slice(sep + 1);
    if (kind === "custom" || kind === "culto") setActive({ kind, id });
  };
  // Defensivo: uma data ausente/inválida mostra vazio em vez de derrubar a tela inteira.
  const cultoDate = (date: string) => {
    const d = new Date(date + "T12:00:00");
    return Number.isNaN(d.getTime()) ? "" : format(d, "dd/MM");
  };
  const hasText = !!newMessage.trim();

  const channelMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          label={activeChannelName}
          icon={active.kind === "culto" ? <Church strokeWidth={2.2} /> : <Hash strokeWidth={2.2} />}
          aria-label={`Canal: ${activeChannelName}`}
          className="max-w-[210px]"
        >
          <span className="relative z-[4] -ml-0.5 inline-flex text-muted-foreground" aria-hidden="true">
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 max-h-[min(65dvh,480px)] overflow-y-auto">
        <DropdownMenuLabel inset>Canais</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={activeValue} onValueChange={selectChannel}>
          {/* Padrão iOS: marca à esquerda, símbolo à direita. */}
          <DropdownMenuRadioItem value="general">
            <span className="min-w-0 flex-1 truncate">Geral</span>
            <Hash className="order-last text-muted-foreground" aria-hidden="true" />
          </DropdownMenuRadioItem>
          {customChannels.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={`custom:${c.id}`}>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <Hash className="order-last text-muted-foreground" aria-hidden="true" />
            </DropdownMenuRadioItem>
          ))}
          {cultos.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel inset>Cultos</DropdownMenuLabel>
              {cultos.map((c: any) => (
                <DropdownMenuRadioItem key={c.id} value={`culto:${c.id}`}>
                  <Church className="order-last text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{c.name}</span>
                    <span className="block text-footnote text-muted-foreground tabular-nums">{cultoDate(c.date)}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </>
          )}
        </DropdownMenuRadioGroup>
        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem inset onSelect={() => setChannelsModalOpen(true)}>
              <Settings aria-hidden="true" />
              Gerenciar canais
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const headerActions = isDesktop
    ? canEdit && (
        <ToolbarButton
          icon={<Settings strokeWidth={2} />}
          aria-label="Gerenciar canais"
          title="Gerenciar canais"
          onClick={() => setChannelsModalOpen(true)}
        />
      )
    : channelMenu;

  return (
    <div className="flex flex-col" style={rootStyle}>
      <PageHeader title="Chat" actions={headerActions || undefined} />

      <div className="flex flex-1 gap-6 min-h-0">
        {/* Desktop: lista agrupada de canais (estilo barra lateral do iPadOS) */}
        <aside className="hidden lg:block w-64 shrink-0" aria-label="Canais">
          <div className="sticky top-8 space-y-6">
            <ChannelGroup title="Canais">
              <ChannelRow
                icon={<Hash />}
                label="Geral"
                selected={isActiveGeneral}
                onClick={() => setActive({ kind: "general" })}
              />
              {customChannels.map((c) => (
                <ChannelRow
                  key={c.id}
                  icon={<Hash />}
                  label={c.name}
                  selected={isActiveCustom(c.id)}
                  onClick={() => setActive({ kind: "custom", id: c.id })}
                />
              ))}
            </ChannelGroup>
            {cultos.length > 0 && (
              <ChannelGroup title="Cultos">
                {cultos.map((c: any) => (
                  <ChannelRow
                    key={c.id}
                    icon={<Church />}
                    label={c.name}
                    detail={cultoDate(c.date)}
                    selected={isActiveCulto(c.id)}
                    onClick={() => setActive({ kind: "culto", id: c.id })}
                  />
                ))}
              </ChannelGroup>
            )}
          </div>
        </aside>

        <section className="flex flex-1 min-w-0 flex-col" aria-label={`Conversa em ${activeChannelName}`}>
          {/* Messages */}
          <div ref={listRef} className="flex flex-1 flex-col pb-3">
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                <MessageCircle className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
                <p className="text-body text-muted-foreground max-w-xs">
                  Nenhuma mensagem em{" "}
                  <span className="font-semibold text-foreground">{activeChannelName}</span>. Comece a conversa!
                </p>
              </div>
            ) : (
              groupedMessages.map((group) => (
                <div key={group.date}>
                  <p className="mt-4 mb-2 text-center text-footnote font-medium text-muted-foreground">
                    {sentenceCase(
                      format(new Date(group.date + "T12:00:00"), "EEEE, dd 'de' MMMM", {
                        locale: ptBR,
                      }),
                    )}
                  </p>
                  {group.msgs.map((msg, i) => {
                    const isMe = msg.sender_profile_id === profileId;
                    const profile = msg.profiles as any;
                    const prevMsg = i > 0 ? group.msgs[i - 1] : null;
                    const nextMsg = i < group.msgs.length - 1 ? group.msgs[i + 1] : null;
                    const sameAsPrev = prevMsg?.sender_profile_id === msg.sender_profile_id;
                    const sameAsNext = nextMsg?.sender_profile_id === msg.sender_profile_id;
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
                        className={cn("flex items-end gap-2", isMe ? "justify-end" : "justify-start", sameAsPrev ? "mt-0.5" : "mt-3")}
                      >
                        {/* Mensagens do iOS: avatar ao lado da última bolha da sequência */}
                        {!isMe &&
                          (!sameAsNext ? (
                            <Avatar className="h-7 w-7 shrink-0">
                              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
                              <AvatarFallback className="bg-fill-secondary text-caption2 font-semibold text-muted-foreground">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                          ) : (
                            <div className="w-7 shrink-0" aria-hidden="true" />
                          ))}
                        <div className={cn("flex min-w-0 max-w-[82%] md:max-w-[68%] flex-col", isMe ? "items-end" : "items-start")}>
                          {!sameAsPrev && !isMe && (
                            <p className="mb-0.5 max-w-full truncate px-3 text-caption1 text-muted-foreground">
                              {profile?.full_name ?? "Usuário"}
                            </p>
                          )}
                          <div className={cn("flex max-w-full items-end gap-1.5", isMe && "flex-row-reverse")}>
                            <div className="min-w-0">
                              <ModeratedMessage {...moderation.messageProps(msg, isMe, profile?.full_name)}>
                                <ChatMessageBubble
                                  type={msg.message_type ?? "text"}
                                  content={msg.content}
                                  attachmentPath={msg.attachment_path}
                                  isMe={isMe}
                                  tail={!sameAsNext}
                                />
                              </ModeratedMessage>
                            </div>
                            <time
                              dateTime={msg.created_at}
                              className="shrink-0 pb-0.5 text-caption2 text-muted-foreground tabular-nums"
                            >
                              {format(new Date(msg.created_at), "HH:mm")}
                            </time>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Compositor: cápsula de vidro flutuante (camada funcional) */}
          <div className="sticky z-[35] pt-1" style={composerStyle}>
            {uploading && (
              <p className="mb-1.5 px-4 text-caption1 text-muted-foreground" role="status">
                Enviando anexo…
              </p>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImagePick}
            />
            <div className="flex items-end gap-2">
              {!recording && (
                <button
                  type="button"
                  disabled={uploading}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => imageInputRef.current?.click()}
                  title="Enviar imagem"
                  aria-label="Enviar imagem"
                  className="liquid-glass-thick glass-button shrink-0 w-11 disabled:opacity-40"
                >
                  <ImageIcon className="relative z-[4] h-5 w-5" strokeWidth={2} aria-hidden="true" />
                </button>
              )}
              <div className="liquid-glass-thick flex min-h-11 min-w-0 flex-1 items-center gap-0.5 rounded-[22px] py-1 pl-4 pr-1">
                {!recording && (
                  <>
                    <input
                      ref={inputRef}
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      maxLength={CHAT_MESSAGE_MAX}
                      onKeyDown={handleKeyDown}
                      enterKeyHint="send"
                      aria-label={`Mensagem em ${activeChannelName}`}
                      placeholder={`Mensagem em ${activeChannelName}...`}
                      className="relative z-[4] min-w-0 flex-1 bg-transparent py-[7px] text-body text-foreground placeholder:text-muted-foreground outline-none focus-visible:outline-none"
                    />
                    <ChatEmojiPicker onSelect={insertEmoji} disabled={uploading} />
                  </>
                )}
                {recording || !hasText ? (
                  <ChatAudioRecorder
                    onRecorded={handleAudioRecorded}
                    onRecordingChange={setRecording}
                    disabled={uploading}
                  />
                ) : (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleSend}
                    disabled={!newMessage.trim() || sending || uploading}
                    title="Enviar"
                    aria-label="Enviar mensagem"
                    className="relative z-[4] before:absolute before:-inset-1 before:rounded-full before:content-[''] grid h-9 w-9 shrink-0 place-items-center rounded-full bg-prominent text-prominent-foreground transition-[transform,opacity] active:scale-95 disabled:opacity-40"
                  >
                    {sending ? (
                      <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowUp className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {moderation.dialogs}

      <ChatChannelsModal
        open={channelsModalOpen}
        onOpenChange={setChannelsModalOpen}
        channels={customChannels}
        onChanged={() => refetchChannels()}
      />
    </div>
  );
}

/* ---------- Lista de canais (desktop) ---------- */

function ChannelGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-4 text-footnote text-muted-foreground">{title}</h2>
      <div className="overflow-hidden rounded-card bg-card [&>*+*]:before:absolute [&>*+*]:before:left-[46px] [&>*+*]:before:right-0 [&>*+*]:before:top-0 [&>*+*]:before:border-t [&>*+*]:before:border-separator [&>*+*]:before:content-['']">
        {children}
      </div>
    </section>
  );
}

function ChannelRow({
  icon,
  label,
  detail,
  selected,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "relative flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left transition-colors",
        selected ? "bg-fill-tertiary" : "hover:bg-fill-quaternary active:bg-fill-tertiary",
      )}
    >
      <span
        className={cn("inline-flex shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]", selected ? "text-primary" : "text-muted-foreground")}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-body", selected && "font-semibold")}>{label}</span>
      {detail && <span className="shrink-0 text-footnote text-muted-foreground tabular-nums">{detail}</span>}
    </button>
  );
}
