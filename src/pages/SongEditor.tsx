import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { GlassCard } from "@/components/GlassCard";
import { GlassInput } from "@/components/GlassInput";
import { CoverUpload } from "@/components/CoverUpload";
import { AudioUpload } from "@/components/AudioUpload";
import { SongAudioAttachments } from "@/components/SongAudioAttachments";
import { AudioTrimmer } from "@/components/AudioTrimmer";
import { StemPreviewPlayer } from "@/components/StemPreviewPlayer";
import { SongRepertoriosCard } from "@/components/SongRepertoriosCard";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import { CifraHighlightTextarea } from "@/components/CifraHighlightTextarea";
import { transposeCifra, detectKeyFromCifra } from "@/lib/chordpro";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Save, Loader2, X, Plus, CalendarDays, Download, Sparkles, Gauge, Clock, Youtube, Music2, FileText, Trash2, type LucideIcon } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { splitSegments } from "@/data/chordDictionary";
import { detectBpmFromUrl } from "@/lib/detectBpm";
import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Format a number of seconds as "m:ss". */
function secondsToMmss(total: number): string {
  if (!isFinite(total) || total <= 0) return "";
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Parse "mm:ss" or a bare number of seconds into integer seconds (or null). */
function parseDurationToSeconds(val: string): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  const mmss = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (mmss) {
    const m = parseInt(mmss[1], 10);
    const s = parseInt(mmss[2], 10);
    return m * 60 + s;
  }
  const num = parseFloat(trimmed);
  return isFinite(num) && num > 0 ? Math.round(num) : null;
}

/** Cabeçalho de zona do cadastro: pílula numerada + ícone + título + dica. */
function ZoneHeader({ n, icon: Icon, title, hint }: { n?: number; icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {n != null && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
          {n}
        </span>
      )}
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        {hint && <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>}
      </div>
    </div>
  );
}

