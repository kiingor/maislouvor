import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { firePush } from "@/lib/push";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { SongCard } from "@/components/SongCard";
import { AddCultoSongModal } from "@/components/AddCultoSongModal";
import { CultoLineupModal } from "@/components/CultoLineupModal";
import { CultoBlockModal } from "@/components/CultoBlockModal";
import { CultoDuplicateModal } from "@/components/CultoDuplicateModal";
import { SongSummaryModal } from "@/components/SongSummaryModal";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  ArrowLeft,
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
  Share2,
  Loader2,
  Copy,
  BellRing,
  ListPlus,
  Pencil,
  ChevronUp,
  ChevronDown,
  Mic2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { compareInstruments, instrumentIcon, isVocalRole } from "@/data/instruments";
import { buildVoiceLines, type VoiceAssignment } from "@/lib/voices";
import type { ShareRoteiroItem } from "@/lib/shareText";
import { CultoSongVoicesModal } from "@/components/CultoSongVoicesModal";
import { CultoShareModal } from "@/components/CultoShareModal";
import { CHROMATIC_KEYS } from "@/data/chordDictionary";

const KEY_OPTIONS = [...CHROMATIC_KEYS, ...CHROMATIC_KEYS.map((k) => k + "m")];
const SONG_FALLBACK_SECONDS = 240;

