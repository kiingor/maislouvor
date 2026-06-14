import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { GlassCard } from "@/components/GlassCard";
import { GlassInput } from "@/components/GlassInput";
import { CoverUpload } from "@/components/CoverUpload";
import { AudioUpload } from "@/components/AudioUpload";
import { AudioTrimmer } from "@/components/AudioTrimmer";
import { TrackUpload } from "@/components/TrackUpload";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Save, Loader2, X, Plus, CalendarDays, Download, Sparkles } from "lucide-react";
import { splitSegments } from "@/data/chordDictionary";
import { useState, useEffect, useRef } from "react";
import { CHROMATIC_KEYS } from "@/data/chordDictionary";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function SongEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTeam, canEdit } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: song, isLoading } = useQuery({
    queryKey: ["song", id],
    queryFn: async () => {
      const { data } = await supabase.from("songs").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
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
  const [saving, setSaving] = useState(false);
  const [transposing, setTransposing] = useState(false);

  // Moises import modal
  const [showMoisesModal, setShowMoisesModal] = useState(false);
  const [moisesText, setMoisesText] = useState("");
  const [importingMoises, setImportingMoises] = useState(false);

  useEffect(() => {
    if (!song) return;
    setTitle(song.title || "");
    setArtist(song.artist || "");
    setKeyOriginal(song.key_original || "");
    setKeyCurrent(song.key_current || "");
    setMediaUrl(song.media_url || "");
    setCifraText(song.cifra_text || "");
    setLyricsText((song as any).lyrics_text || "");
    setCoverPath(song.cover_path || null);
    setAudioPath((song as any).audio_path || null);
    setTags((song as any).tags || []);
    setTheme((song as any).theme || "");
  }, [song]);

  const handleSave = async () => {
    if (!id || !title.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("songs")
      .update({
        title: title.trim(),
        artist: artist.trim() || null,
        key_original: keyOriginal.trim() || null,
        key_current: keyCurrent.trim() || null,
        media_url: mediaUrl.trim() || null,
        cifra_text: cifraText || null,
        lyrics_text: lyricsText || null,
        cover_path: coverPath,
        audio_path: audioPath,
        tags: tags.length > 0 ? tags : [],
        theme: theme.trim() || null,
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

  const handleTransposeTo = async (newKey: string) => {
    if (!cifraText || !keyCurrent || newKey === keyCurrent) return;
    setTransposing(true);
    try {
      const { data, error } = await supabase.functions.invoke("transpose", {
        body: { cifra_text: cifraText, from_key: keyCurrent, to_key: newKey },
      });
      if (error) throw error;
      if (data?.cifra_text) {
        setCifraText(data.cifra_text);
        setKeyCurrent(newKey);
        toast({ title: `Transposto para ${newKey}` });
      }
    } catch (e: any) {
      toast({ title: "Erro ao transpor", description: e.message, variant: "destructive" });
    } finally {
      setTransposing(false);
    }
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

  const ALL_KEYS = [
    ...CHROMATIC_KEYS,
    ...CHROMATIC_KEYS.map(k => k + "m"),
  ];

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
              variant="outline"
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={() => setShowMoisesModal(true)}
            >
              <Download className="h-3.5 w-3.5" /> Importar Moises
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

      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        {/* Left: metadata */}
        <div className="space-y-6">
          <GlassCard className="p-6 space-y-4">
            <div className="w-40 mx-auto">
              <CoverUpload
                songId={id!}
                teamId={currentTeam?.id || ""}
                coverPath={coverPath}
                onUpload={(path) => setCoverPath(path)}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tom original</label>
                  <Select value={keyOriginal} onValueChange={setKeyOriginal} disabled={readOnly}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_KEYS.map(k => (
                        <SelectItem key={k} value={k}>{k}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tom atual</label>
                  <div className="flex gap-1 items-center">
                    <Select
                      value={keyCurrent}
                      onValueChange={(newKey) => {
                        if (cifraText && keyCurrent && newKey !== keyCurrent) {
                          handleTransposeTo(newKey);
                        } else {
                          setKeyCurrent(newKey);
                        }
                      }}
                      disabled={readOnly || transposing}
                    >
                      <SelectTrigger className="rounded-xl flex-1">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_KEYS.map(k => (
                          <SelectItem key={k} value={k}>{k}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {transposing && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Link de mídia</label>
                <GlassInput value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} readOnly={readOnly} placeholder="YouTube, Spotify..." />
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
              {/* Áudio Mix (para sincronização) */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Áudio Mix (para sincronização)</label>
                <AudioUpload
                  songId={id!}
                  teamId={currentTeam?.id || ""}
                  audioPath={audioPath}
                  onUpload={(path) => setAudioPath(path)}
                  readOnly={readOnly}
                />
              </div>
              {audioPath && !readOnly && (
                <div>
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
              )}
              {/* Separação automática em stems (Demucs / IA) */}
              {audioPath && !readOnly && (
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

              {/* Tracks (faixas separadas) */}
              <TrackUpload
                songId={id!}
                teamId={currentTeam?.id || ""}
                tracks={tracks}
                onTracksChange={() => refetchTracks()}
                readOnly={readOnly}
              />
            </div>
          </GlassCard>

          {youtubeId && (
            <GlassCard className="p-4 overflow-hidden">
              <div className="aspect-video rounded-xl overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="YouTube preview"
                />
              </div>
            </GlassCard>
          )}

          {/* Song History */}
          <GlassCard className="p-5">
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

        {/* Right: cifra + lyrics tabs */}
        <GlassCard className="p-6">
          <Tabs defaultValue="cifra" className="w-full">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="cifra" className="flex-1">Cifra</TabsTrigger>
              <TabsTrigger value="lyrics" className="flex-1">Letra</TabsTrigger>
            </TabsList>
            <TabsContent value="cifra">
              <textarea
                value={cifraText}
                onChange={(e) => setCifraText(e.target.value)}
                readOnly={readOnly}
                className="w-full min-h-[400px] lg:min-h-[600px] rounded-xl glass-input p-4 font-mono text-sm leading-relaxed resize-y placeholder:text-muted-foreground/60 focus-visible:outline-none"
                placeholder="Cole ou digite a cifra aqui..."
              />
            </TabsContent>
            <TabsContent value="lyrics">
              <textarea
                value={lyricsText}
                onChange={(e) => setLyricsText(e.target.value)}
                readOnly={readOnly}
                className="w-full min-h-[400px] lg:min-h-[600px] rounded-xl glass-input p-4 font-mono text-sm leading-relaxed resize-y placeholder:text-muted-foreground/60 focus-visible:outline-none"
                placeholder="Cole ou digite a letra aqui. Use [tags] para separar as partes (ex: [Refrão], [Verso 1])..."
              />
            </TabsContent>
          </Tabs>
        </GlassCard>
      </div>

      {/* Moises Import Modal */}
      <Dialog open={showMoisesModal} onOpenChange={setShowMoisesModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar do Moises</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cole o conteúdo completo do Chord Chart do Moises (Ctrl+A / Ctrl+C). O link sozinho pode trazer música errada.
            </p>
            <textarea
              value={moisesText}
              onChange={(e) => setMoisesText(e.target.value)}
              placeholder="Cole aqui todo o conteúdo da página do Chord Chart"
              className="w-full min-h-[200px] rounded-xl glass-input p-3 font-mono text-xs leading-relaxed resize-y placeholder:text-muted-foreground/60 focus-visible:outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowMoisesModal(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                onClick={handleImportMoises}
                disabled={importingMoises || !moisesText.trim()}
                className="rounded-xl gap-1.5"
              >
                {importingMoises ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importando...</>
                ) : (
                  <><Download className="h-3.5 w-3.5" /> Importar</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
