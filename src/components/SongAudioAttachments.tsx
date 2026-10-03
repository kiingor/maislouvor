import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Headphones, Link2, Loader2, Pencil, Play, Plus, RefreshCw, Trash2, Upload, X, Youtube } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSongAudioAttachments } from "@/hooks/useSongAudioAttachments";
import { useToast } from "@/hooks/use-toast";
import { AUDIO_ACCEPT, attachmentQueryKey, audioImportError, importSongAudio, removeSongAudio, renameSongAudio, uploadSongAudio, validateAudioFile, type SongAudioAttachment } from "@/lib/songAudioAttachments";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogToolbar } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { youtubeImportEnabled } from "@/lib/storeBuild";

/* Lista agrupada iOS (card opaco). Dentro de uma folha, a própria folha troca --card pelo
   fundo terciário no escuro (#2C2C2E), então o mesmo card contrasta com o material. */
const card = "overflow-hidden rounded-card bg-card";
const groupLabel = "mx-4 mb-1.5 block text-footnote text-muted-foreground";
const helper = "mx-4 mt-2 text-footnote text-muted-foreground";
const bareInput =
  "h-11 w-full min-w-0 bg-transparent px-4 text-body text-foreground caret-primary placeholder:text-label-tertiary focus:outline-none focus-visible:outline-none disabled:opacity-50";

function AttachmentPlayer({ attachment, onPlay }: { attachment: SongAudioAttachment; onPlay?: () => void }) {
  const [playbackError, setPlaybackError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { data: url, isPending, isError, refetch } = useQuery({
    queryKey: ["additional-audio-url", attachment.id, attachment.audio_path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("audio").createSignedUrl(attachment.audio_path!, 3600);
      if (error || !data?.signedUrl) throw error || new Error("Áudio indisponível");
      return data.signedUrl;
    },
    staleTime: 50 * 60 * 1000,
  });
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (!audio) return;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, [url, isError, playbackError]);
  if (isPending) return <p role="status" className="text-footnote text-muted-foreground">Carregando áudio...</p>;
  if (isError || playbackError) return <div className="text-footnote text-ios-red">Não foi possível carregar o áudio. <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => { setPlaybackError(false); refetch(); }}>Tentar novamente</button></div>;
  return <audio ref={audioRef} aria-label={`Reproduzir ${attachment.title}`} controls autoPlay preload="metadata" src={url} onPlay={onPlay} onError={() => setPlaybackError(true)} className="block h-10 w-full min-w-0" />;
}

interface Props {
  songId: string;
  teamId?: string;
  readOnly?: boolean;
  onPlaybackStart?: () => void;
  /** Esconde o título da seção quando quem a embrulha já o mostra (ex.: barra da folha). */
  hideHeading?: boolean;
}