function formatTotal(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m} min`;
}

export default function CultoDetail() {
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
    const updates: Promise<any>[] = [];
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

  if (isLoading) {
    return (
      <div className="animate-in-up space-y-4">
        <div className="h-8 w-48 bg-accent rounded-lg animate-pulse" />
        <GlassCard className="h-32 animate-pulse" />
      </div>
    );
  }

  if (!culto) {
    return (
      <div className="animate-in-up text-center py-16">
        <p className="text-muted-foreground">Culto não encontrado.</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => navigate("/app/cultos")}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-in-up">
      <div className="mb-8">
        {/* Title row — back arrow inline (substitui o "← Cultos") */}
        <div className="flex items-start gap-2">
          <button
            onClick={() => navigate("/app/cultos")}
            aria-label="Voltar"
            title="Voltar"
            className="shrink-0 mt-1 -ml-1.5 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{culto.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {new Date(culto.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </p>
            {culto.description && <p className="text-muted-foreground text-sm mt-2">{culto.description}</p>}
          </div>
        </div>

        {/* Ações — uma linha só, somente ícones */}
        <div className="flex items-center gap-2 flex-wrap mt-4">
          {canEdit && (
            <Button variant="outline" size="icon" className="rounded-xl h-9 w-9" title="Escala" onClick={() => setLineupOpen(true)}>
              <Users className="h-4 w-4" />
            </Button>
          )}
          {/* Sem permissão de edição há poucos botões → mostra os rótulos (sobra espaço).
              Com edição há muitos botões → só ícone, pra caber na linha. */}
          {cultoSongs.length > 0 && (
            <Button
              variant="outline"
              size={canEdit ? "icon" : "default"}
              className={`rounded-xl h-9 ${canEdit ? "w-9" : "gap-2 px-3"}`}
              title="Modo Ensaio"
              onClick={() => navigate(`/app/cultos/${id}/present`)}
            >
              <MonitorPlay className="h-4 w-4" />
              {!canEdit && <span className="text-sm font-medium">Modo Ensaio</span>}
            </Button>
          )}
          <Button
            variant="outline"
            size={canEdit ? "icon" : "default"}
            className={`rounded-xl h-9 ${canEdit ? "w-9" : "gap-2 px-3"}`}
            onClick={() => setShareOpen(true)}
            title="Compartilhar escala e repertório"
          >
            <Share2 className="h-4 w-4" />
            {!canEdit && <span className="text-sm font-medium">Compartilhar</span>}
          </Button>
          {canEdit && (
            <Button variant="outline" size="icon" className="rounded-xl h-9 w-9" title="Duplicar culto" onClick={() => setDuplicateOpen(true)}>
              <Copy className="h-4 w-4" />
            </Button>
          )}
          {canEdit && (
            <Button onClick={() => setAddSongOpen(true)} size="icon" className="rounded-xl h-9 w-9 ml-auto" title="Adicionar música">
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Lineup display */}
      {Object.keys(lineupByInstrument).length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Escala</h2>
            {canEdit && pendingEntries.length > 0 && (
              <Button variant="outline" size="sm" className="rounded-lg gap-1.5 h-8 text-xs" disabled={remindLoading} onClick={remindPending}>
                {remindLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                Lembrar pendentes ({pendingEntries.length})
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {lineupEntries.map(([instrument, entries]) => (
              <GlassCard key={instrument} variant="subtle" className="p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  {(() => { const Icon = instrumentIcon(instrument); return <Icon className="h-3.5 w-3.5" />; })()}
                  {instrument}
                </p>
                <div className="space-y-1.5">
                  {entries.map((e: any) => {
                    const profile = e.team_members?.profiles as any;
                    const status = e.status || "pending";
                    const isMine = e.team_members?.profile_id && e.team_members.profile_id === profileId;
                    const StatusIcon = status === "accepted" ? CheckCircle2 : status === "declined" ? XCircle : Clock;
                    const statusColor = status === "accepted" ? "text-green-500" : status === "declined" ? "text-red-500" : "text-yellow-500";
                    return (
                      <div key={e.id}>
                        <div className={`flex items-center gap-2 ${status === "pending" ? "rounded-lg bg-yellow-500/10 px-1.5 py-1 -mx-1" : ""}`}>
                          <Avatar className="h-6 w-6">
                            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                            <AvatarFallback className="text-[9px] bg-accent">
                              {(profile?.full_name ?? "?")[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium truncate flex-1">{profile?.full_name ?? "—"}</span>
                          <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${statusColor}`} />
                        </div>
                        {isMine && status !== "accepted" && (
                          <div className="flex gap-1 mt-1">
                            <Button size="sm" className="h-6 rounded-md text-[11px] px-2 flex-1 gap-1" onClick={() => setLineupStatus(e.id, "accepted")}>
                              <CheckCircle2 className="h-3 w-3" /> Aceitar
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 rounded-md text-[11px] px-2 flex-1 gap-1" onClick={() => setLineupStatus(e.id, "declined")}>
                              <XCircle className="h-3 w-3" /> Recusar
                            </Button>
                          </div>
                        )}
                        {isMine && status === "accepted" && (
                          <button className="text-[11px] text-muted-foreground hover:text-foreground mt-0.5 ml-8" onClick={() => setLineupStatus(e.id, "declined")}>
                            Não poderei ir
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Roteiro header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Roteiro</h2>
          {totalSeconds > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatTotal(totalSeconds)}
            </span>
          )}
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" className="rounded-lg gap-1.5 h-8 text-xs" onClick={() => { setEditBlock(null); setBlockOpen(true); }}>
            <ListPlus className="h-3.5 w-3.5" /> Adicionar momento
          </Button>
        )}
      </div>

      {/* Roteiro list (songs + blocks) */}
      {roteiro.length === 0 ? (
        <GlassCard className="p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
            <Music className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">Roteiro vazio</h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            {canEdit ? "Adicione músicas e momentos (oração, palavra...) para montar o roteiro." : "Nada foi adicionado ainda."}
          </p>
          {canEdit && (
            <Button className="mt-6 rounded-xl gap-2" onClick={() => setAddSongOpen(true)}>
              <Plus className="h-4 w-4" /> Adicionar música
            </Button>
          )}
        </GlassCard>
      ) : (
        <div className="space-y-1">
          {roteiro.map((item, idx) => {
            if (item.kind === "block") {
              const b = item.data;
              return (
                <div
                  key={`block-${b.id}`}
                  draggable={canEdit}
                  onDragStart={handleDragStart(idx)}
                  onDragOver={handleDragOver(idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  className={`rounded-xl transition-all ${dragIdx === idx ? "opacity-40" : ""} ${overIdx === idx && dragIdx !== idx ? "ring-2 ring-primary/40 ring-offset-1" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <div className="shrink-0 flex flex-col">
                        <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === 0} onClick={() => moveItem(idx, idx - 1)}>
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === roteiro.length - 1} onClick={() => moveItem(idx, idx + 1)}>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <GlassCard variant="subtle" className="flex-1 min-w-0 p-3 flex items-center gap-3 border border-dashed border-border/60">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Clock className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{b.title}</p>
                          {b.kind && b.kind !== "moment" && (
                            <span className="text-[9px] font-medium uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">{b.kind}</span>
                          )}
                        </div>
                        {b.notes && <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-1">{b.notes}</p>}
                      </div>
                      {!!b.duration_min && (
                        <span className="text-[11px] text-muted-foreground shrink-0">{b.duration_min} min</span>
                      )}
                      {canEdit && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditBlock(b); setBlockOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteBlockId(b.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </GlassCard>
                  </div>
                </div>
              );
            }

            // SONG
            const cs = item.data;
            // Tom "original": o que está gravado na canção/repertório (cifra).
            // Tom de execução: o override do culto, quando houver.
            const originalKey = cs.songs?.key_current || cs.songs?.key_original || "";
            const effectiveKey = cs.key_override || originalKey;
            const transposed = !!effectiveKey && !!originalKey && effectiveKey !== originalKey;
            return (
              <div
                key={`song-${cs.id}`}
                draggable={canEdit}
                onDragStart={handleDragStart(idx)}
                onDragOver={handleDragOver(idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                className={`rounded-xl transition-all ${dragIdx === idx ? "opacity-40" : ""} ${overIdx === idx && dragIdx !== idx ? "ring-2 ring-primary/40 ring-offset-1" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <div className="shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors">
                      <GripVertical className="h-4 w-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <SongCard
                      song={cs.songs || { id: cs.song_id, title: "—" }}
                      index={idx}
                      hideKey
                      onClick={() => {
                        setSummarySongId(cs.songs?.id || cs.song_id);
                        setSummaryNotes(cs.notes || null);
                        setSummaryNotesAuthor((cs as any).notes_author || null);
                      }}
                      actions={
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {/* Dois tons lado a lado, rotulados: o da cifra (referência, apagado)
                              e o que o grupo vai tocar (destacado). */}
                          <div className="flex items-end gap-1.5">
                            {originalKey && (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[8px] font-medium uppercase tracking-wider text-muted-foreground/70 leading-none">
                                  Original
                                </span>
                                <span
                                  title={`Tom original da canção: ${originalKey}`}
                                  className={`h-7 min-w-[42px] px-2 inline-flex items-center justify-center rounded-lg bg-muted/50 text-[11px] font-medium leading-none ${
                                    transposed ? "text-muted-foreground/60 line-through decoration-1" : "text-muted-foreground"
                                  }`}
                                >
                                  {originalKey}
                                </span>
                              </div>
                            )}
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[8px] font-semibold uppercase tracking-wider text-primary leading-none">
                                Tocar em
                              </span>
                              {/* Tom de execução deste culto */}
                              <Select value={effectiveKey || undefined} onValueChange={(v) => updateSongKey(cs.id, v)} disabled={!canEdit}>
                                <SelectTrigger
                                  title="Tom em que o grupo vai tocar neste culto"
                                  className="h-7 w-[64px] rounded-lg text-[11px] font-bold px-2 bg-primary/15 text-primary border border-primary/40 focus:ring-primary/30 [&>svg]:opacity-70"
                                >
                                  <SelectValue placeholder="Tom" />
                                </SelectTrigger>
                                <SelectContent className="max-h-64">
                                  {KEY_OPTIONS.map((k) => (
                                    <SelectItem key={k} value={k} className="text-xs">{k}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {/* Vozes desta canção (1ª/2ª/3ª) — visível para todos, editável só por quem pode. */}
                            {hasVocalists && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title="Vozes da canção"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVoicesSong({ id: cs.id, title: cs.songs?.title ?? "" });
                                }}
                              >
                                <Mic2 className={`h-3.5 w-3.5 ${voiceLinesByCultoSong.has(cs.id) ? "text-primary" : ""}`} />
                              </Button>
                            )}
                            {canEdit && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  title="Observação da canção"
                                  onClick={(e) => {
                                    e.stopPropagation();
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
                                  }}
                                >
                                  <MessageSquare className={`h-3.5 w-3.5 ${cs.notes ? "text-primary" : ""}`} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  title="Remover do roteiro"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeSong(cs.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      }
                    />
                  </div>
                </div>
                {(() => {
                  const lines = voiceLinesByCultoSong.get(cs.id) ?? [];
                  if (lines.length === 0) return null;
                  return (
                    <div className="mt-1 ml-6 mr-2 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <Mic2 className="h-3 w-3 text-primary/70 shrink-0" />
                      {lines.map((line) => (
                        <span key={line.voice} className="text-[11px] text-muted-foreground">
                          <span className="font-semibold text-foreground/80">{line.voice}ª</span>{" "}
                          {line.people
                            .map((p) => (p.part ? `${p.name} (${p.part.replace(" (voz)", "")})` : p.name))
                            .join(", ")}
                        </span>
                      ))}
                    </div>
                  );
                })()}
                {editingNotes[cs.id] !== undefined && canEdit ? (
                  <div className="mt-1 ml-6 mr-2">
                    <Textarea
                      value={editingNotes[cs.id]}
                      onChange={(e) => setEditingNotes((prev) => ({ ...prev, [cs.id]: e.target.value }))}
                      placeholder="Ex: começar só com violão, repetir refrão 3x..."
                      className="text-xs min-h-[60px] rounded-lg bg-accent/30 border-border/50"
                    />
                  </div>
                ) : cs.notes ? (
                  <p className="text-xs text-muted-foreground mt-1 ml-6 mr-2 italic">{cs.notes}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

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
            <AlertDialogAction onClick={deleteBlock}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
