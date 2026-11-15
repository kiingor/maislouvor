import { warmPresentation } from "@/lib/routeLoaders";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { firePush } from "@/lib/push";
import { useTeam } from "@/contexts/TeamContext";
import { PageHeader } from "@/components/shell/PageHeader";
import { ToolbarButton } from "@/components/shell/ToolbarButton";
import { AddCultoSongModal } from "@/components/AddCultoSongModal";
import { CultoLineupModal } from "@/components/CultoLineupModal";
import { CultoBlockModal } from "@/components/CultoBlockModal";
import { CultoDuplicateModal } from "@/components/CultoDuplicateModal";
import { SongSummaryModal } from "@/components/SongSummaryModal";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Music,
  Plus,
  MonitorPlay,
  Trash2,
  Users,
  GripVertical,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Share,
  Loader2,
  Copy,
  BellRing,
  ListPlus,
  Pencil,
  ChevronUp,
  ChevronDown,
  Mic2,
  MoreHorizontal,
  MoreVertical,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { compareInstruments, instrumentIcon, isVocalRole } from "@/data/instruments";
import { buildVoiceLines, type VoiceAssignment } from "@/lib/voices";
import type { ShareRoteiroItem } from "@/lib/shareText";
import { CultoSongVoicesModal } from "@/components/CultoSongVoicesModal";
import { CultoShareModal } from "@/components/CultoShareModal";
import { CHROMATIC_KEYS } from "@/data/chordDictionary";

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Status da escala em cápsula (spec §5): cor a 15% + texto na cor, sempre com símbolo e rótulo. */
const LINEUP_STATUS = {
  pending: { label: "Pendente", icon: Clock, className: "bg-ios-orange/15 text-ios-orange" },
  accepted: { label: "Aceito", icon: CheckCircle2, className: "bg-ios-green/15 text-ios-green" },
  declined: { label: "Recusado", icon: XCircle, className: "bg-ios-red/15 text-ios-red" },
} as const;

function StatusBadge({ status }: { status: string }) {
  const s = LINEUP_STATUS[(status as keyof typeof LINEUP_STATUS)] ?? LINEUP_STATUS.pending;
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption1 font-semibold", s.className)}>
      <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** Capa da canção no roteiro (mesma URL assinada que o SongCard usava). */
function RoteiroCover({ coverPath, title }: { coverPath?: string | null; title: string }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!coverPath) return;
    supabase.storage.from("covers").createSignedUrl(coverPath, 3600).then(({ data }) => {
      if (data?.signedUrl) setCoverUrl(data.signedUrl);
    });
  }, [coverPath]);
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-fill-tertiary">
      {coverUrl ? (
        <img src={coverUrl} alt={title} className="h-full w-full object-cover" />
      ) : (
        <Music className="h-5 w-5 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
      )}
    </span>
  );
}

/** Botão de texto tintado (link-button do protótipo), alvo de 44pt. */
const linkButton =
  "inline-flex min-h-[44px] items-center gap-1 -my-2.5 px-1.5 -mr-1.5 rounded-[10px] text-subhead font-medium text-primary whitespace-nowrap transition-opacity active:opacity-60 disabled:opacity-40";

/** No celular, o separador acompanha as vozes na largura inteira do roteiro. */
const roteiroSeparator =
  "before:absolute before:top-0 before:right-4 before:left-4 before:border-t before:border-border first:before:hidden sm:before:right-0 sm:before:left-[104px]";

const KEY_OPTIONS = [...CHROMATIC_KEYS, ...CHROMATIC_KEYS.map((k) => k + "m")];
const SONG_FALLBACK_SECONDS = 240;

