import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Headphones, Loader2, Pencil, Play, Plus, RefreshCw, Trash2, Upload, X, Youtube } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSongAudioAttachments } from "@/hooks/useSongAudioAttachments";
import { useToast } from "@/hooks/use-toast";
import { AUDIO_ACCEPT, attachmentQueryKey, audioImportError, importSongAudio, removeSongAudio, renameSongAudio, uploadSongAudio, validateAudioFile, type SongAudioAttachment } from "@/lib/songAudioAttachments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  if (isPending) return <p role="status" className="text-xs text-muted-foreground p-3">Carregando áudio...</p>;
  if (isError || playbackError) return <div className="p-3 text-xs text-destructive">Não foi possível carregar o áudio. <button className="underline" onClick={() => { setPlaybackError(false); refetch(); }}>Tentar novamente</button></div>;
  return <audio ref={audioRef} aria-label={`Reproduzir ${attachment.title}`} controls autoPlay preload="metadata" src={url} onPlay={onPlay} onError={() => setPlaybackError(true)} className="block h-10 w-full min-w-0" />;
}

interface Props {
  songId: string;
  teamId?: string;
  readOnly?: boolean;
  onPlaybackStart?: () => void;
}

export function SongAudioAttachments({ songId, teamId, readOnly = true, onPlaybackStart }: Props) {
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
    else if (source === "youtube") await importSongAudio(songId, title, url);
    else if (file) await uploadSongAudio(songId, teamId!, title, file);
    else return;
    setFormOpen(false);
    await refresh();
    toast({ title: editing ? "Nome atualizado" : source === "youtube" ? "Importação iniciada" : "Áudio adicional salvo",
      description: !editing && source === "youtube" ? "O áudio ficará disponível aqui quando a importação terminar." : undefined });
  });

  return (
    <section aria-label="Áudios adicionais" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Headphones className="h-4 w-4 shrink-0" />Áudios adicionais{attachments.length > 0 && <span className="text-xs font-normal text-muted-foreground">({attachments.length})</span>}</h3>
        {canEdit && <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => openForm()} disabled={busy || isPending || isError}><Plus className="h-3.5 w-3.5" />Adicionar</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Kit de voz, versões e referências para estudar a música.</p>
      {isPending ? <p role="status" className="text-xs text-muted-foreground">Carregando adicionais...</p>
        : isError ? <div role="alert" className="text-xs text-destructive">{notEnabled ? "Áudios adicionais ainda não estão disponíveis neste ambiente." : "Não foi possível carregar os adicionais."} <button className="underline" onClick={() => refetch()}>Tentar novamente</button></div>
        : !attachments.length ? <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">{canEdit ? "Adicione um arquivo de áudio ou importe do YouTube." : "Nenhum áudio adicional nesta música."}</p> : (
          <ul className="space-y-2">
            {attachments.map((item) => {
              const selected = selectedId === item.id;
              const pending = ["queued", "processing"].includes(item.status);
              return <li key={item.id} className="min-w-0 rounded-xl border border-border/60 bg-accent/20 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg" disabled={item.status !== "ready"} aria-label={selected ? `Fechar ${item.title}` : `Ouvir ${item.title}`} onClick={() => { setSelectedId(selected ? null : item.id); if (!selected) onPlaybackStart?.(); }}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : selected ? <X className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm font-medium" title={item.title}>{item.title}</p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">{item.youtube_url ? <Youtube className="h-3 w-3 shrink-0" /> : <Upload className="h-3 w-3 shrink-0" />}{item.status === "queued" ? "Aguardando importação" : item.status === "processing" ? "Importando do YouTube..." : item.status === "error" ? "Falha na importação" : item.youtube_url ? "YouTube" : "Arquivo de áudio"}</p>
                  </div>
                  {canEdit && <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Renomear ${item.title}`} disabled={busy} onClick={() => openForm(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Remover ${item.title}`} disabled={busy} onClick={() => setRemoving(item)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>}
                </div>
                {item.status === "error" && <div className="mt-2 space-y-2"><p className="text-xs text-destructive">{audioImportError(item.error)}</p>{canEdit && <Button size="sm" variant="outline" disabled={busy} className="rounded-lg gap-1.5" onClick={() => run(async () => { await importSongAudio(songId, item.title, item.youtube_url!, item.id); await refresh(); })}><RefreshCw className="h-3.5 w-3.5" />Tentar novamente</Button>}</div>}
                {selected && item.audio_path && <div className="mt-3 min-w-0"><AttachmentPlayer key={item.id} attachment={item} onPlay={onPlaybackStart} /></div>}
              </li>;
            })}
          </ul>
        )}

      <Dialog open={formOpen} onOpenChange={(open) => { if (!busy) setFormOpen(open); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl">
          <DialogHeader><DialogTitle>{editing ? "Renomear áudio" : "Adicionar áudio"}</DialogTitle><DialogDescription>{editing ? "Use um nome fácil de reconhecer." : "Dê um nome ao material e escolha como importar."}</DialogDescription></DialogHeader>
          <form className="min-w-0 space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="space-y-1.5"><label htmlFor={`${formId}-title`} className="text-sm font-medium">Nome do áudio</label><Input id={`${formId}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ex.: Kit de voz — Contralto" autoFocus required disabled={busy} /></div>
            {!editing && <Tabs value={source} onValueChange={setSource}>
              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="file" disabled={busy} className="gap-1.5"><Upload className="h-3.5 w-3.5" />Arquivo</TabsTrigger><TabsTrigger value="youtube" disabled={busy} className="gap-1.5"><Youtube className="h-3.5 w-3.5" />YouTube</TabsTrigger></TabsList>
              <TabsContent value="file" className="space-y-2 pt-2"><label htmlFor={`${formId}-file`} className="text-sm font-medium">Arquivo de áudio</label><Input id={`${formId}-file`} type="file" accept={AUDIO_ACCEPT} disabled={busy} className="w-full min-w-0 text-xs" onChange={(e) => {
                const selected = e.target.files?.[0];
                setFile(null);
                if (!selected) return;
                try { validateAudioFile(selected); setFile(selected); if (!title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, "").slice(0, 120)); }
                catch (error) { e.target.value = ""; toast({ title: "Arquivo inválido", description: (error as Error).message, variant: "destructive" }); }
              }} /><p className="text-xs text-muted-foreground">MP3, M4A, WAV e outros formatos de áudio. Até 50 MB.</p>{file && <p className="break-all text-xs text-muted-foreground">{file.name}</p>}</TabsContent>
              <TabsContent value="youtube" className="space-y-2 pt-2"><label htmlFor={`${formId}-url`} className="text-sm font-medium">Link do YouTube</label><Input id={`${formId}-url`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." disabled={busy} /><p className="text-xs text-muted-foreground">A importação continua mesmo se você fechar esta tela.</p></TabsContent>
            </Tabs>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setFormOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy || !title.trim() || (!editing && (source === "file" ? !file : !url.trim()))} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Salvando..." : editing ? "Salvar nome" : source === "youtube" ? "Importar áudio" : "Adicionar áudio"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open && !busy) setRemoving(null); }}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Remover áudio adicional?</AlertDialogTitle><AlertDialogDescription className="break-words">“{removing?.title}” será removido desta música.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); if (!removing) return; run(async () => {
          const cleaned = await removeSongAudio(removing);
          if (selectedId === removing.id) setSelectedId(null);
          setRemoving(null);
          await refresh();
          toast({ title: "Áudio adicional removido", description: cleaned ? undefined : "O adicional foi removido, mas não foi possível apagar o arquivo armazenado." });
        }); }}>Remover</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
