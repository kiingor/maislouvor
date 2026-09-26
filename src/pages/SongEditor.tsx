import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/shell/PageHeader";
import { ToolbarButton } from "@/components/shell/ToolbarButton";
import { CoverUpload } from "@/components/CoverUpload";
import { AudioUpload } from "@/components/AudioUpload";
import { SongAudioAttachments } from "@/components/SongAudioAttachments";
import { AudioTrimmer } from "@/components/AudioTrimmer";
import { StemPreviewPlayer } from "@/components/StemPreviewPlayer";
import { SongRepertoriosCard } from "@/components/SongRepertoriosCard";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import { CifraHighlightTextarea } from "@/components/CifraHighlightTextarea";
import { transposeCifra, detectKeyFromCifra } from "@/lib/chordpro";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertTriangle, CalendarDays, ChevronRight, Clock, Gauge, Loader2, MoreHorizontal, Music2, Plus, RotateCcw, Sparkles, Trash2, X, Youtube } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { detectBpmFromUrl } from "@/lib/detectBpm";
import { useState, useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
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

/* Lista agrupada iOS (HIG > Lists and tables; spec §5): card opaco, linhas de 52pt,
   separador hairline recuado até o texto (16pt, ou 58pt depois de um ícone de 30pt). */
const groupCard = "overflow-hidden rounded-card bg-card";
const rowBase =
  "relative flex min-h-[52px] items-center gap-3 px-4 py-1.5 before:pointer-events-none before:absolute before:right-0 before:top-0 before:border-t before:border-separator first:before:hidden";
const rowSep16 = "before:left-4";
const rowSep58 = "before:left-[58px]";
const rowIcon = "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground";
const rowSymbol = "h-[17px] w-[17px]";
/** Linha de ação tintada (toque = leve realce, como numa célula iOS). */
const actionRow = "w-full text-left transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary disabled:pointer-events-none";
const actionRowDimmed = "[&:disabled>*]:opacity-40";
/** Campo sem moldura dentro de uma linha: o card já é a superfície (placeholder = label terciário). */
const bareInput =
  "h-11 w-full min-w-0 bg-transparent text-body text-foreground placeholder:text-label-tertiary focus:outline-none focus-visible:outline-none";
const groupLabel = "mx-4 mb-1.5 block text-footnote text-muted-foreground";
const helperText = "mx-1 mt-2 text-footnote text-muted-foreground";

/** Cabeçalho de seção: Title3 + qualificador opcional em Subhead secundário + ação à direita. */
function SectionHeader({ id, title, qualifier, action }: { id: string; title: string; qualifier?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-1 mb-2 flex flex-wrap items-end justify-between gap-x-3">
      <h2 id={id} className="min-w-0 break-words text-title3 text-foreground">
        {title}
        {qualifier && <span className="block text-subhead font-normal text-muted-foreground">{qualifier}</span>}
      </h2>
      {action}
    </div>
  );
}

/** Linha de formulário: rótulo à esquerda (Body) e campo ocupando o resto. */
function FieldRow({ label, htmlFor, alignTop, children }: { label: string; htmlFor?: string; alignTop?: boolean; children: ReactNode }) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className={cn(rowBase, rowSep16, "py-0", alignTop && "items-start")}>
      <Label htmlFor={htmlFor} className={cn("w-[72px] shrink-0 text-body text-foreground", alignTop ? "pt-[15px]" : "")}>
        {label}
      </Label>
      <div className="min-w-0 flex-1">{children}</div>
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
  const uid = useId();
  const ids = {
    identity: `${uid}-identity`, media: `${uid}-media`, processing: `${uid}-processing`, data: `${uid}-data`,
    content: `${uid}-content`, history: `${uid}-history`,
    title: `${uid}-title`, artist: `${uid}-artist`, theme: `${uid}-theme`, tag: `${uid}-tag`,
    mediaUrl: `${uid}-media-url`, bpm: `${uid}-bpm`, duration: `${uid}-duration`,
  };

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

  const { data: canEditAdditionalAudio = false } = useQuery({
    queryKey: ["song-audio-edit-permission", id, currentTeam?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_edit_song_audio", { p_song_id: id! });
      return !error && data === true;
    },
    enabled: !!id && !!song && song.team_id === currentTeam?.id,
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

  const addTag = () => {
    const val = tagInput.trim();
    if (val && !tags.includes(val)) {
      setTags([...tags, val]);
      setTagInput("");
    }
  };

  if (isLoading) {
    return (
      <div className="animate-in-up">
        <PageHeader title="Música" back />
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]" aria-busy="true">
          <div className="h-96 rounded-card bg-card animate-pulse motion-reduce:animate-none" />
          <div className="h-96 rounded-card bg-card animate-pulse motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  if (!song) {
    return (
      <div className="animate-in-up">
        <PageHeader title="Música" back />
        <div className="flex flex-col items-center gap-3 rounded-card bg-card px-4 py-10 text-center">
          <Music2 className="h-7 w-7 text-label-tertiary" aria-hidden="true" />
          <p className="text-body text-muted-foreground">Música não encontrada.</p>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  const headerActions = readOnly ? undefined : (
    <>
      {/* HIG > Toolbars: ação destrutiva fora de destaque, num menu; Salvar é a ação principal. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton icon={<MoreHorizontal strokeWidth={2.2} />} aria-label="Mais opções" title="Mais opções" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8}>
          <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-ios-red focus:text-ios-red">
            <Trash2 />
            Excluir música
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolbarButton
        prominent
        label={saving ? "Salvando..." : "Salvar"}
        onClick={handleSave}
        disabled={saving || !title.trim()}
      />
    </>
  );

  const importBusy = importingYt;
  const separatingBusy = separating || stemsProcessing;

  return (
    <div className="animate-in-up">
      <PageHeader title={song.title?.trim() || "Música"} subtitle={song.artist || undefined} back actions={headerActions} />

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-start lg:gap-x-6">
        {/* === Coluna esquerda: cadastro === */}
        <div className="min-w-0 space-y-7">
          {/* Identidade */}
          <section aria-labelledby={ids.identity}>
            <SectionHeader id={ids.identity} title="Identidade" qualifier="Capa, nome e como a equipe encontra a música" />
            <div className="mb-4 flex justify-center">
              <div className="w-40">
                <CoverUpload
                  songId={id!}
                  teamId={currentTeam?.id || ""}
                  coverPath={coverPath}
                  onUpload={(path) => { setCoverPath(path); persistField({ cover_path: path }); }}
                  readOnly={readOnly}
                />
              </div>
            </div>
            <div className={groupCard}>
              <FieldRow label="Título" htmlFor={ids.title}>
                <input id={ids.title} className={bareInput} value={title} onChange={(e) => setTitle(e.target.value)} readOnly={readOnly} />
              </FieldRow>
              <FieldRow label="Artista" htmlFor={ids.artist}>
                <input id={ids.artist} className={bareInput} value={artist} onChange={(e) => setArtist(e.target.value)} readOnly={readOnly} />
              </FieldRow>
              <FieldRow label="Tema" htmlFor={ids.theme}>
                <input id={ids.theme} className={bareInput} value={theme} onChange={(e) => setTheme(e.target.value)} readOnly={readOnly} placeholder="Ex: Adoração, Celebração..." />
              </FieldRow>
              {(!readOnly || tags.length > 0) && (
                <FieldRow label="Tags" htmlFor={readOnly ? undefined : ids.tag} alignTop>
                  {tags.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5 py-3" aria-label="Tags">
                      {tags.map((tag, i) => (
                        <li
                          key={i}
                          className={cn(
                            "inline-flex min-h-7 items-center gap-0.5 rounded-full bg-fill-tertiary py-1 text-footnote font-medium text-foreground",
                            readOnly ? "px-2.5" : "pl-2.5 pr-1",
                          )}
                        >
                          {tag}
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => setTags(tags.filter((_, j) => j !== i))}
                              aria-label={`Remover tag ${tag}`}
                              className="relative grid h-5 w-5 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground after:absolute after:-inset-3"
                            >
                              <X className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!readOnly && (
                    <div className={cn("flex items-center gap-1", tags.length > 0 && "-mt-1")}>
                      <input
                        id={ids.tag}
                        className={bareInput}
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="Nova tag..."
                        enterKeyHint="done"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={addTag}
                        disabled={!tagInput.trim()}
                        aria-label="Adicionar tag"
                        className="-mr-2 grid h-11 w-11 shrink-0 place-items-center transition-opacity disabled:opacity-40"
                      >
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-prominent text-prominent-foreground">
                          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                        </span>
                      </button>
                    </div>
                  )}
                </FieldRow>
              )}
            </div>
          </section>

          {/* Mídia & áudio */}
          <section aria-labelledby={ids.media}>
            <SectionHeader id={ids.media} title="Mídia & áudio" qualifier="Referência e arquivo da música" />
            <label htmlFor={ids.mediaUrl} className={groupLabel}>Link de mídia</label>
            <div className={groupCard}>
              <div className={cn(rowBase, rowSep16, "py-0")}>
                <input
                  id={ids.mediaUrl}
                  className={bareInput}
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  readOnly={readOnly}
                  placeholder="Link do YouTube, Spotify..."
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>
            {youtubeId && (
              <div className="mt-3 aspect-video overflow-hidden rounded-card bg-fill-tertiary">
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="YouTube preview"
                />
              </div>
            )}
            {(!readOnly || audioPath) && (
              <div className="mt-6">
                <p className={groupLabel}>Áudio da música</p>
                <div className={groupCard}>
                  {!readOnly && !audioPath ? (
                    <>
                      {/* Duas formas de obter o áudio: arquivo OU o link do YouTube acima */}
                      <AudioUpload
                        songId={id!}
                        teamId={currentTeam?.id || ""}
                        audioPath={audioPath}
                        onUpload={(path) => { setAudioPath(path); persistField({ audio_path: path }); }}
                        readOnly={readOnly}
                        compact
                      />
                      <button
                        type="button"
                        className={cn(rowBase, rowSep58, actionRow, !importBusy && actionRowDimmed)}
                        onClick={handleImportYoutube}
                        disabled={importingYt || !youtubeId}
                        aria-busy={importBusy || undefined}
                        title={youtubeId ? "Importar áudio do link do YouTube" : "Cole um link do YouTube no campo Link de mídia acima"}
                      >
                        <span className={cn(rowIcon, "text-primary")} aria-hidden="true">
                          {importingYt ? <Loader2 className={cn(rowSymbol, "animate-spin")} /> : <Youtube className={rowSymbol} />}
                        </span>
                        <span className="min-w-0 flex-1 text-body text-primary">{importingYt ? "Baixando..." : "Do YouTube"}</span>
                      </button>
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
                {!readOnly && !audioPath && (
                  <>
                    {!youtubeId && !importingYt && (
                      <p className={helperText}>
                        Para importar do YouTube, cole o link no campo <strong className="font-semibold text-foreground">Link de mídia</strong> acima.
                      </p>
                    )}
                    {importingYt && <p className={helperText}>Baixando do YouTube… pode levar ~1 min.</p>}
                    {ytCookieExpired && !importingYt && (
                      <div className={cn(groupCard, "mt-3 flex items-start gap-3 px-4 py-3")}>
                        <AlertTriangle className="mt-px h-[22px] w-[22px] shrink-0 text-ios-red" aria-hidden="true" />
                        <p className="min-w-0 text-footnote text-foreground">
                          O acesso ao YouTube expirou. <strong className="font-semibold">Avise o administrador do app</strong> para renovar o login — depois é só tentar importar de novo.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          <SongAudioAttachments
            key={song.id}
            songId={song.id}
            teamId={song.team_id}
            readOnly={!canEditAdditionalAudio}
          />

          {/* Processamento (aparece quando há áudio) */}
          {audioPath && (!readOnly || tracks.length > 0) && (
            <section aria-labelledby={ids.processing}>
              <SectionHeader id={ids.processing} title="Processamento" qualifier="Corte e separação por IA" />
              {!readOnly && (
                <>
                  <div className={groupCard}>
                    <div className="px-4 pb-3 pt-3.5">
                      <AudioTrimmer
                        key={audioPath}
                        audioPath={audioPath}
                        teamId={currentTeam?.id || ""}
                        songId={id!}
                        onTrimmed={() => {
                          qc.invalidateQueries({ queryKey: ["song", id] });
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className={cn(rowBase, rowSep16, actionRow, !separatingBusy && actionRowDimmed)}
                      onClick={handleSeparateStems}
                      disabled={separating || stemsProcessing}
                      aria-busy={separatingBusy || undefined}
                    >
                      <span className={cn(rowIcon, "text-primary")} aria-hidden="true">
                        {separatingBusy ? <Loader2 className={cn(rowSymbol, "animate-spin")} /> : <Sparkles className={rowSymbol} />}
                      </span>
                      <span className="min-w-0 flex-1 text-body text-primary">
                        {separatingBusy ? "Separando faixas... (alguns min)" : "Separar em faixas (IA)"}
                      </span>
                    </button>
                  </div>
                  <p className={helperText}>Gera Vocais, Bateria, Baixo, Guitarra, Teclado e Outros a partir do áudio.</p>
                </>
              )}
              {tracks.length > 0 && (
                <div className={readOnly ? undefined : "mt-6"}>
                  <StemPreviewPlayer
                    tracks={tracks}
                    originalAudioPath={audioPath}
                    songId={id}
                    songKey={(song as any)?.key_original}
                  />
                </div>
              )}
            </section>
          )}

          {/* Dados musicais (BPM/Duração: travados até ter áudio) */}
          <section aria-labelledby={ids.data}>
            <SectionHeader
              id={ids.data}
              title="Dados musicais"
              qualifier={audioPath ? "Detectados do áudio — ajuste se precisar" : "Disponível após adicionar o áudio"}
            />
            <div className={groupCard}>
              {audioPath ? (
                <>
                  <div className={cn(rowBase, rowSep58, "py-0")}>
                    <span className={rowIcon} aria-hidden="true"><Gauge className={rowSymbol} /></span>
                    <label htmlFor={ids.bpm} className="min-w-0 flex-1 text-body text-foreground">BPM</label>
                    <input
                      id={ids.bpm}
                      type="number"
                      inputMode="numeric"
                      min={40}
                      max={240}
                      value={bpm}
                      onChange={(e) => setBpm(e.target.value)}
                      readOnly={readOnly}
                      placeholder="100"
                      className={cn(
                        bareInput,
                        "w-16 flex-none text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                      )}
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={handleDetectBpm}
                        disabled={detectingBpm}
                        title="Detectar BPM do áudio"
                        aria-label="Detectar BPM do áudio"
                        className="-mr-2 grid h-11 w-11 shrink-0 place-items-center text-primary"
                      >
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-fill-tertiary transition-colors active:bg-fill-secondary">
                          {detectingBpm ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} aria-hidden="true" /> : <Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />}
                        </span>
                      </button>
                    )}
                  </div>
                  <div className={cn(rowBase, rowSep58, "py-0")}>
                    <span className={rowIcon} aria-hidden="true"><Clock className={rowSymbol} /></span>
                    <label htmlFor={ids.duration} className="min-w-0 flex-1 text-body text-foreground">Duração</label>
                    <input
                      id={ids.duration}
                      value={durationInput}
                      onChange={(e) => setDurationInput(e.target.value)}
                      readOnly={readOnly}
                      placeholder="mm:ss"
                      inputMode="numeric"
                      className={cn(bareInput, "w-20 flex-none text-right tabular-nums", !readOnly && "mr-12")}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 px-4 py-4">
                  <Gauge className="h-7 w-7 shrink-0 text-label-tertiary" aria-hidden="true" />
                  <p className="min-w-0 text-body text-muted-foreground">
                    Adicione o áudio acima para detectar BPM e duração automaticamente.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Repertórios — aloca a música em vários repertórios (muitos-para-muitos) */}
          {id && currentTeam?.id && (
            <SongRepertoriosCard songId={id} teamId={currentTeam.id} readOnly={readOnly} />
          )}
        </div>

        {/* === Coluna direita: Conteúdo === */}
        <section aria-labelledby={ids.content} className="min-w-0 lg:sticky lg:top-8">
          <SectionHeader id={ids.content} title="Conteúdo" qualifier="Cifra e letra para o time" />
          <Tabs defaultValue="cifra" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="cifra" className="flex-1">Cifra</TabsTrigger>
              <TabsTrigger value="lyrics" className="flex-1">Letra</TabsTrigger>
            </TabsList>
            <TabsContent value="cifra">
              {/* Controle de tom — transpõe a cifra offline; salva como padrão da música */}
              {!readOnly && cifraText.trim() && (
                <div className="mb-3 flex items-center justify-between gap-3 pl-1">
                  <span className="min-w-0 text-subhead text-muted-foreground">
                    Transpor cifra{" "}
                    {tomDelta !== 0 && (
                      <span className="font-semibold tabular-nums text-foreground">({tomDelta > 0 ? "+" : ""}{tomDelta})</span>
                    )}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex h-11 items-center overflow-hidden rounded-full bg-fill-tertiary text-subhead text-foreground">
                      <button type="button" onClick={tomDown} className="h-full min-w-[44px] px-3 font-semibold transition-colors active:bg-fill-secondary" title="Descer ½ tom">−1</button>
                      <span className="h-5 w-px bg-separator" aria-hidden="true" />
                      <button
                        type="button"
                        onClick={tomReset}
                        className="h-full min-w-[3.25rem] px-2 text-center font-bold text-primary transition-colors active:bg-fill-secondary"
                        title="Tom atual — toque para voltar ao original"
                      >
                        {detectKeyFromCifra(cifraText) ?? "Tom"}
                      </button>
                      <span className="h-5 w-px bg-separator" aria-hidden="true" />
                      <button type="button" onClick={tomUp} className="h-full min-w-[44px] px-3 font-semibold transition-colors active:bg-fill-secondary" title="Subir ½ tom">+1</button>
                    </div>
                    {tomDelta !== 0 && (
                      <button
                        type="button"
                        onClick={tomReset}
                        className="grid h-11 w-11 place-items-center rounded-full bg-fill-tertiary text-muted-foreground transition-colors active:bg-fill-secondary"
                        title="Voltar ao tom original"
                        aria-label="Voltar ao tom original"
                      >
                        <RotateCcw className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
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
                className="block w-full min-h-[260px] max-h-[70vh] rounded-card bg-card px-4 py-3.5 text-body leading-7 text-foreground resize-none placeholder:text-label-tertiary focus:outline-none focus-visible:outline-none"
                placeholder="Cole ou digite a letra aqui. Use [tags] para separar as partes (ex: [Refrão], [Verso 1])..."
              />
            </TabsContent>
          </Tabs>
        </section>

        {/* === Histórico — referência, largura total === */}
        <section aria-labelledby={ids.history} className="min-w-0 lg:col-span-2">
          <SectionHeader
            id={ids.history}
            title="Histórico"
            qualifier={songHistory.length > 0 ? `Tocada ${songHistory.length}x` : undefined}
          />
          {songHistory.length === 0 ? (
            <div className={cn(groupCard, "flex items-center gap-3 px-4 py-4")}>
              <CalendarDays className="h-7 w-7 shrink-0 text-label-tertiary" aria-hidden="true" />
              <p className="min-w-0 text-body text-muted-foreground">Ainda não foi tocada em nenhum culto.</p>
            </div>
          ) : (
            <>
              <ul className={groupCard}>
                {songHistory.slice(0, 8).map((culto: any, idx: number) => (
                  <li
                    key={culto.id + "-" + idx}
                    className="relative before:pointer-events-none before:absolute before:left-4 before:right-0 before:top-0 before:z-[1] before:border-t before:border-separator first:before:hidden"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/app/cultos/${culto.id}`)}
                      className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary"
                    >
                      <span className="min-w-0 flex-1 truncate text-body text-foreground">{culto.name}</span>
                      <span className="shrink-0 text-subhead tabular-nums text-muted-foreground">
                        {new Date(culto.date).toLocaleDateString("pt-BR")}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className={helperText}>
                Última vez: {formatDistanceToNow(new Date(songHistory[0].date), { addSuffix: true, locale: ptBR })}
              </p>
            </>
          )}
        </section>
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
            <AlertDialogAction onClick={handleDeleteSong} className={buttonVariants({ variant: "destructive" })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