function formatTotal(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m} min`;
}

export default function CultoDetail() {
  // Baixa o Modo ensaio em segundo plano: tocar em "Ensaio" abre sem espera.
  useEffect(warmPresentation, []);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can, profileId, currentTeam } = useTeam();
  const canEdit = can("cultos", "editar");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [editBlock, setEditBlock] = useState<any>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [deleteBlockId, setDeleteBlockId] = useState<string | null>(null);
  const [summarySongId, setSummarySongId] = useState<string | null>(null);
  const [summaryNotes, setSummaryNotes] = useState<string | null>(null);
  const [summaryNotesAuthor, setSummaryNotesAuthor] = useState<any>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [remindLoading, setRemindLoading] = useState(false);

  const { data: culto, isLoading } = useQuery({
    queryKey: ["culto", id],
    queryFn: async () => {
      const { data } = await supabase.from("cultos").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: cultoSongs = [] } = useQuery({
    queryKey: ["culto-songs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_songs")
        .select("*, songs(id, title, artist, key_current, key_original, cover_path, tags, theme, duration_seconds, bpm, media_url), notes_author:profiles!culto_songs_notes_author_id_fkey(full_name, avatar_url)" as any)
        .eq("culto_id", id!)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: blocks = [] } = useQuery({
    queryKey: ["culto-blocks", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_blocks" as any)
        .select("*")
        .eq("culto_id", id!)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
    enabled: !!id,
  });

  // Fetch repertório names for each song
  const songIds = cultoSongs.map((cs: any) => cs.song_id).filter(Boolean);
  const { data: repSongs = [] } = useQuery({
    queryKey: ["song-repertorios", songIds],
    queryFn: async () => {
      if (songIds.length === 0) return [];
      const { data } = await supabase
        .from("repertorio_songs")
        .select("song_id, repertorios(name)")
        .in("song_id", songIds);
      return data ?? [];
    },
    enabled: songIds.length > 0,
  });

  const songRepertorioMap: Record<string, string[]> = {};
  repSongs.forEach((rs: any) => {
    const name = (rs.repertorios as any)?.name;
    if (!name) return;
    if (!songRepertorioMap[rs.song_id]) songRepertorioMap[rs.song_id] = [];
    if (!songRepertorioMap[rs.song_id].includes(name)) songRepertorioMap[rs.song_id].push(name);
  });

  const { data: lineup = [] } = useQuery({
    queryKey: ["culto-lineup", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_lineup")
        .select("*, team_members(id, profile_id, profiles(full_name, avatar_url))")
        .eq("culto_id", id!);
      return data ?? [];
    },
    enabled: !!id,
  });

  // Vozes (1ª/2ª/3ª) de cada canção do roteiro.
  // A chave é só o culto (não a lista de ids): a lista muda de ordem a cada
  // reordenação do roteiro e faria as vozes sumirem da tela por um instante.
  const { data: songVoices = [] } = useQuery({
    queryKey: ["culto-voices", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_song_voices" as any)
        .select("*, culto_songs!inner(culto_id)")
        .eq("culto_songs.culto_id", id!);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  /**
   * team_member_id -> nome + funções VOCAIS na escala deste culto.
   * Só as vocais: quem é "Ministrante" e também "Violão" não pode acabar com o
   * violão impresso como se fosse naipe na linha de vozes.
   */
  const memberInfo = new Map<string, { name: string; roles: string[] }>();
  (lineup as any[]).forEach((l: any) => {
    if (!isVocalRole(l.instrument)) return;
    const profile = l.team_members?.profiles as any;
    const entry = memberInfo.get(l.team_member_id) ?? { name: profile?.full_name ?? "Sem nome", roles: [] };
    if (!entry.roles.includes(l.instrument)) entry.roles.push(l.instrument);
    memberInfo.set(l.team_member_id, entry);
  });

  const voicesByCultoSong = new Map<string, VoiceAssignment[]>();
  (songVoices as any[]).forEach((v: any) => {
    const list = voicesByCultoSong.get(v.culto_song_id) ?? [];
    list.push({ team_member_id: v.team_member_id, voice: v.voice, voice_part: v.voice_part ?? null });
    voicesByCultoSong.set(v.culto_song_id, list);
  });

  // Linhas já resolvidas — quem saiu da escala some daqui, então o ícone e o
  // texto do WhatsApp concordam com o que a tela mostra.
  const voiceLinesByCultoSong = new Map<string, ReturnType<typeof buildVoiceLines>>();
  voicesByCultoSong.forEach((assignments, csId) => {
    const lines = buildVoiceLines(assignments, memberInfo);
    if (lines.length > 0) voiceLinesByCultoSong.set(csId, lines);
  });

  const hasVocalists = (lineup as any[]).some((l: any) => isVocalRole(l.instrument));

  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [voicesSong, setVoicesSong] = useState<{ id: string; title: string } | null>(null);

  const updateSongNotes = async (cultoSongId: string, notes: string) => {
    const { error } = await supabase.from("culto_songs").update({ notes, notes_author_id: profileId } as any).eq("id", cultoSongId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
  };

  const removeSong = async (cultoSongId: string) => {
    const { error } = await supabase.from("culto_songs").delete().eq("id", cultoSongId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else qc.invalidateQueries({ queryKey: ["culto-songs", id] });
  };

  const updateSongKey = async (cultoSongId: string, key: string) => {
    const { error } = await supabase.from("culto_songs").update({ key_override: key } as any).eq("id", cultoSongId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else qc.invalidateQueries({ queryKey: ["culto-songs", id] });
  };

  // ---- Roteiro: merge songs + blocks por sort_order ----
  type RoteiroItem =
    | { kind: "song"; sort_order: number; data: any }
    | { kind: "block"; sort_order: number; data: any };

  const roteiro: RoteiroItem[] = [
    ...cultoSongs.map((cs: any) => ({ kind: "song" as const, sort_order: cs.sort_order ?? 0, data: cs })),
    ...(blocks as any[]).map((b: any) => ({ kind: "block" as const, sort_order: b.sort_order ?? 0, data: b })),
  ].sort((a, b) => a.sort_order - b.sort_order);

  const totalSeconds =
    cultoSongs.reduce((acc: number, cs: any) => acc + ((cs.songs?.duration_seconds as number) || SONG_FALLBACK_SECONDS), 0) +
    (blocks as any[]).reduce((acc: number, b: any) => acc + (b.duration_min || 0) * 60, 0);

  // Persiste a ordem do roteiro inteiro (songs + blocks) após uma reordenação.
  const persistRoteiroOrder = async (items: RoteiroItem[]) => {
    const updates: PromiseLike<unknown>[] = [];
    items.forEach((it, i) => {
      if (it.sort_order === i) return;
      if (it.kind === "song") {
        updates.push(supabase.from("culto_songs").update({ sort_order: i } as any).eq("id", it.data.id));
      } else {
        updates.push(supabase.from("culto_blocks" as any).update({ sort_order: i } as any).eq("id", it.data.id));
      }
    });
    if (updates.length) await Promise.all(updates);
    qc.invalidateQueries({ queryKey: ["culto-songs", id] });
    qc.invalidateQueries({ queryKey: ["culto-blocks", id] });
  };

  // Move um item (por índice no roteiro) para cima/baixo — usado por setas e pelo drag.
  const moveItem = async (from: number, to: number) => {
    if (to < 0 || to >= roteiro.length || from === to) return;
    const items = [...roteiro];
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    await persistRoteiroOrder(items);
  };

  // Drag reorder state (mistura songs + blocks)
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(idx);
  };
  const handleDrop = async (idx: number) => {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    await moveItem(dragIdx, idx);
    setDragIdx(null);
    setOverIdx(null);
  };
  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  const deleteBlock = async () => {
    if (!deleteBlockId) return;
    const { error } = await supabase.from("culto_blocks" as any).delete().eq("id", deleteBlockId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else qc.invalidateQueries({ queryKey: ["culto-blocks", id] });
    setDeleteBlockId(null);
  };

  // ---- Escala ----
  const lineupByInstrument: Record<string, any[]> = {};
  lineup.forEach((l: any) => {
    if (!lineupByInstrument[l.instrument]) lineupByInstrument[l.instrument] = [];
    lineupByInstrument[l.instrument].push(l);
  });
  // Vozes primeiro (ministrante → naipes), depois instrumentos.
  const lineupEntries = Object.entries(lineupByInstrument).sort(([a], [b]) => compareInstruments(a, b));

  const pendingEntries = (lineup as any[]).filter((l: any) => (l.status || "pending") === "pending");

  const setLineupStatus = async (lineupId: string, status: "accepted" | "declined") => {
    const { error } = await supabase.from("culto_lineup").update({ status } as any).eq("id", lineupId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      qc.invalidateQueries({ queryKey: ["culto-lineup", id] });
      toast({ title: status === "accepted" ? "Presença confirmada!" : "Você recusou esta escala." });
    }
  };

  const remindPending = async () => {
    if (!culto || !currentTeam) return;
    setRemindLoading(true);
    const dateLabel = new Date(culto.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
    const notifs = pendingEntries
      .map((l: any) => {
        const pid = l.team_members?.profile_id;
        if (!pid) return null;
        return {
          profile_id: pid,
          type: "lineup",
          title: "🙏 Bora confirmar?",
          body: `Você está escalado pra ${culto.name} • ${dateLabel}. Confirma sua presença? 🎸`,
          link: `/app/cultos/${culto.id}`,
          team_id: currentTeam.id,
          sender_profile_id: profileId,
        };
      })
      .filter(Boolean);

    if (notifs.length === 0) {
      toast({ title: "Ninguém pendente", description: "Todos já responderam." });
      setRemindLoading(false);
      return;
    }
    const { error } = await supabase.from("notifications").insert(notifs as any);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      await firePush(
        currentTeam.id,
        (notifs as any[]).map((n) => ({ profile_id: n.profile_id, title: n.title, body: n.body, link: n.link })),
      );
      toast({ title: `Lembrete enviado para ${notifs.length} membro(s).` });
    }
    setRemindLoading(false);
  };

  // Dados prontos para a mensagem de WhatsApp (escala + repertório).
  const shareRoteiro: ShareRoteiroItem[] = roteiro.map((item) => {
    if (item.kind === "block") {
      const b = item.data;
      return {
        kind: "block" as const,
        title: b.title,
        blockKind: b.kind,
        durationMin: b.duration_min,
        notes: b.notes,
      };
    }
    const cs = item.data;
    const original = cs.songs?.key_current || cs.songs?.key_original || null;
    return {
      kind: "song" as const,
      cultoSongId: cs.id,
      title: cs.songs?.title ?? "—",
      artist: cs.songs?.artist,
      key: cs.key_override || original || "",
      originalKey: original,
      bpm: cs.songs?.bpm ?? null,
      mediaUrl: cs.songs?.media_url ?? null,
      notes: cs.notes,
      theme: cs.songs?.theme,
    };
  });

  const shareLineup: Record<string, string[]> = {};
  lineupEntries.forEach(([instrument, entries]) => {
    shareLineup[instrument] = entries.map((e: any) => (e.team_members?.profiles as any)?.full_name ?? "—");
  });

  // Observação da canção: 1º toque abre o editor com o texto atual, 2º toque salva.
  // (Mesmo comportamento do antigo botão de balão; agora também disparado pelo "Salvar" do editor.)
  const toggleSongNotes = (cs: any) => {
    setEditingNotes((prev) => ({
      ...prev,
      [cs.id]: prev[cs.id] !== undefined ? prev[cs.id] : (cs.notes || ""),
    }));
    if (editingNotes[cs.id] !== undefined) {
      updateSongNotes(cs.id, editingNotes[cs.id] || "");
      setEditingNotes((prev) => {
        const n = { ...prev };
        delete n[cs.id];
        return n;
      });
      qc.invalidateQueries({ queryKey: ["culto-songs", id] });
    }
  };

  if (isLoading) {
    return (
      <div className="animate-in-up" aria-busy="true">
        <PageHeader title="Culto" back="/app/cultos" />
        <div className="rounded-card bg-card h-32 animate-pulse" />
        <div className="mt-6 rounded-card bg-card h-48 animate-pulse" />
      </div>
    );
  }

  if (!culto) {
    return (
      <div className="animate-in-up">
        <PageHeader title="Culto" back="/app/cultos" />
        <div className="rounded-card bg-card px-6 py-10 flex flex-col items-center text-center gap-2">
          <Music className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
          <p className="text-body text-muted-foreground">Culto não encontrado.</p>
          <Button variant="secondary" className="mt-3 rounded-full" onClick={() => navigate("/app/cultos")}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  const cultoDateObj = new Date(culto.date + "T00:00:00");
  const isToday = culto.date === new Date().toLocaleDateString("en-CA");
  const showLineupSection = Object.keys(lineupByInstrument).length > 0 || canEdit;

  return (
    <div className="animate-in-up">
      <PageHeader
        title={culto.name}
        back="/app/cultos"
        actions={
          <>
            <ToolbarButton icon={<Share />} aria-label="Compartilhar escala e repertório" onClick={() => setShareOpen(true)} />
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <ToolbarButton icon={<MoreHorizontal />} aria-label="Mais ações do culto" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setLineupOpen(true)}>
                    <Users /> Escala
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setEditBlock(null); setBlockOpen(true); }}>
                    <ListPlus /> Adicionar momento
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDuplicateOpen(true)}>
                    <Copy /> Duplicar culto
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canEdit && (
              <ToolbarButton icon={<Plus />} aria-label="Adicionar música" onClick={() => setAddSongOpen(true)} />
            )}
          </>
        }
      />

      {/* Resumo do culto: data (estilo Calendário), observações e Modo ensaio */}
      <section className="rounded-card bg-card p-4" aria-label="Resumo do culto">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-[12px] bg-fill-tertiary"
          >
            <span className={cn("text-caption2 font-semibold uppercase", isToday ? "text-ios-red" : "text-muted-foreground")}>
              {cultoDateObj.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
            </span>
            <span className={cn("text-title2 leading-[24px] tabular-nums", isToday ? "text-ios-red" : "text-foreground")}>
              {cultoDateObj.getDate()}
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-headline text-foreground">
              {capitalize(cultoDateObj.toLocaleDateString("pt-BR", { weekday: "long" }))}
            </p>
            <p className="text-footnote text-muted-foreground">
              {cultoDateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
        {culto.description && (
          <p className="mt-3 text-subhead text-muted-foreground whitespace-pre-line break-words">{culto.description}</p>
        )}
        {cultoSongs.length > 0 && (
          <Button
            className="mt-4 h-11 w-full rounded-full gap-2 text-body font-semibold sm:w-auto sm:min-w-[220px]"
            title="Modo Ensaio"
            onClick={() => navigate(`/app/cultos/${id}/present`)}
          >
            <MonitorPlay className="h-5 w-5" strokeWidth={2} aria-hidden="true" /> Modo ensaio
          </Button>
        )}
      </section>

      {/* Escala */}
      {showLineupSection && (
        <section className="mt-7" aria-labelledby="escala-title">
          <div className="mx-1 mb-2 flex items-end justify-between gap-3">
            <h2 id="escala-title" className="text-title3 text-foreground">Escala</h2>
            {canEdit && (
              <div className="flex items-center gap-3">
                {pendingEntries.length > 0 && (
                  <button type="button" className={linkButton} disabled={remindLoading} onClick={remindPending}>
                    {remindLoading ? (
                      <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden="true" />
                    ) : (
                      <BellRing className="h-[15px] w-[15px]" strokeWidth={2.25} aria-hidden="true" />
                    )}
                    Lembrar pendentes ({pendingEntries.length})
                  </button>
                )}
                {lineupEntries.length > 0 && (
                  <button type="button" className={linkButton} onClick={() => setLineupOpen(true)}>
                    Editar
                  </button>
                )}
              </div>
            )}
          </div>

          {lineupEntries.length === 0 ? (
            <div className="rounded-card bg-card flex items-center gap-3 p-4">
              <Users className="h-6 w-6 shrink-0 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
              <p className="flex-1 text-subhead text-muted-foreground">Ninguém escalado ainda.</p>
              <button type="button" className={linkButton} onClick={() => setLineupOpen(true)}>
                Montar escala
              </button>
            </div>
          ) : (
            <ul className="rounded-card bg-card overflow-hidden sm:grid sm:grid-cols-2">
              {lineupEntries.flatMap(([instrument, entries]) => {
                const Icon = instrumentIcon(instrument);
                return entries.map((e: any) => {
                  const profile = e.team_members?.profiles as any;
                  const status = e.status || "pending";
                  const isMine = e.team_members?.profile_id && e.team_members.profile_id === profileId;
                  return (
                    <li
                      key={e.id}
                      className="relative px-4 py-2.5 before:absolute before:top-0 before:right-0 before:left-[60px] before:border-t before:border-border first:before:hidden sm:[&:nth-child(2)]:before:hidden"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                          <AvatarFallback className="bg-fill-tertiary text-footnote font-semibold text-muted-foreground">
                            {(profile?.full_name ?? "?")[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-foreground">{profile?.full_name ?? "—"}</span>
                          <span className="flex items-center gap-1 text-footnote text-muted-foreground">
                            <Icon className="h-[13px] w-[13px] shrink-0" strokeWidth={2.25} aria-hidden="true" />
                            <span className="truncate">{instrument}</span>
                          </span>
                        </span>
                        <StatusBadge status={status} />
                      </div>
                      {isMine && status !== "accepted" && (
                        <div className="mt-2 flex gap-2 pl-11">
                          <Button className="h-11 flex-1 rounded-full gap-1.5" onClick={() => setLineupStatus(e.id, "accepted")}>
                            <CheckCircle2 aria-hidden="true" /> Aceitar
                          </Button>
                          <Button variant="secondary" className="h-11 flex-1 rounded-full gap-1.5" onClick={() => setLineupStatus(e.id, "declined")}>
                            <XCircle aria-hidden="true" /> Recusar
                          </Button>
                        </div>
                      )}
                      {isMine && status === "accepted" && (
                        <button
                          type="button"
                          className="ml-11 inline-flex min-h-[44px] items-center -mb-2.5 text-subhead font-medium text-ios-red transition-opacity active:opacity-60"
                          onClick={() => setLineupStatus(e.id, "declined")}
                        >
                          Não poderei ir
                        </button>
                      )}
                    </li>
                  );
                });
              })}
            </ul>
          )}
        </section>
      )}

      {/* Roteiro */}
      <section className="mt-7" aria-labelledby="roteiro-title">
        <div className="mx-1 mb-2 flex items-end justify-between gap-3">
          <h2 id="roteiro-title" className="text-title3 text-foreground">
            Roteiro
            {totalSeconds > 0 && (
              <span className="block text-subhead font-normal text-muted-foreground">
                <span className="sr-only">Duração total: </span>
                {formatTotal(totalSeconds)}
              </span>
            )}
          </h2>
          {canEdit && (
            <button type="button" className={linkButton} onClick={() => { setEditBlock(null); setBlockOpen(true); }}>
              <ListPlus className="h-[15px] w-[15px]" strokeWidth={2.25} aria-hidden="true" /> Adicionar momento
            </button>
          )}
        </div>

        {roteiro.length === 0 ? (
          <div className="rounded-card bg-card px-6 py-10 flex flex-col items-center text-center gap-2">
            <Music className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
            <h3 className="text-body text-muted-foreground">Roteiro vazio</h3>
            <p className="text-footnote text-muted-foreground max-w-xs">
              {canEdit ? "Adicione músicas e momentos (oração, palavra...) para montar o roteiro." : "Nada foi adicionado ainda."}
            </p>
            {canEdit && (
              <Button className="mt-3 rounded-full gap-2" onClick={() => setAddSongOpen(true)}>
                <Plus className="h-[17px] w-[17px]" aria-hidden="true" /> Adicionar música
              </Button>
            )}
          </div>
        ) : (
          <ul className="rounded-card bg-card overflow-hidden">
            {roteiro.map((item, idx) => {
              const dragClasses = cn(
                "relative transition-[opacity,background-color]",
                roteiroSeparator,
                dragIdx === idx && "opacity-40",
                overIdx === idx && dragIdx !== idx && "bg-fill-tertiary",
              );
              const moveItems = canEdit ? (
                <>
                  <DropdownMenuItem disabled={idx === 0} onClick={() => moveItem(idx, idx - 1)}>
                    <ChevronUp /> Mover para cima
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={idx === roteiro.length - 1} onClick={() => moveItem(idx, idx + 1)}>
                    <ChevronDown /> Mover para baixo
                  </DropdownMenuItem>
                </>
              ) : null;
              const grip = canEdit ? (
                <span className="hidden h-11 w-5 shrink-0 cursor-grab items-center justify-center text-label-tertiary active:cursor-grabbing md:flex" aria-hidden="true">
                  <GripVertical className="h-[17px] w-[17px]" />
                </span>
              ) : null;

              if (item.kind === "block") {
                const b = item.data;
                const blockBody = (
                  <>
                    <span className="hidden w-5 shrink-0 sm:block" aria-hidden="true" />
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center sm:h-11 sm:w-11 sm:rounded-[10px] sm:bg-fill-tertiary">
                      <Clock className="h-5 w-5 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-body text-foreground sm:truncate">{b.title}</span>
                      {b.notes && (
                        <span className="mt-0.5 block break-words text-footnote text-muted-foreground sm:truncate">
                          {b.notes}
                        </span>
                      )}
                    </span>
                  </>
                );
                return (
                  <li
                    key={`block-${b.id}`}
                    draggable={canEdit}
                    onDragStart={handleDragStart(idx)}
                    onDragOver={handleDragOver(idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={handleDragEnd}
                    className={dragClasses}
                  >
                    <div className="flex items-center">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => { setEditBlock(b); setBlockOpen(true); }}
                          className="flex min-w-0 flex-1 items-center gap-2.5 min-h-[52px] py-2.5 pl-4 pr-2 text-left transition-colors active:bg-grouped-tertiary sm:gap-3 sm:min-h-[64px]"
                        >
                          {blockBody}
                        </button>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-2.5 min-h-[52px] py-2.5 pl-4 pr-2 sm:gap-3 sm:min-h-[64px]">{blockBody}</div>
                      )}
                      <div className={cn(
                        "flex shrink-0 items-center",
                        canEdit ? "flex-col self-start gap-2 py-1.5 pr-1.5 sm:flex-row sm:self-auto sm:gap-1 sm:py-0" : "gap-1 pr-4",
                      )}>
                        {canEdit && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Ações do momento ${b.title}`}
                                className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary"
                              >
                                <MoreVertical className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditBlock(b); setBlockOpen(true); }}>
                                <Pencil /> Editar momento
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {moveItems}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-ios-red focus:text-ios-red" onClick={() => setDeleteBlockId(b.id)}>
                                <Trash2 /> Excluir momento
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        {!!b.duration_min && (
                          <span className="whitespace-nowrap px-1 text-footnote tabular-nums text-muted-foreground">{b.duration_min} min</span>
                        )}
                        {grip}
                      </div>
                    </div>
                  </li>
                );
              }

              // SONG
              const cs = item.data;
              // Tom "original": o que está gravado na canção/repertório (cifra).
              // Tom de execução: o override do culto, quando houver.
              const originalKey = cs.songs?.key_current || cs.songs?.key_original || "";
              const effectiveKey = cs.key_override || originalKey;
              const transposed = !!effectiveKey && !!originalKey && effectiveKey !== originalKey;
              const songTitle = cs.songs?.title ?? "—";
              const lines = voiceLinesByCultoSong.get(cs.id) ?? [];
              const isEditingNotes = editingNotes[cs.id] !== undefined && canEdit;
              const openVoices = () => setVoicesSong({ id: cs.id, title: cs.songs?.title ?? "" });
              return (
                <li
                  key={`song-${cs.id}`}
                  draggable={canEdit}
                  onDragStart={handleDragStart(idx)}
                  onDragOver={handleDragOver(idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  className={dragClasses}
                >
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        setSummarySongId(cs.songs?.id || cs.song_id);
                        setSummaryNotes(cs.notes || null);
                        setSummaryNotesAuthor((cs as any).notes_author || null);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 min-h-[64px] py-3 pl-4 pr-2 text-left transition-colors active:bg-grouped-tertiary sm:gap-3 sm:py-2.5"
                    >
                      <span className="hidden w-5 shrink-0 text-center text-footnote tabular-nums text-muted-foreground sm:block">{idx + 1}</span>
                      <span className="relative shrink-0">
                        <RoteiroCover coverPath={cs.songs?.cover_path} title={songTitle} />
                        <span className="absolute -bottom-1 -left-1 flex min-h-5 min-w-5 items-center justify-center rounded-md border-2 border-card bg-foreground px-1 text-caption2 font-semibold tabular-nums text-background sm:hidden">
                          {idx + 1}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-body text-foreground sm:truncate">{songTitle}</span>
                        {(cs.songs?.artist || transposed) && (
                          <span className="block break-words text-footnote text-muted-foreground sm:truncate">
                            {cs.songs?.artist}
                            {transposed && (
                              <>
                                {cs.songs?.artist ? " · " : ""}
                                <span title={`Tom original da canção: ${originalKey}`}>
                                  Original <s className="decoration-1">{originalKey}</s>
                                </span>
                              </>
                            )}
                          </span>
                        )}
                      </span>
                    </button>
                    <div className={cn(
                      "flex shrink-0 items-center",
                      canEdit ? "flex-col self-start gap-2 py-1.5 pr-1.5 sm:flex-row sm:self-auto sm:gap-1 sm:py-0" : "gap-1",
                      !canEdit && (hasVocalists && lines.length === 0 ? "pr-1.5" : "pr-4"),
                      !canEdit && hasVocalists && "sm:pr-1.5",
                    )}>
                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Ações de ${songTitle}`}
                              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary"
                            >
                              <MoreVertical className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onCloseAutoFocus={(e) => { if (editingNotes[cs.id] !== undefined) e.preventDefault(); }}>
                            {/* Vozes desta canção (1ª/2ª/3ª) — visível para todos, editável só por quem pode. */}
                            {hasVocalists && (
                              <DropdownMenuItem onClick={openVoices}>
                                <Mic2 /> Vozes da canção
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => toggleSongNotes(cs)}>
                              <MessageSquare /> {editingNotes[cs.id] !== undefined ? "Salvar observação" : "Observação da canção"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {moveItems}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-ios-red focus:text-ios-red" onClick={() => removeSong(cs.id)}>
                              <Trash2 /> Remover do roteiro
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {/* Tom de execução deste culto */}
                      <div className="flex min-h-11 items-center">
                        <Select value={effectiveKey || undefined} onValueChange={(v) => updateSongKey(cs.id, v)} disabled={!canEdit}>
                          <SelectTrigger
                            title="Tom em que o grupo vai tocar neste culto"
                            aria-label={`Tocar em ${effectiveKey || "tom não definido"}`}
                            className={cn(
                              // 32px visíveis, alvo de toque de 44pt (::before), como Button size="sm".
                              "relative h-8 w-auto min-w-11 justify-center gap-1 rounded-full border-0 bg-fill-tertiary px-2 text-subhead font-semibold text-foreground tabular-nums before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 focus:ring-[3px] focus:ring-ios-blue/40 focus:ring-offset-0 disabled:cursor-default disabled:opacity-100 [&>svg]:hidden sm:min-w-[52px] sm:px-3 sm:[&>svg]:block",
                              !canEdit && "sm:[&>svg]:hidden",
                            )}
                          >
                            <SelectValue placeholder="Tom" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {KEY_OPTIONS.map((k) => (
                              <SelectItem key={k} value={k}>{k}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {!canEdit && hasVocalists ? (
                        <button
                          type="button"
                          title="Vozes da canção"
                          aria-label="Vozes da canção"
                          onClick={openVoices}
                          className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary",
                            lines.length > 0 ? "hidden text-primary sm:flex" : "text-muted-foreground",
                          )}
                        >
                          <Mic2 className="h-5 w-5" strokeWidth={2} />
                        </button>
                      ) : null}
                      {grip}
                    </div>
                  </div>

                  {lines.length > 0 && (
                    <button
                      type="button"
                      title="Vozes da canção"
                      onClick={openVoices}
                      className="grid min-h-11 w-full gap-y-1.5 px-4 pb-3 text-left sm:-mt-1.5 sm:flex sm:min-h-0 sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-0.5 sm:pb-2.5 sm:pl-[104px]"
                    >
                      <span className="sr-only">Vozes de {songTitle}: </span>
                      <Mic2 className="hidden h-[13px] w-[13px] shrink-0 text-muted-foreground sm:block" strokeWidth={2.25} aria-hidden="true" />
                      {lines.map((line) => (
                        <span key={line.voice} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-1 text-footnote text-muted-foreground sm:block">
                          <span className="font-semibold text-foreground">{line.voice}ª</span>{" "}
                          <span className="min-w-0 break-words">
                            {line.people
                              .map((p) => (p.part ? `${p.name} (${p.part.replace(" (voz)", "")})` : p.name))
                              .join(", ")}
                          </span>
                        </span>
                      ))}
                    </button>
                  )}
                  {isEditingNotes ? (
                    <div className="pb-3 pl-4 pr-4 sm:-mt-1 sm:pl-[104px]">
                      <Textarea
                        autoFocus
                        aria-label="Observação da canção"
                        value={editingNotes[cs.id]}
                        onChange={(e) => setEditingNotes((prev) => ({ ...prev, [cs.id]: e.target.value }))}
                        placeholder="Ex: começar só com violão, repetir refrão 3x..."
                        className="min-h-[72px] resize-none rounded-[14px] border-0 bg-grouped-tertiary text-subhead placeholder:text-label-tertiary focus-visible:ring-[3px] focus-visible:ring-ios-blue/40 focus-visible:ring-offset-0"
                      />
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" onClick={() => toggleSongNotes(cs)}>
                          Salvar
                        </Button>
                      </div>
                    </div>
                  ) : cs.notes ? (
                    <p className="flex gap-1.5 px-4 pb-3 text-footnote text-muted-foreground sm:-mt-1.5 sm:pb-2.5 sm:pl-[104px]">
                      <MessageSquare className="mt-[3px] h-[13px] w-[13px] shrink-0" strokeWidth={2.25} aria-hidden="true" />
                      <span className="min-w-0 break-words">{cs.notes}</span>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AddCultoSongModal open={addSongOpen} onOpenChange={setAddSongOpen} cultoId={id!} />
      <CultoLineupModal open={lineupOpen} onOpenChange={setLineupOpen} cultoId={id!} cultoDate={culto?.date} cultoName={culto?.name} />
      <CultoBlockModal
        open={blockOpen}
        onOpenChange={(o) => { setBlockOpen(o); if (!o) setEditBlock(null); }}
        cultoId={id!}
        editBlock={editBlock}
        nextSortOrder={roteiro.length}
      />
      <CultoDuplicateModal open={duplicateOpen} onOpenChange={setDuplicateOpen} sourceCulto={culto} />
      <CultoShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        culto={culto}
        roteiro={shareRoteiro}
        lineup={shareLineup}
        voices={voicesByCultoSong}
        memberInfo={memberInfo}
        canPublish={canEdit}
      />
      <CultoSongVoicesModal
        open={!!voicesSong}
        onOpenChange={(o) => !o && setVoicesSong(null)}
        cultoSongId={voicesSong?.id ?? null}
        cultoId={id!}
        songTitle={voicesSong?.title}
        lineup={lineup as any[]}
        canEdit={canEdit}
      />
      <SongSummaryModal open={!!summarySongId} onOpenChange={(o) => !o && setSummarySongId(null)} songId={summarySongId} cultoNotes={summaryNotes} cultoNotesAuthor={summaryNotesAuthor} />

      <AlertDialog open={!!deleteBlockId} onOpenChange={(o) => !o && setDeleteBlockId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir momento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-ios-red text-white hover:bg-ios-red/90" onClick={deleteBlock}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