export function SongAudioAttachments({ songId, teamId, readOnly = true, onPlaybackStart, hideHeading = false }: Props) {
  const { data: attachments = [], isPending, isError, error, refetch } = useSongAudioAttachments(songId);
  const notEnabled = ["PGRST205", "42P01"].includes((error as { code?: string } | null)?.code ?? "");
  const qc = useQueryClient();
  const { toast } = useToast();
  const formId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SongAudioAttachment | null>(null);
  const [removing, setRemoving] = useState<SongAudioAttachment | null>(null);
  const [source, setSource] = useState("file");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const canEdit = !readOnly && !!teamId;
  // Build das lojas: só arquivo (sem aba, status nem "Tentar novamente" do YouTube).
  const youtube = youtubeImportEnabled();
  const fromYoutube = youtube && source === "youtube";

  const refresh = () => qc.invalidateQueries({ queryKey: attachmentQueryKey(songId) });
  const run = async (operation: () => Promise<void>) => {
    if (!canEdit || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await operation(); }
    catch (error) {
      toast({ title: "Não foi possível concluir", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally { busyRef.current = false; setBusy(false); }
  };
  const openForm = (item?: SongAudioAttachment) => {
    setEditing(item ?? null);
    setTitle(item?.title ?? "");
    setSource("file");
    setUrl("");
    setFile(null);
    setSelectedId(null);
    setFormOpen(true);
  };
  const save = () => run(async () => {
    if (editing) await renameSongAudio(editing.id, title);
    else if (fromYoutube) await importSongAudio(songId, title, url);
    else if (file) await uploadSongAudio(songId, teamId!, title, file);
    else return;
    setFormOpen(false);
    await refresh();
    toast({ title: editing ? "Nome atualizado" : fromYoutube ? "Importação iniciada" : "Áudio adicional salvo",
      description: !editing && fromYoutube ? "O áudio ficará disponível aqui quando a importação terminar." : undefined });
  });

  const submitLabel = busy ? "Salvando..." : editing ? "Salvar nome" : fromYoutube ? "Importar áudio" : "Adicionar áudio";
  const submitDisabled = busy || !title.trim() || (!editing && (fromYoutube ? !url.trim() : !file));

  return (
    <section aria-label="Áudios adicionais" className="min-w-0">
      {(!hideHeading || canEdit) && <div className={cn("mx-1 mb-2 flex flex-wrap items-end gap-x-3", hideHeading ? "justify-end" : "justify-between")}>
        {!hideHeading && (
          <h2 className="min-w-0 text-title3 text-foreground">
            Áudios adicionais
            {attachments.length > 0 && <span className="font-normal tabular-nums text-muted-foreground"> {attachments.length}</span>}
          </h2>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => openForm()}
            disabled={busy || isPending || isError}
            className="-my-2.5 -mr-1.5 inline-flex min-h-[44px] items-center gap-1 rounded-[10px] px-1.5 text-subhead font-medium text-primary transition-opacity active:opacity-60 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Adicionar
          </button>
        )}
      </div>}

      {isPending ? (
        <div className={cn(card, "flex items-center gap-3 px-4 py-4")}>
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
          <p role="status" className="min-w-0 text-subhead text-muted-foreground">Carregando adicionais...</p>
        </div>
      ) : isError ? (
        <div role="alert" className={cn(card, "flex items-start gap-3 px-4 py-3.5")}>
          <AlertTriangle className="mt-px h-5 w-5 shrink-0 text-ios-red" aria-hidden="true" />
          <p className="min-w-0 text-subhead text-foreground">
            {notEnabled ? "Áudios adicionais ainda não estão disponíveis neste ambiente." : "Não foi possível carregar os adicionais."}{" "}
            <button type="button" className="relative font-medium text-primary underline underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3" onClick={() => refetch()}>Tentar novamente</button>
          </p>
        </div>
      ) : !attachments.length ? (
        <div className={cn(card, "flex items-center gap-3 px-4 py-4")}>
          <Headphones className="h-7 w-7 shrink-0 text-label-tertiary" aria-hidden="true" />
          <p className="min-w-0 text-body text-muted-foreground">{canEdit ? (youtube ? "Adicione um arquivo de áudio ou importe do YouTube." : "Adicione um arquivo de áudio.") : "Nenhum áudio adicional nesta música."}</p>
        </div>
      ) : (
        <ul className={card}>
          {attachments.map((item) => {
            const selected = selectedId === item.id;
            const pending = ["queued", "processing"].includes(item.status);
            return (
              <li
                key={item.id}
                className="relative min-w-0 before:pointer-events-none before:absolute before:left-16 before:right-0 before:top-0 before:border-t before:border-separator first:before:hidden"
              >
                <div className="flex min-h-[60px] min-w-0 items-center gap-3 px-4 py-2">
                  <button
                    type="button"
                    className={cn(
                      "relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors after:absolute after:-inset-1 disabled:text-muted-foreground",
                      selected ? "bg-prominent text-prominent-foreground" : "bg-fill-tertiary text-foreground active:bg-fill-secondary",
                    )}
                    disabled={item.status !== "ready"}
                    aria-label={selected ? `Fechar ${item.title}` : `Ouvir ${item.title}`}
                    onClick={() => { setSelectedId(selected ? null : item.id); if (!selected) onPlaybackStart?.(); }}
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} aria-hidden="true" />
                    ) : selected ? (
                      <X className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      <Play className="ml-0.5 h-4 w-4" strokeWidth={2.25} fill="currentColor" aria-hidden="true" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-body text-foreground" title={item.title}>{item.title}</p>
                    <p className="flex items-center gap-1 text-footnote text-muted-foreground">
                      {!item.youtube_url ? <Upload className="h-[13px] w-[13px] shrink-0" strokeWidth={2.25} aria-hidden="true" />
                        : youtube ? <Youtube className="h-[13px] w-[13px] shrink-0" strokeWidth={2.25} aria-hidden="true" />
                        : <Link2 className="h-[13px] w-[13px] shrink-0" strokeWidth={2.25} aria-hidden="true" />}
                      {item.status === "queued" ? "Aguardando importação"
                        : item.status === "processing" ? (youtube ? "Importando do YouTube..." : "Importando...")
                        : item.status === "error" ? "Falha na importação"
                        : item.youtube_url ? (youtube ? "YouTube" : "Importado") : "Arquivo de áudio"}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="-mr-2 flex shrink-0">
                      <button
                        type="button"
                        className="grid h-11 w-11 place-items-center rounded-full text-primary transition-colors active:bg-fill-tertiary disabled:opacity-40"
                        aria-label={`Renomear ${item.title}`}
                        disabled={busy}
                        onClick={() => openForm(item)}
                      >
                        <Pencil className="h-[17px] w-[17px]" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="grid h-11 w-11 place-items-center rounded-full text-ios-red transition-colors active:bg-fill-tertiary disabled:opacity-40"
                        aria-label={`Remover ${item.title}`}
                        disabled={busy}
                        onClick={() => setRemoving(item)}
                      >
                        <Trash2 className="h-[17px] w-[17px]" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
                {item.status === "error" && (
                  <div className="min-w-0 space-y-1 pb-3 pl-16 pr-4">
                    <p className="text-footnote text-ios-red">{audioImportError(item.error)}</p>
                    {canEdit && youtube && item.youtube_url && (
                      <button
                        type="button"
                        disabled={busy}
                        className="-my-1 -ml-1 inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] px-1 text-subhead font-medium text-primary transition-opacity active:opacity-60 disabled:opacity-40"
                        onClick={() => run(async () => { await importSongAudio(songId, item.title, item.youtube_url!, item.id); await refresh(); })}
                      >
                        <RefreshCw className="h-[15px] w-[15px]" strokeWidth={2.25} aria-hidden="true" />
                        Tentar novamente
                      </button>
                    )}
                  </div>
                )}
                {selected && item.audio_path && (
                  <div className="min-w-0 px-4 pb-3">
                    <AttachmentPlayer key={item.id} attachment={item} onPlay={onPlaybackStart} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mx-1 mt-2 text-footnote text-muted-foreground">Kit de voz, versões e referências para estudar a música.</p>

      <Dialog open={formOpen} onOpenChange={(open) => { if (!busy) setFormOpen(open); }}>
        <DialogContent>
          {/* Barra da folha: Fechar à esquerda, título, Confirmar (✓, envia o formulário) à direita. */}
          <DialogToolbar
            title={editing ? "Renomear áudio" : "Adicionar áudio"}
            confirm={{ label: submitLabel, type: "submit", form: `${formId}-form`, disabled: submitDisabled, loading: busy }}
          />
          <DialogDescription className="-mt-1 text-center">{editing ? "Use um nome fácil de reconhecer." : youtube ? "Dê um nome ao material e escolha como importar." : "Dê um nome ao material e escolha o arquivo de áudio."}</DialogDescription>
          <form id={`${formId}-form`} className="min-w-0 space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div>
              <label htmlFor={`${formId}-title`} className={groupLabel}>Nome do áudio</label>
              <div className={card}>
                <input id={`${formId}-title`} className={bareInput} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ex.: Kit de voz — Contralto" autoFocus required disabled={busy} />
              </div>
            </div>
            {!editing && (
              <Tabs value={youtube ? source : "file"} onValueChange={setSource}>
                {youtube && <TabsList className="w-full">
                  <TabsTrigger value="file" disabled={busy} className="flex-1"><Upload className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />Arquivo</TabsTrigger>
                  <TabsTrigger value="youtube" disabled={busy} className="flex-1"><Youtube className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />YouTube</TabsTrigger>
                </TabsList>}
                <TabsContent value="file" className={youtube ? "mt-4" : "mt-0"}>
                  <label htmlFor={`${formId}-file`} className={groupLabel}>Arquivo de áudio</label>
                  <div className={cn(card, "px-4 py-3")}>
                    <input
                      id={`${formId}-file`}
                      type="file"
                      accept={AUDIO_ACCEPT}
                      disabled={busy}
                      className="-my-1.5 block w-full min-w-0 py-1.5 text-footnote text-muted-foreground file:mr-3 file:h-8 file:rounded-full file:border-0 file:bg-fill-secondary file:px-3.5 file:text-subhead file:font-semibold file:text-foreground disabled:opacity-50"
                      onChange={(e) => {
                        const selected = e.target.files?.[0];
                        setFile(null);
                        if (!selected) return;
                        try { validateAudioFile(selected); setFile(selected); if (!title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, "").slice(0, 120)); }
                        catch (error) { e.target.value = ""; toast({ title: "Arquivo inválido", description: (error as Error).message, variant: "destructive" }); }
                      }}
                    />
                  </div>
                  <p className={helper}>MP3, M4A, WAV e outros formatos de áudio. Até 50 MB.</p>
                  {file && <p className={cn(helper, "mt-1 break-all")}>{file.name}</p>}
                </TabsContent>
                {youtube && <TabsContent value="youtube" className="mt-4">
                  <label htmlFor={`${formId}-url`} className={groupLabel}>Link do YouTube</label>
                  <div className={card}>
                    <input
                      id={`${formId}-url`}
                      type="url"
                      className={bareInput}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      disabled={busy}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <p className={helper}>A importação continua mesmo se você fechar esta tela.</p>
                </TabsContent>}
              </Tabs>
            )}
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open && !busy) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover áudio adicional?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">“{removing?.title}” será removido desta música.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} disabled={busy} onClick={(e) => { e.preventDefault(); if (!removing) return; run(async () => {
              const cleaned = await removeSongAudio(removing);
              if (selectedId === removing.id) setSelectedId(null);
              setRemoving(null);
              await refresh();
              toast({ title: "Áudio adicional removido", description: cleaned ? undefined : "O adicional foi removido, mas não foi possível apagar o arquivo armazenado." });
            }); }}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
