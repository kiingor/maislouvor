import { useMusicManagement } from "@/hooks/useMusicManagement";
import { ReportContentButton } from "@/components/moderation/ReportContentButton";
import { SongProvenance } from "@/components/moderation/SongProvenance";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { MusicalKeyPicker } from "@/components/MusicalKeyPicker";
import { TrackUpload } from "@/components/TrackUpload";
import { SongRegistrationLoops } from "@/components/SongRegistrationLoops";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { songRpc } from "@/lib/songCatalog";
import { Check, CheckCircle2, Repeat, Search } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { CoverUpload } from "@/components/CoverUpload";
import { AudioUpload } from "@/components/AudioUpload";
import { SongAudioAttachments } from "@/components/SongAudioAttachments";
import { AudioTrimmer } from "@/components/AudioTrimmer";
import { StemPreviewPlayer } from "@/components/StemPreviewPlayer";
import { SongRepertoriosCard } from "@/components/SongRepertoriosCard";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import { CifraHighlightTextarea } from "@/components/CifraHighlightTextarea";
import {
  transposeCifra,
  transposeCifraToKey,
  transposeKeyName,
  detectKeyFromCifra,
} from "@/lib/chordpro";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Clock,
  Gauge,
  Loader2,
  MoreHorizontal,
  Music2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
  Youtube,
} from "lucide-react";
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
import { detectBpmFromUrl } from "@/lib/detectBpm";
import { useState, useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { youtubeImportEnabled } from "@/lib/storeBuild";
import { openYouTubeExternally, usesExternalYouTube } from "@/lib/youtubePlayback";
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
const rowIcon =
  "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground";
const rowSymbol = "h-[17px] w-[17px]";
/** Linha de ação tintada (toque = leve realce, como numa célula iOS). */
const actionRow =
  "w-full text-left transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary disabled:pointer-events-none";
const actionRowDimmed = "[&:disabled>*]:opacity-40";
/** Campo sem moldura dentro de uma linha: o card já é a superfície (placeholder = label terciário). */
const bareInput =
  "h-11 w-full min-w-0 bg-transparent text-body text-foreground placeholder:text-label-tertiary focus:outline-none focus-visible:outline-none";
const groupLabel = "mx-4 mb-1.5 block text-footnote text-muted-foreground";
const helperText = "mx-1 mt-2 text-footnote text-muted-foreground";

/** Cabeçalho de seção: Title3 + qualificador opcional em Subhead secundário + ação à direita. */
function SectionHeader({
  id,
  title,
  qualifier,
  action,
}: {
  id: string;
  title: string;
  qualifier?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-1 mb-2 flex flex-wrap items-end justify-between gap-x-3">
      <h2 id={id} className="min-w-0 break-words text-title3 text-foreground">
        {title}
        {qualifier && (
          <span className="block text-subhead font-normal text-muted-foreground">
            {qualifier}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

/** Linha de formulário: rótulo à esquerda (Body) e campo ocupando o resto. */
function FieldRow({
  label,
  htmlFor,
  alignTop,
  children,
}: {
  label: string;
  htmlFor?: string;
  alignTop?: boolean;
  children: ReactNode;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className={cn(rowBase, rowSep16, "py-0", alignTop && "items-start")}>
      <Label
        htmlFor={htmlFor}
        className={cn(
          "w-[72px] shrink-0 text-body text-foreground",
          alignTop ? "pt-[15px]" : ""
        )}
      >
        {label}
      </Label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

interface SongEditorProps {
  songId?: string;
  embedded?: boolean;
  initialRepertorioId?: string;
  registerSaveOnClose?: (save: () => Promise<boolean>) => void;
  onFinished?: () => void;
}
export default function SongEditor({
  songId,
  embedded = false,
  initialRepertorioId,
  registerSaveOnClose,
  onFinished,
}: SongEditorProps = {}) {
  const { id: routeId } = useParams<{ id: string }>();
  const id = songId || routeId;
  const navigate = useNavigate();
  const { currentTeam, can } = useTeam();
  const canEdit = can("musicas", "editar");
  const { canAuthorSongs } = useMusicManagement();
  const { toast } = useToast();
  const qc = useQueryClient();
  const uid = useId();
  const ids = {
    identity: `${uid}-identity`,
    media: `${uid}-media`,
    processing: `${uid}-processing`,
    data: `${uid}-data`,
    content: `${uid}-content`,
    history: `${uid}-history`,
    title: `${uid}-title`,
    artist: `${uid}-artist`,
    theme: `${uid}-theme`,
    tag: `${uid}-tag`,
    audio: `${uid}-audio`,
    key: `${uid}-key`,
    teamKey: `${uid}-team-key`,
    cifra: `${uid}-cifra`,
    mediaUrl: `${uid}-media-url`,
    bpm: `${uid}-bpm`,
    duration: `${uid}-duration`,
  };

  const { data: song, isLoading } = useQuery({
    queryKey: ["song", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("songs")
        .select("*")
        .eq("id", id!)
        .single();
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
      const { data, error } = await supabase.rpc("can_edit_song_audio", {
        p_song_id: id!,
      });
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
      return data as {
        stems_status: string;
        stems_error: string | null;
      } | null;
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
      toast({
        title: "Faixas separadas!",
        description: "As faixas geradas pela IA já estão disponíveis.",
      });
    } else if (prevStemsStatus.current === "processing" && s === "error") {
      toast({
        title: "Erro na separação",
        description: stemsState?.stems_error || "Tente novamente.",
        variant: "destructive",
      });
    }
    prevStemsStatus.current = s;
  }, [stemsState?.stems_status, stemsState?.stems_error, refetchTracks]);

  const handleSeparateStems = async () => {
    if (!id || !audioPath || !canPrepare || separatingBusy || importBusy) return;
    setSeparating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "separate-stems",
        {
          body: { song_id: id, audio_path: audioPath },
        }
      );
      if (error) throw error;
      if (!data?.success)
        throw new Error(data?.error || "Falha ao iniciar separação");
      toast({
        title: "Separação iniciada",
        description:
          "Leva alguns minutos. As faixas aparecem aqui automaticamente quando ficarem prontas.",
      });
      qc.invalidateQueries({ queryKey: ["song-stems", id] });
    } catch (e: any) {
      toast({
        title: "Erro ao iniciar separação",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSeparating(false);
    }
  };

  const [step, setStep] = useState(1),
    [prepareTab, setPrepareTab] = useState("recording");
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [previewOpen, setPreviewOpen] = useState(false),
    [loopsOpen, setLoopsOpen] = useState(false);
  const [destinations, setDestinations] = useState<string[]>(
    initialRepertorioId ? [initialRepertorioId] : []
  );
  const [recordingSource, setRecordingSource] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [audioVersion, setAudioVersion] = useState(0);
  const scrollBody = useRef<HTMLDivElement>(null);
  const isDraft = Boolean(
    (song as unknown as { is_draft?: boolean })?.is_draft
  );
  const { data: repertorios = [] } = useQuery({
    queryKey: ["song-registration-repertorios", currentTeam?.id],
    enabled: canAuthorSongs && !!currentTeam && isDraft,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repertorios")
        .select("id,name")
        .eq("team_id", currentTeam!.id)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });
  const { data: pendingAdditional = 0 } = useQuery({
    queryKey: ["song-pending-additional", id],
    enabled: !!id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("song_audio_attachments" as never)
        .select("id", { count: "exact", head: true })
        .eq("song_id", id!)
        .neq("status", "ready");
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: (query) => (Number(query.state.data) > 0 ? 4000 : false),
  });
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
  // Build das lojas (VITE_STORE_BUILD=1): sem importar do YouTube; o áudio vem do arquivo.
  const youtubeImport = canAuthorSongs && youtubeImportEnabled();
  // Aviso persistente quando o import falha por cookie do YouTube expirado (só o admin renova).
  const [ytCookieExpired, setYtCookieExpired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tomDelta, setTomDelta] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
    setRecordingSource(
      (song as unknown as { recording_source_url?: string })
        .recording_source_url || null
    );
    const savedDestinations = (
      song as unknown as { draft_repertorio_ids?: string[] }
    ).draft_repertorio_ids;
    if (savedDestinations?.length) setDestinations(savedDestinations);
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
      const { data } = await supabase.storage
        .from("audio")
        .createSignedUrl(audioPath, 3600);
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
      if (audio) {
        audio.src = "";
        audio = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioPath, audioVersion]);

  const handleDetectBpm = async () => {
    if (!audioPath) return;
    setDetectingBpm(true);
    try {
      const { data } = await supabase.storage
        .from("audio")
        .createSignedUrl(audioPath, 3600);
      if (!data?.signedUrl)
        throw new Error("Não foi possível acessar o áudio.");
      const detected = await detectBpmFromUrl(data.signedUrl);
      if (detected) {
        setBpm(String(detected));
        toast({
          title: `BPM detectado: ${detected}`,
          description: "Revise e salve a música.",
        });
      } else {
        toast({
          title: "Não foi possível detectar o BPM",
          description: "Informe manualmente.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Erro ao detectar BPM",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setDetectingBpm(false);
    }
  };

  const handleSave = async (silent = false): Promise<boolean> => {
    if (!id || readOnly) return false;
    setSaving(true);
    const pendingTag = tagInput.trim();
    const savedTags =
      pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;
    try {
      const { error } = await supabase
        .from("songs")
        .update({
          title: title.trim(),
          artist: artist.trim() || null,
          key_original: keyOriginal || null,
          key_current: keyCurrent || keyOriginal || null,
          media_url: mediaUrl.trim() || null,
          cifra_text: cifraText || null,
          lyrics_text: lyricsText || null,
          recording_source_url: recordingSource,
          ...(isDraft ? { draft_repertorio_ids: destinations } : {}),
          tags: savedTags,
          theme: theme.trim() || null,
          bpm: bpm.trim() ? Math.round(Number(bpm)) || null : null,
          duration_seconds: parseDurationToSeconds(durationInput),
        } as never)
        .eq("id", id);
      if (error) throw error;
      setTags(savedTags);
      setTagInput("");
      for (const name of [
        "song",
        "repertorio-songs",
        "library-songs",
        "dashboard-songs",
        "song-catalog",
        "song-drafts",
      ])
        void qc.invalidateQueries({ queryKey: [name] });
      if (!silent)
        toast({
          title: isDraft ? "Rascunho salvo" : "Música salva",
          description: isDraft
            ? "Continue depois. O rascunho fica fora da busca."
            : undefined,
        });
      return true;
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: (error as Error).message,
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const ownTeamSong = !!song && song.team_id === currentTeam?.id;
  const readOnly = !canAuthorSongs || !ownTeamSong;
  const canPrepare = canEdit && ownTeamSong;

  const handleDeleteSong = async () => {
    if (!id || !canPrepare) return;
    const { error } = await supabase.from("songs").delete().eq("id", id);
    if (error) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Música excluída" });
    qc.invalidateQueries({ queryKey: ["library-songs"] });
    qc.invalidateQueries({ queryKey: ["repertorio-songs"] });
    qc.invalidateQueries({ queryKey: ["dashboard-songs"] });
    if (onFinished) onFinished();
    else navigate("/app/repertorios");
  };

  // Persist a single column immediately — used right after an upload so an
  // accidental reload (e.g. the PWA auto-updating) never loses an uploaded
  // cover/audio. We write straight to the DB WITHOUT invalidating the song
  // query, so other unsaved edits in the form (cifra, título…) aren't clobbered.
  const persistField = async (fields: Record<string, any>) => {
    if (!id || readOnly) return false;
    const { error } = await supabase
      .from("songs")
      .update(fields as any)
      .eq("id", id);
    if (error) {
      toast({
        title: "Erro ao salvar arquivo",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  // Keep background imports visible after a draft is reopened; React Query owns the poll lifecycle.
  const { data: importJob } = useQuery({
    queryKey: ["song-youtube-import", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("yt_import_jobs" as never)
        .select("id,status,error,url")
        .eq("song_id", id!)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] || null) as unknown as {
        id: string;
        status: string;
        error: string | null;
        url: string;
      } | null;
    },
    refetchInterval: (query) =>
      ["queued", "processing"].includes(
        (query.state.data as { status: string } | null)?.status || ""
      )
        ? 4000
        : false,
  });
  const handledImport = useRef("");
  useEffect(() => {
    if (!importJob) return;
    if (["queued", "processing"].includes(importJob.status)) {
      setImportingYt(true);
      return;
    }
    const token = importJob.id + ":" + importJob.status;
    if (handledImport.current === token) return;
    handledImport.current = token;
    setImportingYt(false);
    if (importJob.status === "done") {
      let alive = true;
      void supabase
        .from("songs")
        .select("audio_path,cover_path")
        .eq("id", id!)
        .single()
        .then(({ data }) => {
          if (!alive || !data) return;
          setAudioPath(data.audio_path || null);
          setAudioVersion((version) => version + 1);
          void refetchTracks();
          void qc.invalidateQueries({ queryKey: ["song-stems", id] });
          if (data.cover_path) setCoverPath(data.cover_path);
        });
      return () => {
        alive = false;
      };
    }
    if (importJob.status === "error")
      setYtCookieExpired(
        /COOKIE_EXPIRED|cookies for the authentication|sign in to confirm|not a bot/i.test(
          importJob.error || ""
        )
      );
  }, [importJob, id]);
  const handleImportYoutube = async () => {
    const url = mediaUrl.trim();
    if (readOnly || !youtubeImport || !id || !url || importingYt || stemsProcessing) return;
    setImportingYt(true);
    setYtCookieExpired(false);
    try {
      if (
        !(await persistField({
          media_url: url,
          recording_source_url: url,
          audio_path: null,
          audio_revision: crypto.randomUUID(),
        }))
      )
        throw new Error("Não foi possível salvar a versão da gravação.");
      setAudioPath(null);
      setAudioVersion((version) => version + 1);
      void qc.invalidateQueries({ queryKey: ["song-stems", id] });
      setRecordingSource(url);
      setDurationInput("");
      void refetchTracks();
      const { data, error } = await supabase.functions.invoke(
        "import-youtube",
        { body: { song_id: id, url } }
      );
      if (error) throw error;
      if (!data?.success)
        throw new Error(
          data?.error || "Não foi possível iniciar a importação."
        );
      if (data.cached) {
        const { data: ready } = await supabase
          .from("songs")
          .select("audio_path,cover_path")
          .eq("id", id)
          .single();
        setAudioPath(ready?.audio_path || null);
        setAudioVersion((version) => version + 1);
        if (ready?.cover_path) setCoverPath(ready.cover_path);
        toast({
          title: "Áudio preparado",
          description:
            "A gravação já estava no acervo. Você pode cortar e separar as faixas.",
        });
        setImportingYt(false);
      } else {
        void qc.invalidateQueries({ queryKey: ["song-youtube-import", id] });
        toast({
          title: "Importação iniciada",
          description:
            "O áudio aparecerá aqui quando estiver pronto. Você pode salvar um rascunho.",
        });
      }
    } catch (error) {
      setImportingYt(false);
      toast({
        title: "Erro ao importar gravação",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  // Transposição da cifra — 100% offline (lib/chordpro, sem IA/custo). Transpõe o
  // texto no lugar; ao salvar, esse tom vira o padrão da música. `tomDelta` guarda
  // o deslocamento líquido desde que a cifra foi carregada, pra "voltar ao original".
  const tomDown = () => {
    setCifraText((t) => transposeCifra(t, -1));
    setKeyCurrent((key) => transposeKeyName(key || keyOriginal, -1));
    setTomDelta((d) => d - 1);
  };
  const tomUp = () => {
    setCifraText((t) => transposeCifra(t, 1));
    setKeyCurrent((key) => transposeKeyName(key || keyOriginal, 1));
    setTomDelta((d) => d + 1);
  };
  const tomReset = () => {
    if (tomDelta === 0) return;
    setCifraText((t) => transposeCifra(t, -tomDelta));
    setKeyCurrent((key) => transposeKeyName(key || keyOriginal, -tomDelta));
    setTomDelta(0);
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

  useEffect(() => {
    registerSaveOnClose?.(() =>
      readOnly ? Promise.resolve(true) : handleSave(true)
    );
  }, [
    registerSaveOnClose,
    title,
    artist,
    keyOriginal,
    keyCurrent,
    mediaUrl,
    cifraText,
    lyricsText,
    coverPath,
    audioPath,
    recordingSource,
    tags,
    tagInput,
    theme,
    bpm,
    durationInput,
    destinations,
    readOnly,
  ]);
  const sourceChanged =
    !!audioPath && !!recordingSource && recordingSource !== mediaUrl.trim();
  const importBusy =
    importingYt || ["queued", "processing"].includes(importJob?.status || "");
  const separatingBusy = separating || stemsProcessing;
  const checks = [
    { field: "title", label: "Nome da música", done: !!title.trim() },
    { field: "artist", label: "Artista", done: !!artist.trim() },
    { field: "key", label: "Tom original", done: !!keyOriginal },
    { field: "theme", label: "Tema", done: !!theme.trim() },
    { field: "cifra", label: "Cifra", done: !!cifraText.trim() },
    {
      field: "audio",
      label: "Gravação preparada",
      done: !!audioPath && !sourceChanged && !importBusy,
    },
  ];
  const filled = checks.filter((check) => check.done).length;
  const ready =
    filled === 6 &&
    !importBusy &&
    !separatingBusy &&
    !mediaBusy &&
    pendingAdditional === 0;
  const validate = (next: number) => {
    const missing = checks.filter(
      (check) =>
        !check.done &&
        (next === 2
          ? ["title", "artist", "key", "theme"].includes(check.field)
          : true)
    );
    if (!missing.length && !sourceChanged) return true;
    const messages: Record<string, string> = {
      title: "Informe o nome da música.",
      artist: "Informe o artista ou ministério desta versão.",
      key: "Selecione o tom original.",
      theme: "Informe o tema principal.",
      cifra: "Cole a cifra completa para a equipe ensaiar.",
      audio: sourceChanged
        ? youtubeImport
          ? "O link mudou. Importe a gravação desta versão novamente."
          : "O link mudou. Envie o áudio desta versão novamente."
        : youtubeImport
        ? "Importe o áudio pelo link da gravação ou escolha um arquivo."
        : "Envie o arquivo de áudio da gravação.",
    };
    setErrors(
      Object.fromEntries(
        missing.map((check) => [check.field, messages[check.field]])
      )
    );
    const first = missing[0]?.field || "audio";
    if (first === "audio" || first === "cifra") {
      setStep(2);
      setPrepareTab(first === "audio" ? "recording" : "content");
    } else setStep(1);
    setTimeout(() => {
      const field = document.getElementById(
        first === "audio" ? ids.mediaUrl : ids[first as keyof typeof ids]
      );
      field?.focus();
      field?.scrollIntoView({ block: "nearest" });
    }, 0);
    return false;
  };
  const nextStep = async () => {
    if (!validate(step + 1)) return;
    if (
      step === 2 &&
      (importBusy || separatingBusy || mediaBusy || pendingAdditional)
    ) {
      toast({
        title: "Preparação em andamento",
        description: "Conclua as importações e a separação antes de revisar.",
        variant: "destructive",
      });
      return;
    }
    if (!(await handleSave(true))) return;
    setErrors({});
    setStep(step + 1);
    scrollBody.current?.scrollTo(0, 0);
  };
  const finish = async () => {
    if (isDraft && (!validate(3) || !ready)) return;
    if (!(await handleSave(true))) return;
    if (isDraft) {
      setSaving(true);
      try {
        await songRpc("publish_song_registration", {
          p_song_id: id,
          p_repertorio_ids: destinations,
        });
        toast({
          title: destinations.length
            ? "Música cadastrada e adicionada"
            : "Música cadastrada na biblioteca",
        });
        for (const key of [
          "song",
          "song-drafts",
          "song-catalog",
          "library-songs",
          "repertorio-songs",
          "dashboard-songs",
        ])
          void qc.invalidateQueries({ queryKey: [key] });
        if (onFinished) onFinished();
        else navigate("/app/repertorios");
      } catch (error) {
        toast({
          title: "Não foi possível cadastrar",
          description: (error as Error).message,
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    } else {
      toast({ title: "Música salva" });
      onFinished?.();
    }
  };
  const fieldClass =
    "h-11 w-full min-w-0 rounded-[11px] border border-separator bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm";
  const labelClass = "mb-1.5 block text-xs font-semibold";
  const cardClass =
    "min-w-0 rounded-[19px] border border-separator bg-card p-4 sm:p-[18px]";
  const fieldError = (field: string) =>
    errors[field] ? (
      <p
        id={ids[field as keyof typeof ids] + "-error"}
        role="alert"
        className="mt-1.5 text-xs text-destructive"
      >
        {errors[field]}
      </p>
    ) : null;
  const setOriginal = (next: string) => {
    if (!keyCurrent || keyCurrent === keyOriginal) setKeyCurrent(next);
    setKeyOriginal(next);
    setErrors((previous) => ({ ...previous, key: "" }));
  };
  if (isLoading)
    return (
      <div
        role="status"
        className="flex min-h-40 items-center justify-center gap-2 p-6 text-sm"
      >
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando cadastro…
      </div>
    );
  if (!song || (isDraft && readOnly))
    return (
      <div className="p-6 text-center">
        <p>Música não encontrada.</p>
        <Button
          variant="secondary"
          onClick={() => (onFinished ? onFinished() : navigate(-1))}
        >
          Voltar
        </Button>
      </div>
    );
  return (
    <>
    <div
      className={cn(
        "flex min-h-0 flex-col",
        embedded ? "flex-1" : "animate-in-up"
      )}
    >
      {!embedded && (
        <PageHeader
          title={isDraft ? "Cadastrar nova música" : title || "Música"}
          subtitle="Informações, gravação e conteúdo para o ensaio"
          back
        />
      )}
      <div
        ref={scrollBody}
        className={cn(
          "min-h-0 overflow-x-hidden overscroll-contain",
          embedded ? "flex-1 overflow-y-auto px-4 pb-5 pt-4 sm:px-6" : "pb-6"
        )}
      >
        <ol
          className="mb-4 grid grid-cols-[1fr_1.3fr_.8fr] gap-2 text-xs sm:grid-cols-3"
          aria-label={readOnly ? "Detalhes da música" : "Etapas do cadastro"}
        >
          {(readOnly ? ["Informações", "Ensaio", "Histórico"] : ["Informações", "Preparar música", "Revisar"]).map((label, index) => (
            <li key={label}>
              <button
                type="button"
                aria-current={step === index + 1 ? "step" : undefined}
                disabled={saving || mediaBusy}
                onClick={() => {
                  if (!isDraft || index + 1 <= step || validate(index + 1)) {
                    setStep(index + 1);
                    setErrors({});
                    scrollBody.current?.scrollTo(0, 0);
                  }
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-1.5 border-b-2 pb-2 text-left",
                  step === index + 1
                    ? "border-foreground font-semibold text-foreground"
                    : "border-separator text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]",
                    step === index + 1
                      ? "bg-prominent text-prominent-foreground"
                      : "bg-fill-tertiary"
                  )}
                >
                  {index + 1}
                </span>
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className={"grid min-w-0 items-start gap-4" + (!readOnly ? " min-[900px]:grid-cols-[minmax(0,1fr)_205px]" : "")}>
          <div className="min-w-0 space-y-3">
            {step === 1 && (
              <section className={cardClass} aria-labelledby={ids.identity}>
                <h2 id={ids.identity} className="text-base font-semibold">
                  {readOnly ? "Informações da música" : "Qual música vamos cadastrar?"}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {readOnly ? "Versão utilizada pela equipe." : "Identifique a versão e organize como a equipe vai encontrá-la."}
                </p>
                <div className="my-4 flex flex-wrap items-center gap-3 border-b border-separator pb-4">
                  <CoverUpload
                    compact
                    songId={id!}
                    teamId={song.team_id}
                    coverPath={coverPath}
                    onBusyChange={setMediaBusy}
                    onUpload={async (path) => {
                      if (!(await persistField({ cover_path: path })))
                        throw new Error(
                          "Não foi possível vincular a capa ao cadastro."
                        );
                      setCoverPath(path);
                    }}
                    readOnly={readOnly || mediaBusy}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">
                      Capa da música{" "}
                      <span className="font-normal text-muted-foreground">
                        Opcional
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      JPG, PNG ou WebP · até 5 MB
                    </p>
                    {coverPath && !readOnly && (
                      <Button
                        variant="ghost"
                        className="mt-1 px-0 text-xs"
                        onClick={() => {
                          setCoverPath(null);
                          void persistField({ cover_path: null });
                        }}
                      >
                        Remover capa
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label htmlFor={ids.title} className={labelClass}>
                      Nome da música
                    </label>
                    <input
                      id={ids.title}
                      className={fieldClass}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      readOnly={readOnly}
                      aria-invalid={!!errors.title}
                      aria-describedby={
                        errors.title ? ids.title + "-error" : undefined
                      }
                    />
                    {fieldError("title")}
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={ids.artist} className={labelClass}>
                      Artista ou ministério
                    </label>
                    <input
                      id={ids.artist}
                      className={fieldClass}
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                      readOnly={readOnly}
                      aria-invalid={!!errors.artist}
                      aria-describedby={
                        errors.artist ? ids.artist + "-error" : undefined
                      }
                    />
                    {fieldError("artist")}
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={ids.key} className={labelClass}>
                      Tom original
                    </label>
                    <MusicalKeyPicker
                      id={ids.key}
                      value={keyOriginal}
                      onChange={setOriginal}
                      disabled={readOnly}
                      required
                      label="Tom original"
                      invalid={!!errors.key}
                      describedBy={errors.key ? ids.key + "-error" : undefined}
                    />
                    {fieldError("key")}
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={ids.teamKey} className={labelClass}>
                      Tom da equipe{" "}
                      <span className="font-normal text-muted-foreground">
                        Opcional
                      </span>
                    </label>
                    <MusicalKeyPicker
                      id={ids.teamKey}
                      value={keyCurrent === keyOriginal ? "" : keyCurrent}
                      onChange={(key) => setKeyCurrent(key || keyOriginal)}
                      disabled={readOnly}
                      label="Tom da equipe"
                      emptyLabel="Igual ao original"
                      allowEmpty
                    />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      A transposição fica na etapa de preparação.
                    </p>
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <label htmlFor={ids.theme} className={labelClass}>
                      Tema principal
                    </label>
                    <input
                      id={ids.theme}
                      className={fieldClass}
                      list={uid + "-themes"}
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      readOnly={readOnly}
                      placeholder="Ex.: Gratidão, Adoração…"
                      aria-invalid={!!errors.theme}
                      aria-describedby={
                        errors.theme ? ids.theme + "-error" : undefined
                      }
                    />
                    <datalist id={uid + "-themes"}>
                      {[
                        "Adoração",
                        "Celebração",
                        "Gratidão",
                        "Comunhão",
                        "Entrega",
                        "Esperança",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </datalist>
                    {fieldError("theme")}
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <label htmlFor={ids.tag} className={labelClass}>
                      Tags{" "}
                      <span className="font-normal text-muted-foreground">
                        Opcional
                      </span>
                    </label>
                    {!readOnly && (
                      <div className="flex gap-2">
                        <input
                          id={ids.tag}
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          className={fieldClass}
                          placeholder="Ex.: abertura, ceia, acústico"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addTag();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label="Adicionar tag"
                          onClick={addTag}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Use tags para facilitar a busca da equipe.
                    </p>
                    <ul
                      className="mt-2 flex flex-wrap gap-1"
                      aria-label="Tags adicionadas"
                    >
                      {tags.map((tag) => (
                        <li
                          key={tag}
                          className="inline-flex min-h-11 items-center rounded-full bg-fill-tertiary pl-3 text-xs"
                        >
                          {tag}
                          {!readOnly ? (
                            <button
                              type="button"
                              onClick={() =>
                                setTags(tags.filter((value) => value !== tag))
                              }
                              aria-label={"Remover tag " + tag}
                              className="grid h-11 w-11 place-items-center"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : (
                            <span className="w-3" />
                          )}
                        </li>
                      ))}
                    </ul>
                    {!readOnly && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {["abertura", "ceia", "acústico"]
                          .filter((tag) => !tags.includes(tag))
                          .map((tag) => (
                            <Button
                              key={tag}
                              variant="ghost"
                              className="text-xs"
                              onClick={() => setTags([...tags, tag])}
                            >
                              {tag}
                            </Button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}
            {step === 2 && (
              <>
                <Tabs value={prepareTab} onValueChange={setPrepareTab}>
                  <TabsList className="mb-3 w-full">
                    <TabsTrigger
                      value="recording"
                      className="min-w-0 flex-1 text-xs"
                    >
                      Gravação
                    </TabsTrigger>
                    <TabsTrigger
                      value="content"
                      className="min-w-0 flex-1 text-xs"
                    >
                      Cifra e letra
                    </TabsTrigger>
                    <TabsTrigger
                      value="tracks"
                      className="min-w-0 flex-1 text-xs"
                    >
                      Faixas
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="recording" className="space-y-3">
                    <section className={cardClass} aria-labelledby={ids.media}>
                      <h2 id={ids.media} className="text-base font-semibold">
                        {readOnly ? "Gravação da música" : "Qual gravação vamos usar?"}
                      </h2>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {readOnly ? "Confira a versão utilizada pela equipe." : "Cole o link da versão que a equipe vai tocar. Depois, prepare o áudio para separar os instrumentos."}
                      </p>
                      <label
                        htmlFor={ids.mediaUrl}
                        className={cn(labelClass, "mt-4")}
                      >
                        Link da gravação
                      </label>
                      <input
                        id={ids.mediaUrl}
                        type="url"
                        className={fieldClass}
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                        readOnly={readOnly || importBusy || separatingBusy}
                        placeholder={
                          readOnly ? "Sem link de referência" : youtubeImport
                            ? "Cole o link do YouTube…"
                            : "Cole o link da gravação…"
                        }
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-invalid={!!errors.audio}
                        aria-describedby={
                          errors.audio ? ids.audio + "-error" : undefined
                        }
                      />
                      {sourceChanged && !readOnly && (
                        <p
                          className="mt-2 text-xs text-destructive"
                          role="alert"
                        >
                          {youtubeImport
                            ? "O link mudou. Importe esta gravação novamente antes de continuar."
                            : "O link mudou. Envie o áudio desta versão novamente antes de continuar."}
                        </p>
                      )}
                      {fieldError("audio")}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!readOnly && youtubeImport && (
                          <Button
                            onClick={() => void handleImportYoutube()}
                            disabled={
                              !youtubeId ||
                              importBusy ||
                              separatingBusy ||
                              mediaBusy
                            }
                          >
                            {importBusy ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Youtube className="mr-2 h-4 w-4" />
                            )}
                            {importBusy
                              ? "Importando gravação…"
                              : "Importar áudio da gravação"}
                          </Button>
                        )}
                        {youtubeId && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (usesExternalYouTube()) openYouTubeExternally(youtubeId);
                              else setPreviewOpen(true);
                            }}
                          >
                            {usesExternalYouTube() ? "Conferir no YouTube" : "Conferir versão"}
                          </Button>
                        )}
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        {readOnly ? "Referência da gravação utilizada pela equipe." : youtubeImport
                          ? "Use o YouTube para importar. Links de outros serviços ficam salvos para consulta; você pode enviar o arquivo abaixo."
                          : "O link fica salvo para a equipe conferir a versão. Envie o áudio da gravação abaixo."}
                      </p>
                      {!youtubeImport && importBusy && (
                        <p
                          role="status"
                          className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          Preparando o áudio desta gravação…
                        </p>
                      )}
                      {youtubeImport && importJob?.status === "error" && !audioPath && (
                        <p
                          role="alert"
                          className="mt-2 text-xs text-destructive"
                        >
                          {ytCookieExpired
                            ? "O acesso ao YouTube expirou. Avise o administrador para renovar e tente novamente."
                            : "A importação não concluiu. Tente novamente ou envie um arquivo."}
                        </p>
                      )}
                      <div className="mt-4 border-t border-separator pt-3">
                        <p className="mb-2 text-xs text-muted-foreground">
                          {readOnly ? "Áudio da gravação" : youtubeImport
                            ? "Ou escolha um arquivo de áudio"
                            : "Arquivo de áudio da gravação"}
                        </p>
                        <AudioUpload
                          songId={id!}
                          teamId={song.team_id}
                          audioPath={audioPath}
                          compact
                          onBusyChange={setMediaBusy}
                          readOnly={readOnly || importBusy || separatingBusy}
                          onUpload={async (path) => {
                            if (
                              !(await persistField({
                                audio_path: path,
                                recording_source_url: null,
                                audio_revision: crypto.randomUUID(),
                              }))
                            )
                              throw new Error(
                                "Não foi possível vincular o áudio ao cadastro."
                              );
                            setAudioPath(path);
                            setAudioVersion((version) => version + 1);
                            setRecordingSource(null);
                            setDurationInput("");
                            await refetchTracks();
                            void qc.invalidateQueries({
                              queryKey: ["song-stems", id],
                            });
                          }}
                        />
                      </div>
                    </section>
                    <div className={cardClass}>
                      {" "}
                      <section aria-labelledby={ids.data}>
                        <SectionHeader
                          id={ids.data}
                          title="Dados musicais"
                          qualifier={
                            readOnly ? "Informações da gravação" : audioPath
                              ? "Detectados do áudio — ajuste se precisar"
                              : "Disponível após adicionar o áudio"
                          }
                        />
                        <div className={groupCard}>
                          {audioPath ? (
                            <>
                              <div className={cn(rowBase, rowSep58, "py-0")}>
                                <span className={rowIcon} aria-hidden="true">
                                  <Gauge className={rowSymbol} />
                                </span>
                                <label
                                  htmlFor={ids.bpm}
                                  className="min-w-0 flex-1 text-body text-foreground"
                                >
                                  BPM
                                </label>
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
                                    "w-16 flex-none text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                                      {detectingBpm ? (
                                        <Loader2
                                          className="h-4 w-4 animate-spin"
                                          strokeWidth={2.25}
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <Sparkles
                                          className="h-4 w-4"
                                          strokeWidth={2.25}
                                          aria-hidden="true"
                                        />
                                      )}
                                    </span>
                                  </button>
                                )}
                              </div>
                              <div className={cn(rowBase, rowSep58, "py-0")}>
                                <span className={rowIcon} aria-hidden="true">
                                  <Clock className={rowSymbol} />
                                </span>
                                <label
                                  htmlFor={ids.duration}
                                  className="min-w-0 flex-1 text-body text-foreground"
                                >
                                  Duração
                                </label>
                                <input
                                  id={ids.duration}
                                  value={durationInput}
                                  onChange={(e) =>
                                    setDurationInput(e.target.value)
                                  }
                                  readOnly={readOnly}
                                  placeholder="mm:ss"
                                  inputMode="numeric"
                                  className={cn(
                                    bareInput,
                                    "w-20 flex-none text-right tabular-nums",
                                    !readOnly && "mr-12"
                                  )}
                                />
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-3 px-4 py-4">
                              <Gauge
                                className="h-7 w-7 shrink-0 text-label-tertiary"
                                aria-hidden="true"
                              />
                              <p className="min-w-0 text-body text-muted-foreground">
                                Adicione o áudio acima para detectar BPM e
                                duração automaticamente.
                              </p>
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                    {audioPath && !sourceChanged && (
                      <section className={cardClass}>
                        <h2 className="text-base font-semibold">
                          {readOnly ? "Separação de faixas" : "Preparar para a separação"}
                        </h2>
                        <p className="mb-3 mt-1 text-xs text-muted-foreground">
                          {readOnly ? "Separe os instrumentos da gravação para ensaiar." : "Corte o início e o fim, se precisar, e separe os instrumentos."}
                        </p>
                        {canPrepare && (
                          <>
                            {!readOnly && <AudioTrimmer
                              key={audioPath + ":" + audioVersion}
                              disabled={
                                separatingBusy || importBusy || mediaBusy
                              }
                              onBusyChange={setMediaBusy}
                              audioPath={audioPath}
                              teamId={song.team_id}
                              songId={id!}
                              onTrimmed={async () => {
                                const { data } = await supabase
                                  .from("songs")
                                  .select("audio_path")
                                  .eq("id", id!)
                                  .single();
                                if (data) setAudioPath(data.audio_path);
                                setAudioVersion((version) => version + 1);
                                setDurationInput("");
                                await refetchTracks();
                                void qc.invalidateQueries({
                                  queryKey: ["song-stems", id],
                                });
                              }}
                            />}
                            <Button
                              className="mt-3 w-full whitespace-normal"
                              onClick={() => void handleSeparateStems()}
                              disabled={
                                separatingBusy || importBusy || mediaBusy
                              }
                            >
                              {separatingBusy ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="mr-2 h-4 w-4" />
                              )}
                              {separatingBusy
                                ? "Separando faixas…"
                                : "Separar em faixas (IA)"}
                            </Button>
                            {stemsState?.stems_status === "error" && (
                              <p className="mt-2 text-xs text-destructive">
                                {stemsState.stems_error ||
                                  "A separação falhou. Tente novamente."}
                              </p>
                            )}
                          </>
                        )}
                        {tracks.length > 0 && (
                          <Button
                            variant="ghost"
                            className="mt-2"
                            onClick={() => setPrepareTab("tracks")}
                          >
                            Conferir {tracks.length} faixas
                          </Button>
                        )}
                      </section>
                    )}
                    <div className={cardClass}>
                      <SongAudioAttachments
                        key={song.id}
                        songId={song.id}
                        teamId={song.team_id}
                        readOnly={readOnly || !canEditAdditionalAudio}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="content" className={cardClass}>
                    {" "}
                    <section aria-labelledby={ids.content} className="min-w-0">
                      <SectionHeader
                        id={ids.content}
                        title="Cifra e letra"
                        qualifier="Conteúdo completo para a equipe ensaiar"
                      />
                      <Tabs defaultValue="cifra" className="w-full">
                        <TabsList className="w-full">
                          <TabsTrigger value="cifra" className="flex-1">
                            Cifra
                          </TabsTrigger>
                          <TabsTrigger value="lyrics" className="flex-1">
                            Letra
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="cifra">
                          {/* Controle de tom — transpõe a cifra offline; salva como padrão da música */}
                          {!readOnly && cifraText.trim() && (
                            <div className="mb-3 flex items-center justify-between gap-3 pl-1">
                              <span className="min-w-0 text-subhead text-muted-foreground">
                                Transpor cifra{" "}
                                {tomDelta !== 0 && (
                                  <span className="font-semibold tabular-nums text-foreground">
                                    ({tomDelta > 0 ? "+" : ""}
                                    {tomDelta})
                                  </span>
                                )}
                              </span>
                              <div className="flex shrink-0 items-center gap-2">
                                <div className="flex h-11 items-center overflow-hidden rounded-full bg-fill-tertiary text-subhead text-foreground">
                                  <button
                                    type="button"
                                    onClick={tomDown}
                                    className="h-full min-w-[44px] px-3 font-semibold transition-colors active:bg-fill-secondary"
                                    title="Descer ½ tom"
                                  >
                                    −1
                                  </button>
                                  <span
                                    className="h-5 w-px bg-separator"
                                    aria-hidden="true"
                                  />
                                  <button
                                    type="button"
                                    onClick={tomReset}
                                    className="h-full min-w-[3.25rem] px-2 text-center font-bold text-primary transition-colors active:bg-fill-secondary"
                                    title="Tom atual — toque para voltar ao original"
                                  >
                                    {detectKeyFromCifra(cifraText) ?? "Tom"}
                                  </button>
                                  <span
                                    className="h-5 w-px bg-separator"
                                    aria-hidden="true"
                                  />
                                  <button
                                    type="button"
                                    onClick={tomUp}
                                    className="h-full min-w-[44px] px-3 font-semibold transition-colors active:bg-fill-secondary"
                                    title="Subir ½ tom"
                                  >
                                    +1
                                  </button>
                                </div>
                                {tomDelta !== 0 && (
                                  <button
                                    type="button"
                                    onClick={tomReset}
                                    className="grid h-11 w-11 place-items-center rounded-full bg-fill-tertiary text-muted-foreground transition-colors active:bg-fill-secondary"
                                    title="Voltar ao tom original"
                                    aria-label="Voltar ao tom original"
                                  >
                                    <RotateCcw
                                      className="h-4 w-4"
                                      strokeWidth={2.25}
                                      aria-hidden="true"
                                    />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          <CifraHighlightTextarea
                            id={ids.cifra}
                            aria-label="Cifra completa"
                            value={cifraText}
                            onChange={(e) => setCifraText(e.target.value)}
                            readOnly={readOnly}
                            className="w-full"
                            placeholder="Cole ou digite a cifra aqui..."
                            aria-invalid={!!errors.cifra}
                            aria-describedby={
                              errors.cifra ? ids.cifra + "-error" : undefined
                            }
                          />
                          {errors.cifra && (
                            <p
                              id={ids.cifra + "-error"}
                              className="mt-2 text-xs text-destructive"
                              role="alert"
                            >
                              {errors.cifra}
                            </p>
                          )}
                          {!readOnly && keyCurrent && (
                            <Button
                              variant="ghost"
                              className="mt-2 text-xs"
                              onClick={() => {
                                const from =
                                  detectKeyFromCifra(cifraText) || keyOriginal;
                                setCifraText((text) =>
                                  transposeCifraToKey(text, from, keyCurrent)
                                );
                                setTomDelta(0);
                              }}
                            >
                              Usar tom da equipe ({keyCurrent})
                            </Button>
                          )}
                        </TabsContent>
                        <TabsContent value="lyrics">
                          <AutoGrowTextarea
                            aria-label="Letra da música"
                            value={lyricsText}
                            onChange={(e) => setLyricsText(e.target.value)}
                            readOnly={readOnly}
                            className="block w-full min-h-[260px] max-h-[70vh] rounded-card bg-card px-4 py-3.5 text-body leading-7 text-foreground resize-none placeholder:text-label-tertiary focus:outline-none focus-visible:outline-none"
                            placeholder="Cole ou digite a letra aqui. Use [tags] para separar as partes (ex: [Refrão], [Verso 1])..."
                          />
                        </TabsContent>
                      </Tabs>
                    </section>
                  </TabsContent>
                  <TabsContent value="tracks" className={cardClass}>
                    <h2 className="text-base font-semibold">
                      Faixas para o ensaio
                    </h2>
                    <p className="mb-3 mt-1 text-xs text-muted-foreground">
                      Ouça cada instrumento e ajuste a mistura para estudar sua
                      parte.
                    </p>
                    {tracks.length &&
                    !sourceChanged &&
                    !importBusy &&
                    !loopsOpen ? (
                      <StemPreviewPlayer
                        tracks={tracks}
                        originalAudioPath={audioPath}
                        songId={id}
                        songKey={keyOriginal}
                        onKeyChange={setOriginal}
                      />
                    ) : (
                      <p className="py-5 text-sm text-muted-foreground">
                        {separatingBusy
                          ? "As faixas aparecem aqui quando a separação concluir."
                          : readOnly
                          ? "Use a separação na aba Gravação para preparar as faixas."
                          : youtubeImport
                          ? "Importe a gravação e separe em faixas, ou envie as faixas prontas abaixo."
                          : "Envie a gravação e separe em faixas, ou envie as faixas prontas abaixo."}
                      </p>
                    )}
                    <div className="mt-4 border-t border-separator pt-4">
                      <TrackUpload
                        songId={id!}
                        teamId={song.team_id}
                        tracks={tracks}
                        onTracksChange={() => void refetchTracks()}
                        readOnly={readOnly || separatingBusy || importBusy}
                      />
                    </div>
                    {audioPath && (
                      <Button
                        variant="outline"
                        className="mt-4 w-full whitespace-normal"
                        onClick={() => setLoopsOpen(true)}
                      >
                        <Repeat className="mr-2 h-4 w-4" />
                        Trechos para repetir no ensaio
                      </Button>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            )}
            {step === 3 && (
              <>
                <section className={cardClass}>
                  <div className="flex items-center gap-3 border-b border-separator pb-4">
                    <span className="grid h-[62px] w-[55px] shrink-0 place-items-center rounded-[15px] bg-fill-tertiary text-xl font-semibold">
                      {keyOriginal || "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words text-xl font-semibold">
                        {title || "Música sem nome"}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {artist || "Artista pendente"}
                      </p>
                    </div>
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      Editar
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {tags.join(" · ")}
                  </p>
                  <dl className="mt-3 text-xs">
                    {[
                      ["Tema", theme || "Pendente"],
                      [
                        "Tom da equipe",
                        keyCurrent || keyOriginal || "Pendente",
                      ],
                      [
                        "BPM / duração",
                        `${bpm ? bpm + " BPM" : "BPM não informado"} · ${
                          durationInput || "duração não informada"
                        }`,
                      ],
                      ["Capa", coverPath ? "Imagem adicionada" : "Sem capa"],
                      ["Link da gravação", mediaUrl || "Sem link"],
                      [
                        "Áudio preparado",
                        audioPath
                          ? sourceChanged
                            ? "Versão precisa ser reimportada"
                            : "Gravação pronta"
                          : "Pendente",
                      ],
                      [
                        "Faixas",
                        tracks.length
                          ? `${tracks.length} faixas preparadas`
                          : "Sem faixas",
                      ],
                      [
                        "Cifra / letra",
                        `${
                          cifraText.trim()
                            ? cifraText.split("\n").length + " linhas de cifra"
                            : "Cifra pendente"
                        } · ${
                          lyricsText.trim()
                            ? "letra adicionada"
                            : "sem letra separada"
                        }`,
                      ],
                      [
                        "Áudios adicionais",
                        pendingAdditional
                          ? "Há importações pendentes"
                          : "Confira na etapa de gravação",
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-start justify-between gap-3 border-b border-separator py-2.5"
                      >
                        <dt className="shrink-0 text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="min-w-0 max-w-[65%] break-words text-right">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <Button
                    variant="ghost"
                    className="mt-2 px-0 text-xs"
                    onClick={() => setStep(2)}
                  >
                    Editar gravação, cifra e faixas
                  </Button>
                  <div className="mt-3 flex items-start gap-2 rounded-[12px] bg-fill-tertiary p-3 text-xs">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <p>
                      {ready
                        ? "Pronta para entrar no repertório. A equipe encontrará a cifra e a gravação preparada."
                        : "Confira as informações pendentes ou salve um rascunho para continuar depois."}
                    </p>
                  </div>
                </section>
                {isDraft ? (
                  <section className={cardClass}>
                    <h2 className="text-base font-semibold">
                      Adicionar aos repertórios
                    </h2>
                    <p className="mb-2 mt-1 text-xs text-muted-foreground">
                      A música fica na biblioteca e nos repertórios que você
                      escolher.
                    </p>
                    {repertorios.map((rep) => (
                      <label
                        key={rep.id}
                        className="flex min-h-[60px] cursor-pointer items-center gap-3 border-t border-separator first:border-t-0"
                      >
                        <input
                          type="checkbox"
                          checked={destinations.includes(rep.id)}
                          onChange={(e) =>
                            setDestinations((previous) =>
                              e.target.checked
                                ? [...previous, rep.id]
                                : previous.filter((value) => value !== rep.id)
                            )
                          }
                          className="h-5 w-5 accent-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {rep.name}
                        </span>
                        {rep.id === initialRepertorioId && (
                          <span className="text-[10px] text-muted-foreground">
                            Origem
                          </span>
                        )}
                      </label>
                    ))}
                    {!repertorios.length && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Você pode cadastrar somente na biblioteca.
                      </p>
                    )}
                  </section>
                ) : (
                  <div className={cardClass}>
                    <SongRepertoriosCard
                      songId={id!}
                      teamId={song.team_id}
                      readOnly={!canPrepare || !can("repertorios", "editar")}
                    />
                  </div>
                )}
                <div className={cardClass}>
                  {" "}
                  <section
                    aria-labelledby={ids.history}
                    className="min-w-0 lg:col-span-2"
                  >
                    <SectionHeader
                      id={ids.history}
                      title="Histórico"
                      qualifier={
                        songHistory.length > 0
                          ? `Tocada ${songHistory.length}x`
                          : undefined
                      }
                    />
                    {songHistory.length === 0 ? (
                      <div
                        className={cn(
                          groupCard,
                          "flex items-center gap-3 px-4 py-4"
                        )}
                      >
                        <CalendarDays
                          className="h-7 w-7 shrink-0 text-label-tertiary"
                          aria-hidden="true"
                        />
                        <p className="min-w-0 text-body text-muted-foreground">
                          Ainda não foi tocada em nenhum culto.
                        </p>
                      </div>
                    ) : (
                      <>
                        <ul className={groupCard}>
                          {songHistory
                            .slice(0, 8)
                            .map((culto: any, idx: number) => (
                              <li
                                key={culto.id + "-" + idx}
                                className="relative before:pointer-events-none before:absolute before:left-4 before:right-0 before:top-0 before:z-[1] before:border-t before:border-separator first:before:hidden"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(`/app/cultos/${culto.id}`)
                                  }
                                  className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary"
                                >
                                  <span className="min-w-0 flex-1 truncate text-body text-foreground">
                                    {culto.name}
                                  </span>
                                  <span className="shrink-0 text-subhead tabular-nums text-muted-foreground">
                                    {new Date(culto.date).toLocaleDateString(
                                      "pt-BR"
                                    )}
                                  </span>
                                  <ChevronRight
                                    className="h-3.5 w-3.5 shrink-0 text-label-tertiary"
                                    strokeWidth={2.5}
                                    aria-hidden="true"
                                  />
                                </button>
                              </li>
                            ))}
                        </ul>
                        <p className={helperText}>
                          Última vez:{" "}
                          {formatDistanceToNow(new Date(songHistory[0].date), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </>
                    )}
                  </section>
                </div>
                {canPrepare && (
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDraft ? "Descartar rascunho" : "Excluir música"}
                  </Button>
                )}
              </>
            )}
          </div>
          {!readOnly && <aside className="hidden rounded-[19px] border border-separator p-4 min-[900px]:block">
            <h3 className="text-xs font-semibold">Para uma música completa</h3>
            <div
              className="my-3 h-1 overflow-hidden rounded-full bg-separator"
              role="progressbar"
              aria-label="Dados preenchidos"
              aria-valuenow={filled}
              aria-valuemin={0}
              aria-valuemax={6}
            >
              <div
                className="h-full bg-foreground"
                style={{ width: (filled / 6) * 100 + "%" }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {filled} de 6 informações preenchidas
            </p>
            <ul className="my-3 space-y-2 text-xs">
              {checks.map((check) => (
                <li key={check.field} className="flex items-center gap-2">
                  {check.done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-separator" />
                  )}
                  {check.label}
                  <span className="sr-only">
                    : {check.done ? "preenchido" : "pendente"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Falta algum detalhe? Salve um rascunho e continue depois. Ele fica
              fora da busca de músicas.
            </p>
          </aside>}
        </div>
      </div>
      <footer
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 border-t border-separator bg-background px-4 py-3 sm:px-6",
          !embedded && "sticky bottom-0"
        )}
      >
        {!readOnly ? (
          <Button
            variant="ghost"
            className="h-auto min-h-11 max-w-[120px] whitespace-normal px-0 text-left text-xs"
            onClick={async () => {
              if (await handleSave()) onFinished?.();
            }}
            disabled={saving || mediaBusy}
          >
            {isDraft ? "Salvar rascunho" : "Salvar alterações"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex min-w-0 gap-2">
          <Button
            variant="secondary"
            disabled={saving || mediaBusy}
            onClick={() => {
              if (step > 1) setStep(step - 1);
              else if (onFinished && readOnly) {
                onFinished();
              } else if (onFinished) {
                void handleSave(true).then((saved) => {
                  if (saved) onFinished();
                });
              } else navigate(-1);
            }}
          >
            {step === 1 ? "Voltar" : "Voltar"}
          </Button>
          {!readOnly && (
            <Button
              disabled={
                saving || mediaBusy || (step === 3 && isDraft && !ready)
              }
              onClick={() => void (step === 3 ? finish() : nextStep())}
              className="h-auto min-h-11 min-w-0 whitespace-normal text-xs sm:text-sm"
            >
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              {step === 3
                ? isDraft
                  ? destinations.length
                    ? "Cadastrar e adicionar"
                    : "Cadastrar na biblioteca"
                  : "Salvar música"
                : "Continuar"}
            </Button>
          )}
        </div>
      </footer>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogTitle>Conferir gravação</DialogTitle>
          <DialogDescription>
            Confira se é a versão que a equipe vai tocar.
          </DialogDescription>
          {!usesExternalYouTube() && previewOpen && youtubeId && (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              className="aspect-video w-full rounded-[13px]"
              title="Prévia da gravação"
              allowFullScreen
            />
          )}
          <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
            {readOnly ? "Voltar" : "Voltar ao cadastro"}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={loopsOpen} onOpenChange={setLoopsOpen}>
        <DialogContent
          hideClose
          className="max-h-[85dvh] gap-0 overflow-hidden p-0"
        >
          <DialogTitle className="sr-only">
            Trechos para repetir no ensaio
          </DialogTitle>
          <DialogDescription className="sr-only">
            Crie e ouça trechos da gravação.
          </DialogDescription>
          {loopsOpen && audioPath && (
            <SongRegistrationLoops
              songId={id!}
              audioPath={audioPath}
              onClose={() => setLoopsOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      <div className="space-y-2 px-4 pb-4"><SongProvenance songId={song.id} readOnly={readOnly} /><ReportContentButton songId={song.id} /></div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isDraft
                ? "Descartar este rascunho?"
                : `Excluir ${title || "música"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              A música e seus vínculos serão removidos. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteSong()}
              className={buttonVariants({ variant: "destructive" })}
            >
              {isDraft ? "Descartar" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}