export default function SongEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTeam, can } = useTeam();
  const canEdit = can("musicas", "editar");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: song, isLoading } = useQuery({
    queryKey: ["song", id],
    queryFn: async () => {
      const { data } = await supabase.from("songs").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
    // The form hydrates from this query. Refetching while editing (e.g. when the
    // window regains focus after the file picker closes) must NOT happen, or it
    // would wipe in-progress edits/uploads. We hydrate once and keep local state.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: songHistory = [] } = useQuery({
    queryKey: ["song-history", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_songs")
        .select("id, cultos(id, name, date)")
        .eq("song_id", id!)
        .order("created_at", { ascending: false });
      return (data ?? []).map((cs: any) => cs.cultos).filter(Boolean);
    },
    enabled: !!id,
  });

  // Tracks query
  const { data: tracks = [], refetch: refetchTracks } = useQuery({
    queryKey: ["song-tracks", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("song_tracks" as any)
        .select("*")
        .eq("song_id", id!)
        .order("sort_order");
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  // Stem separation (Demucs) status — polls while processing
  const [separating, setSeparating] = useState(false);
  const { data: stemsState } = useQuery({
    queryKey: ["song-stems", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("songs")
        .select("stems_status, stems_error")
        .eq("id", id!)
        .single();
      return data as { stems_status: string; stems_error: string | null } | null;
    },
    enabled: !!id,
    refetchInterval: (query) =>
      (query.state.data as any)?.stems_status === "processing" ? 5000 : false,
  });
  const stemsProcessing = stemsState?.stems_status === "processing";
  const prevStemsStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const s = stemsState?.stems_status;
    if (!s) return;
    if (prevStemsStatus.current === "processing" && s === "done") {
      refetchTracks();
      toast({ title: "Faixas separadas!", description: "As faixas geradas pela IA já estão disponíveis." });
    } else if (prevStemsStatus.current === "processing" && s === "error") {
      toast({ title: "Erro na separação", description: stemsState?.stems_error || "Tente novamente.", variant: "destructive" });
    }
    prevStemsStatus.current = s;
  }, [stemsState?.stems_status, stemsState?.stems_error, refetchTracks]);

  const handleSeparateStems = async () => {
    if (!id || !audioPath) return;
    setSeparating(true);
    try {
      const { data, error } = await supabase.functions.invoke("separate-stems", {
        body: { song_id: id, audio_path: audioPath },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao iniciar separação");
      toast({
        title: "Separação iniciada",
        description: "Leva alguns minutos. As faixas aparecem aqui automaticamente quando ficarem prontas.",
      });
      qc.invalidateQueries({ queryKey: ["song-stems", id] });
    } catch (e: any) {
      toast({ title: "Erro ao iniciar separação", description: e.message, variant: "destructive" });
    } finally {
      setSeparating(false);
    }
  };

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [keyOriginal, setKeyOriginal] = useState("");
  const [keyCurrent, setKeyCurrent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [cifraText, setCifraText] = useState("");
  const [lyricsText, setLyricsText] = useState("");
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [theme, setTheme] = useState("");
  const [bpm, setBpm] = useState("");
  const [durationInput, setDurationInput] = useState(""); // mm:ss or seconds
  const [detectingBpm, setDetectingBpm] = useState(false);
  const [importingYt, setImportingYt] = useState(false);
  // Aviso persistente quando o import falha por cookie do YouTube expirado (só o admin renova).
  const [ytCookieExpired, setYtCookieExpired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tomDelta, setTomDelta] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Moises import modal
  const [showMoisesModal, setShowMoisesModal] = useState(false);
  const [moisesText, setMoisesText] = useState("");
  const [importingMoises, setImportingMoises] = useState(false);

  // Hydrate the form ONCE per song id. Re-running this on every `song` refetch
  // would clobber the user's unsaved edits and just-uploaded cover/audio.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!song) return;
    if (hydratedFor.current === song.id) return;
    hydratedFor.current = song.id;
    setTitle(song.title || "");
    setArtist(song.artist || "");
    setKeyOriginal(song.key_original || "");
    setKeyCurrent(song.key_current || "");
    setMediaUrl(song.media_url || "");
    setCifraText(song.cifra_text || "");
    setTomDelta(0);
    setLyricsText((song as any).lyrics_text || "");
    setCoverPath(song.cover_path || null);
    setAudioPath((song as any).audio_path || null);
    setTags((song as any).tags || []);
    setTheme((song as any).theme || "");
    const songBpm = (song as any).bpm;
    setBpm(songBpm != null ? String(songBpm) : "");
    const dur = (song as any).duration_seconds;
    setDurationInput(dur != null ? secondsToMmss(dur) : "");
  }, [song]);

  // Auto-fill duration from the audio file's metadata when it's not set yet.
  useEffect(() => {
    if (!audioPath || durationInput.trim()) return;
    let cancelled = false;
    let audio: HTMLAudioElement | null = null;
    (async () => {
      const { data } = await supabase.storage.from("audio").createSignedUrl(audioPath, 3600);
      if (cancelled || !data?.signedUrl) return;
      audio = new Audio();
      audio.preload = "metadata";
      audio.src = data.signedUrl;
      audio.addEventListener("loadedmetadata", () => {
        if (cancelled) return;
        const d = audio?.duration;
        if (d && isFinite(d)) {
          setDurationInput((prev) => (prev.trim() ? prev : secondsToMmss(d)));
        }
      });
    })();
    return () => {
      cancelled = true;
      if (audio) { audio.src = ""; audio = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioPath]);

  const handleDetectBpm = async () => {
    if (!audioPath) return;
    setDetectingBpm(true);
    try {
      const { data } = await supabase.storage.from("audio").createSignedUrl(audioPath, 3600);
      if (!data?.signedUrl) throw new Error("Não foi possível acessar o áudio.");
      const detected = await detectBpmFromUrl(data.signedUrl);
      if (detected) {
        setBpm(String(detected));
        toast({ title: `BPM detectado: ${detected}`, description: "Revise e salve a música." });
      } else {
        toast({ title: "Não foi possível detectar o BPM", description: "Informe manualmente.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro ao detectar BPM", description: e.message, variant: "destructive" });
    } finally {
      setDetectingBpm(false);
    }
  };

  const handleSave = async () => {
    if (!id || !title.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("songs")
      .update({
        title: title.trim(),
        artist: artist.trim() || null,
        media_url: mediaUrl.trim() || null,
        cifra_text: cifraText || null,
        lyrics_text: lyricsText || null,
        cover_path: coverPath,
        audio_path: audioPath,
        tags: tags.length > 0 ? tags : [],
        theme: theme.trim() || null,
        bpm: bpm.trim() ? Math.round(Number(bpm)) || null : null,
        duration_seconds: parseDurationToSeconds(durationInput),
      } as any)
      .eq("id", id);
    setSaving(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Música salva" });
      qc.invalidateQueries({ queryKey: ["song", id] });
      qc.invalidateQueries({ queryKey: ["repertorio-songs"] });
    }
  };

  const readOnly = !canEdit;

  const handleDeleteSong = async () => {
    if (!id) return;
    const { error } = await supabase.from("songs").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Música excluída" });
    qc.invalidateQueries({ queryKey: ["library-songs"] });
    qc.invalidateQueries({ queryKey: ["repertorio-songs"] });
    qc.invalidateQueries({ queryKey: ["dashboard-songs"] });
    navigate("/app/repertorios");
  };

  // Persist a single column immediately — used right after an upload so an
  // accidental reload (e.g. the PWA auto-updating) never loses an uploaded
  // cover/audio. We write straight to the DB WITHOUT invalidating the song
  // query, so other unsaved edits in the form (cifra, título…) aren't clobbered.
  const persistField = async (fields: Record<string, any>) => {
    if (!id || readOnly) return;
    const { error } = await supabase.from("songs").update(fields as any).eq("id", id);
    if (error) {
      toast({ title: "Erro ao salvar arquivo", description: error.message, variant: "destructive" });
    }
  };

  const handleImportYoutube = async () => {
    const url = mediaUrl.trim();
    if (!id || !url) return;
    // O campo "Link de mídia" É a fonte do import — garante que fique salvo.
    persistField({ media_url: url });
    setImportingYt(true);
    setYtCookieExpired(false);
    try {
      const { data, error } = await supabase.functions.invoke("import-youtube", {
        body: { song_id: id, url },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao enfileirar");
      // Cache hit: esse vídeo já estava no acervo → a edge function já copiou o áudio.
      if (data.cached) {
        const { data: s } = await supabase.from("songs").select("audio_path, cover_path").eq("id", id).single();
        if ((s as any)?.audio_path) setAudioPath((s as any).audio_path);
        if ((s as any)?.cover_path) setCoverPath((s as any).cover_path);
        toast({ title: "Áudio reaproveitado!", description: "Esse vídeo já estava no acervo — sem precisar baixar de novo." });
        setImportingYt(false);
        return;
      }
      toast({
        title: "Baixando do YouTube…",
        description: "O download roda no worker do seu PC. O áudio aparece aqui quando ficar pronto.",
      });
      const start = Date.now();
      const poll = async () => {
        const { data: jrows } = await supabase
          .from("yt_import_jobs" as any)
          .select("status, error")
          .eq("song_id", id)
          .order("created_at", { ascending: false })
          .limit(1);
        const j: any = jrows?.[0];
        if (j?.status === "done") {
          const { data: s } = await supabase.from("songs").select("audio_path, cover_path").eq("id", id).single();
          const ap = (s as any)?.audio_path;
          if (ap) setAudioPath(ap);
          if ((s as any)?.cover_path) setCoverPath((s as any).cover_path);
          toast({ title: "Áudio importado do YouTube!", description: "Capa e áudio prontos — pode separar em faixas." });
          setImportingYt(false);
          return;
        }
        if (j?.status === "error") {
          const raw = j.error || "";
          // Cookie do YouTube expirado → só o administrador renova. Mensagem clara + aviso fixo.
          const cookieExpired = /COOKIE_EXPIRED|cookies for the authentication|sign in to confirm|not a bot/i.test(raw);
          if (cookieExpired) {
            setYtCookieExpired(true);
            toast({
              title: "Importação do YouTube indisponível",
              description: "O acesso ao YouTube expirou. Avise o administrador do app para renovar.",
              variant: "destructive",
            });
          } else {
            toast({ title: "Erro ao baixar do YouTube", description: raw || "Tente outro link.", variant: "destructive" });
          }
          setImportingYt(false);
          return;
        }
        if (Date.now() - start > 300000) {
          toast({
            title: "Ainda processando…",
            description: "Se o worker do seu PC estiver offline, o download espera na fila. Recarregue em instantes.",
          });
          setImportingYt(false);
          return;
        }
        setTimeout(poll, 4000);
      };
      setTimeout(poll, 4000);
    } catch (e: any) {
      toast({ title: "Erro ao importar do YouTube", description: e?.message, variant: "destructive" });
      setImportingYt(false);
    }
  };

  // Transposição da cifra — 100% offline (lib/chordpro, sem IA/custo). Transpõe o
  // texto no lugar; ao salvar, esse tom vira o padrão da música. `tomDelta` guarda
  // o deslocamento líquido desde que a cifra foi carregada, pra "voltar ao original".
  const tomDown = () => { setCifraText((t) => transposeCifra(t, -1)); setTomDelta((d) => d - 1); };
  const tomUp = () => { setCifraText((t) => transposeCifra(t, 1)); setTomDelta((d) => d + 1); };
  const tomReset = () => {
    if (tomDelta === 0) return;
    setCifraText((t) => transposeCifra(t, -tomDelta));
    setTomDelta(0);
  };

  const handleImportMoises = async () => {
    const trimmed = moisesText.trim();
    if (!trimmed) return;

    if (/^https?:\/\/\S+$/i.test(trimmed)) {
      toast({
        title: "Cole o conteúdo completo",
        description: "O link sozinho do Moises pode importar música errada. Abra o link, copie tudo (Ctrl+A / Ctrl+C) e cole aqui.",
        variant: "destructive",
      });
      return;
    }

    setImportingMoises(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-moises", {
        body: { text: trimmed },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro desconhecido");

      const d = data.data;
      if (d.title && !title.trim()) setTitle(d.title);
      if (d.artist && !artist.trim()) setArtist(d.artist);
      if (d.key_original) {
        setKeyOriginal(d.key_original);
        if (!keyCurrent) setKeyCurrent(d.key_original);
      }
      if (d.cifra_text) setCifraText(d.cifra_text);
      if (d.lyrics_text) setLyricsText(d.lyrics_text);

      toast({ title: "Dados importados do Moises!", description: "Revise e salve a música." });
      setShowMoisesModal(false);
      setMoisesText("");
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    } finally {
      setImportingMoises(false);
    }
  };

  // YouTube embed helper
  const youtubeId = mediaUrl.match(/(?:youtu\.be\/|v=)([\w-]{11})/)?.[1];

  if (isLoading) {
    return (
      <div className="animate-in-up space-y-4">
        <div className="h-8 w-48 bg-accent rounded-lg animate-pulse" />
        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          <GlassCard className="h-96 animate-pulse" />
          <GlassCard className="h-96 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!song) {
    return (
      <div className="animate-in-up text-center py-16">
        <p className="text-muted-foreground">Música não encontrada.</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-in-up">
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              title="Excluir música"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          {!readOnly && (
            <Button onClick={handleSave} disabled={saving || !title.trim()} className="rounded-xl gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr] lg:items-start">
        {/* === Coluna esquerda: pipeline de cadastro (zonas 1-4) === */}
        <div className="min-w-0 space-y-6">
          {/* Zona 1 — Identidade */}
          <GlassCard className="p-6 space-y-4">
            <ZoneHeader n={1} icon={Music2} title="Identidade" hint="Capa, nome e como a equipe encontra a música" />
            <div className="w-40 mx-auto">
              <CoverUpload
                songId={id!}
                teamId={currentTeam?.id || ""}
                coverPath={coverPath}
                onUpload={(path) => { setCoverPath(path); persistField({ cover_path: path }); }}
                readOnly={readOnly}
              />
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Título</label>
                <GlassInput value={title} onChange={(e) => setTitle(e.target.value)} readOnly={readOnly} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Artista</label>
                <GlassInput value={artist} onChange={(e) => setArtist(e.target.value)} readOnly={readOnly} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tema</label>
                <GlassInput value={theme} onChange={(e) => setTheme(e.target.value)} readOnly={readOnly} placeholder="Ex: Adoração, Celebração..." />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {tag}
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => setTags(tags.filter((_, j) => j !== i))}
                          className="hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {!readOnly && (
                  <div className="flex gap-1.5">
                    <GlassInput
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="Nova tag..."
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = tagInput.trim();
                          if (val && !tags.includes(val)) {
                            setTags([...tags, val]);
                            setTagInput("");
                          }
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl h-9 px-2"
                      onClick={() => {
                        const val = tagInput.trim();
                        if (val && !tags.includes(val)) {
                          setTags([...tags, val]);
                          setTagInput("");
                        }
                      }}
                      disabled={!tagInput.trim()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </GlassCard>

          {/* Zona 2 — Mídia & áudio */}
          <GlassCard className="p-6 space-y-4">
            <ZoneHeader n={2} icon={Youtube} title="Mídia & áudio" hint="Referência e arquivo da música" />
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Link de mídia</label>
                <GlassInput value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} readOnly={readOnly} placeholder="Link do YouTube, Spotify..." />
              </div>
              {youtubeId && (
                <div className="aspect-video rounded-xl overflow-hidden">
                  <iframe
                    src={`https://www.youtube.com/embed/${youtubeId}`}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="YouTube preview"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Áudio da música</label>
                {!readOnly && !audioPath ? (
                  <>
                    {/* Duas formas de obter o áudio: arquivo OU o link do YouTube acima */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <AudioUpload
                        songId={id!}
                        teamId={currentTeam?.id || ""}
                        audioPath={audioPath}
                        onUpload={(path) => { setAudioPath(path); persistField({ audio_path: path }); }}
                        readOnly={readOnly}
                        compact
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full rounded-xl gap-2"
                        onClick={handleImportYoutube}
                        disabled={importingYt || !youtubeId}
                        title={youtubeId ? "Importar áudio do link do YouTube" : "Cole um link do YouTube no campo Link de mídia acima"}
                      >
                        {importingYt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
                        {importingYt ? "Baixando..." : "Do YouTube"}
                      </Button>
                    </div>
                    {!youtubeId && !importingYt && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Para importar do YouTube, cole o link no campo <strong>Link de mídia</strong> acima.
                      </p>
                    )}
                    {importingYt && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">Baixando do YouTube… pode levar ~1 min.</p>
                    )}
                    {ytCookieExpired && !importingYt && (
                      <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                        ⚠️ O acesso ao YouTube expirou. <strong>Avise o administrador do app</strong> para renovar o login — depois é só tentar importar de novo.
                      </div>
                    )}
                  </>
                ) : (
                  <AudioUpload
                    songId={id!}
                    teamId={currentTeam?.id || ""}
                    audioPath={audioPath}
                    onUpload={(path) => { setAudioPath(path); persistField({ audio_path: path }); }}
                    readOnly={readOnly}
                    compact
                  />
                )}
              </div>
            </div>
          </GlassCard>

          <GlassCard className="min-w-0 p-6">
            <SongAudioAttachments
              key={song.id}
              songId={song.id}
              teamId={song.team_id}
              readOnly={readOnly || song.team_id !== currentTeam?.id}
            />
          </GlassCard>

          {/* Zona 3 — Processamento (aparece quando há áudio) */}
          {audioPath && (!readOnly || tracks.length > 0) && (
            <GlassCard className="p-6 space-y-4">
              <ZoneHeader n={3} icon={Sparkles} title="Processamento" hint="Corte e separação por IA" />
              <div className="space-y-3">
                {!readOnly && (
                  <AudioTrimmer
                    key={audioPath}
                    audioPath={audioPath}
                    teamId={currentTeam?.id || ""}
                    songId={id!}
                    onTrimmed={() => {
                      qc.invalidateQueries({ queryKey: ["song", id] });
                    }}
                  />
                )}
                {!readOnly && (
                  <div className="space-y-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl gap-1.5 w-full"
                      onClick={handleSeparateStems}
                      disabled={separating || stemsProcessing}
                    >
                      {separating || stemsProcessing ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Separando faixas... (alguns min)</>
                      ) : (
                        <><Sparkles className="h-3.5 w-3.5" /> Separar em faixas (IA)</>
                      )}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      Gera Vocais, Bateria, Baixo, Guitarra, Teclado e Outros a partir do áudio.
                    </p>
                  </div>
                )}
                {tracks.length > 0 && (
                  <StemPreviewPlayer
                    tracks={tracks}
                    originalAudioPath={audioPath}
                    songId={id}
                    songKey={(song as any)?.key_original}
                  />
                )}
              </div>
            </GlassCard>
          )}

          {/* Zona 4 — Dados musicais (BPM/Duração: travados até ter áudio) */}
          <GlassCard className="p-6 space-y-4">
            <ZoneHeader
              n={4}
              icon={Gauge}
              title="Dados musicais"
              hint={audioPath ? "Detectados do áudio — ajuste se precisar" : "Disponível após adicionar o áudio"}
            />
            {audioPath ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Gauge className="h-3 w-3" /> BPM
                  </label>
                  <div className="flex gap-1.5">
                    <GlassInput
                      type="number"
                      inputMode="numeric"
                      min={40}
                      max={240}
                      value={bpm}
                      onChange={(e) => setBpm(e.target.value)}
                      readOnly={readOnly}
                      placeholder="100"
                      className="flex-1"
                    />
                    {!readOnly && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl h-9 px-2 shrink-0"
                        onClick={handleDetectBpm}
                        disabled={detectingBpm}
                        title="Detectar BPM do áudio"
                      >
                        {detectingBpm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Duração
                  </label>
                  <GlassInput
                    value={durationInput}
                    onChange={(e) => setDurationInput(e.target.value)}
                    readOnly={readOnly}
                    placeholder="mm:ss"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Adicione o áudio acima para detectar BPM e duração automaticamente.
              </p>
            )}
          </GlassCard>

          {/* Repertórios — aloca a música em vários repertórios (muitos-para-muitos) */}
          {id && currentTeam?.id && (
            <SongRepertoriosCard songId={id} teamId={currentTeam.id} readOnly={readOnly} />
          )}
        </div>

        {/* === Coluna direita: Zona 5 — Conteúdo === */}
        <GlassCard className="p-6 space-y-4 lg:sticky lg:top-6">
          <ZoneHeader n={5} icon={FileText} title="Conteúdo" hint="Cifra e letra para o time" />
          <Tabs defaultValue="cifra" className="w-full">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="cifra" className="flex-1">Cifra</TabsTrigger>
              <TabsTrigger value="lyrics" className="flex-1">Letra</TabsTrigger>
            </TabsList>
            <TabsContent value="cifra">
              {/* Controle de tom — transpõe a cifra offline; salva como padrão da música */}
              {!readOnly && cifraText.trim() && (
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs text-muted-foreground">
                    Transpor cifra {tomDelta !== 0 && <span className="text-primary font-medium">({tomDelta > 0 ? "+" : ""}{tomDelta})</span>}
                  </span>
                  <div className="flex items-center rounded-lg glass-input overflow-hidden text-sm">
                    <button type="button" onClick={tomDown} className="px-3 py-1.5 font-semibold hover:bg-accent/60 transition-colors" title="Descer ½ tom">−1</button>
                    <button
                      type="button"
                      onClick={tomReset}
                      className="px-3 py-1.5 min-w-[3rem] text-center border-x border-border font-bold text-primary hover:bg-accent/60 transition-colors"
                      title="Tom atual — toque para voltar ao original"
                    >
                      {detectKeyFromCifra(cifraText) ?? "Tom"}
                    </button>
                    <button type="button" onClick={tomUp} className="px-3 py-1.5 font-semibold hover:bg-accent/60 transition-colors" title="Subir ½ tom">+1</button>
                    {tomDelta !== 0 && (
                      <button type="button" onClick={tomReset} className="px-2 py-1.5 border-l border-border text-muted-foreground hover:bg-accent/60 transition-colors" title="Voltar ao tom original">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
              <CifraHighlightTextarea
                value={cifraText}
                onChange={(e) => setCifraText(e.target.value)}
                readOnly={readOnly}
                className="w-full"
                placeholder="Cole ou digite a cifra aqui..."
              />
            </TabsContent>
            <TabsContent value="lyrics">
              <AutoGrowTextarea
                value={lyricsText}
                onChange={(e) => setLyricsText(e.target.value)}
                readOnly={readOnly}
                className="w-full min-h-[260px] max-h-[70vh] rounded-xl glass-input p-4 font-mono text-sm leading-relaxed resize-none placeholder:text-muted-foreground/60 focus-visible:outline-none"
                placeholder="Cole ou digite a letra aqui. Use [tags] para separar as partes (ex: [Refrão], [Verso 1])..."
              />
            </TabsContent>
          </Tabs>
        </GlassCard>

        {/* === Histórico — referência, largura total === */}
        <GlassCard className="p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Histórico</h3>
            {songHistory.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5">
                Tocada {songHistory.length}x
              </Badge>
            )}
          </div>
          {songHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ainda não foi tocada em nenhum culto.</p>
          ) : (
            <div className="space-y-1.5">
              {songHistory.slice(0, 8).map((culto: any, idx: number) => (
                <button
                  key={culto.id + "-" + idx}
                  onClick={() => navigate(`/app/cultos/${culto.id}`)}
                  className="w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-lg hover:bg-accent/40 transition-colors"
                >
                  <span className="text-xs font-medium truncate">{culto.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {new Date(culto.date).toLocaleDateString("pt-BR")}
                  </span>
                </button>
              ))}
              {songHistory.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Última vez: {formatDistanceToNow(new Date(songHistory[0].date), { addSuffix: true, locale: ptBR })}
                </p>
              )}
            </div>
          )}
        </GlassCard>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{title || "música"}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A música será removida da biblioteca e de todos os repertórios e cultos onde aparece. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSong} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
