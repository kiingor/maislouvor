import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { SongCard } from "@/components/SongCard";
import { AddCultoSongModal } from "@/components/AddCultoSongModal";
import { CultoLineupModal } from "@/components/CultoLineupModal";
import { SongSummaryModal } from "@/components/SongSummaryModal";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Music, Plus, MonitorPlay, Trash2, Users, GripVertical, CheckCircle2, XCircle, Clock, MessageSquare } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { INSTRUMENT_ICONS } from "@/data/instruments";

export default function CultoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canEdit, profileId } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [summarySongId, setSummarySongId] = useState<string | null>(null);
  const [summaryNotes, setSummaryNotes] = useState<string | null>(null);
  const [summaryNotesAuthor, setSummaryNotesAuthor] = useState<any>(null);

  const { data: culto, isLoading } = useQuery({
    queryKey: ["culto", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("cultos")
        .select("*")
        .eq("id", id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  const { data: cultoSongs = [] } = useQuery({
    queryKey: ["culto-songs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_songs")
        .select("*, songs(id, title, artist, key_current, cover_path, tags, theme), notes_author:profiles!culto_songs_notes_author_id_fkey(full_name, avatar_url)")
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

  // Map song_id -> repertório names
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
        .select("*, team_members(id, profiles(full_name, avatar_url))")
        .eq("culto_id", id!);
      return data ?? [];
    },
    enabled: !!id,
  });

  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  const updateSongNotes = async (cultoSongId: string, notes: string) => {
    const { error } = await supabase.from("culto_songs").update({ notes, notes_author_id: profileId } as any).eq("id", cultoSongId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
  };

  const removeSong = async (cultoSongId: string) => {
    const { error } = await supabase.from("culto_songs").delete().eq("id", cultoSongId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else qc.invalidateQueries({ queryKey: ["culto-songs", id] });
  };

  // Drag reorder state
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

    const items = [...cultoSongs];
    const [moved] = items.splice(dragIdx, 1);
    items.splice(idx, 0, moved);

    // Update sort_order in DB
    const updates = items.map((cs: any, i: number) =>
      supabase.from("culto_songs").update({ sort_order: i } as any).eq("id", cs.id)
    );
    await Promise.all(updates);
    qc.invalidateQueries({ queryKey: ["culto-songs", id] });

    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  // Group lineup by instrument
  const lineupByInstrument: Record<string, any[]> = {};
  lineup.forEach((l: any) => {
    if (!lineupByInstrument[l.instrument]) lineupByInstrument[l.instrument] = [];
    lineupByInstrument[l.instrument].push(l);
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
        <button
          onClick={() => navigate("/app/cultos")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Cultos
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{culto.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {new Date(culto.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </p>
            {culto.description && (
              <p className="text-muted-foreground text-sm mt-2">{culto.description}</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {canEdit && (
              <Button variant="outline" onClick={() => setLineupOpen(true)} className="rounded-xl gap-2">
                <Users className="h-4 w-4" /> Escala
              </Button>
            )}
            {cultoSongs.length > 0 && (
              <Button variant="outline" onClick={() => navigate(`/app/cultos/${id}/present`)} className="rounded-xl gap-2">
                <MonitorPlay className="h-4 w-4" /> Apresentar
              </Button>
            )}
            {canEdit && (
              <>
                <Button onClick={() => setAddSongOpen(true)} size="icon" className="rounded-xl sm:hidden h-9 w-9">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button onClick={() => setAddSongOpen(true)} className="rounded-xl gap-2 hidden sm:inline-flex">
                  <Plus className="h-4 w-4" /> Adicionar música
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lineup display */}
      {Object.keys(lineupByInstrument).length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Escala</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(lineupByInstrument).map(([instrument, entries]) => (
              <GlassCard key={instrument} variant="subtle" className="p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  {(() => { const Icon = INSTRUMENT_ICONS[instrument]; return Icon ? <Icon className="h-3.5 w-3.5" /> : null; })()}
                  {instrument}
                </p>
                <div className="space-y-1.5">
                  {entries.map((e: any) => {
                    const profile = e.team_members?.profiles as any;
                    const status = e.status || "pending";
                    const statusIcon = status === "accepted" ? CheckCircle2 : status === "declined" ? XCircle : Clock;
                    const statusColor = status === "accepted" ? "text-green-500" : status === "declined" ? "text-red-500" : "text-yellow-500";
                    const StatusIcon = statusIcon;
                    return (
                      <div key={e.id} className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                          <AvatarFallback className="text-[9px] bg-accent">
                            {(profile?.full_name ?? "?")[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium truncate flex-1">{profile?.full_name ?? "—"}</span>
                        <StatusIcon className={`h-3.5 w-3.5 ${statusColor}`} />
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Songs */}
      {cultoSongs.length === 0 ? (
        <GlassCard className="p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
            <Music className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">Nenhuma música</h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            {canEdit ? "Adicione músicas do repertório geral a este culto." : "Nenhuma música foi adicionada ainda."}
          </p>
          {canEdit && (
            <Button className="mt-6 rounded-xl gap-2" onClick={() => setAddSongOpen(true)}>
              <Plus className="h-4 w-4" /> Adicionar música
            </Button>
          )}
        </GlassCard>
      ) : (
        <div className="space-y-1">
          {cultoSongs.map((cs: any, idx: number) => (
            <div
              key={cs.id}
              draggable={canEdit}
              onDragStart={handleDragStart(idx)}
              onDragOver={handleDragOver(idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              className={`rounded-xl transition-all ${
                dragIdx === idx ? "opacity-40" : ""
              } ${overIdx === idx && dragIdx !== idx ? "ring-2 ring-primary/40 ring-offset-1" : ""}`}
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
                    onClick={() => {
                      setSummarySongId(cs.songs?.id || cs.song_id);
                      setSummaryNotes(cs.notes || null);
                      setSummaryNotesAuthor((cs as any).notes_author || null);
                    }}
                    actions={canEdit ? (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
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
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSong(cs.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : undefined}
                  />
                </div>
              </div>
              {/* Notes display/edit */}
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
          ))}
        </div>
      )}




      <AddCultoSongModal open={addSongOpen} onOpenChange={setAddSongOpen} cultoId={id!} />
      <CultoLineupModal open={lineupOpen} onOpenChange={setLineupOpen} cultoId={id!} cultoDate={culto?.date} />
      <SongSummaryModal open={!!summarySongId} onOpenChange={(o) => !o && setSummarySongId(null)} songId={summarySongId} cultoNotes={summaryNotes} cultoNotesAuthor={summaryNotesAuthor} />
    </div>
  );
}
