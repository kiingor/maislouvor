import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AudioLines, Upload, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* Linha de lista agrupada iOS (o card vem do pai): 52pt, ícone em quadrado de 30pt e
   separador recuado até o texto, oculto na primeira linha do grupo. */
const row =
  "relative flex min-h-[52px] items-center gap-3 px-4 py-1.5 before:pointer-events-none before:absolute before:left-[58px] before:right-0 before:top-0 before:border-t before:border-separator first:before:hidden";
const rowIcon =
  "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground";
const symbol = "h-[17px] w-[17px]";

interface AudioUploadProps {
  songId: string;
  teamId: string;
  audioPath: string | null;
  onUpload: (path: string | null) => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  readOnly?: boolean;
  /** Compact: don't render an audio player (the trimmer/mixer already play it) — just manage the file. */
  compact?: boolean;
}

export function AudioUpload({
  songId,
  teamId,
  audioPath,
  onUpload,
  readOnly,
  compact,
  onBusyChange,
}: AudioUploadProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!audioPath) {
      setSignedUrl(null);
      return;
    }
    supabase.storage
      .from("audio")
      .createSignedUrl(audioPath, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) setSignedUrl(data.signedUrl);
      });
  }, [audioPath]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop();
    const path = `${teamId}/${songId}.${ext}`;

    setUploading(true);
    onBusyChange?.(true);
    try {
      const { error } = await supabase.storage
        .from("audio")
        .upload(path, file, { upsert: true });

      if (error) {
        toast({
          title: "Erro ao enviar áudio",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      const { data } = await supabase.storage
        .from("audio")
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) setSignedUrl(data.signedUrl);
      await onUpload(path);
      toast({ title: "Áudio enviado com sucesso" });
    } catch (error) {
      toast({
        title: "Erro ao enviar áudio",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      onBusyChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!audioPath) return;
    setUploading(true);
    onBusyChange?.(true);
    try {
      const { error } = await supabase.storage
        .from("audio")
        .remove([audioPath]);
      if (error) throw error;
      setSignedUrl(null);
      await onUpload(null);
      toast({ title: "Áudio removido" });
    } catch (error) {
      toast({
        title: "Não foi possível remover áudio",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      onBusyChange?.(false);
    }
  };

  const removeButton = (
    <button
      type="button"
      onClick={handleRemove}
      disabled={uploading}
      aria-label="Remover áudio"
      title="Remover áudio"
      className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ios-red transition-colors active:bg-fill-tertiary"
    >
      <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );

  return (
    <div>
      {signedUrl && compact ? (
        <div className={row}>
          <span className={rowIcon} aria-hidden="true">
            <AudioLines className={symbol} />
          </span>
          <span className="min-w-0 flex-1 truncate text-body text-foreground">
            Áudio enviado
          </span>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[10px] px-1.5 text-subhead font-medium text-primary disabled:opacity-40"
              >
                {uploading && (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
                )}
                Trocar
              </button>
              {removeButton}
            </>
          )}
        </div>
      ) : signedUrl ? (
        <div className={row}>
          <span className={rowIcon} aria-hidden="true">
            <AudioLines className={symbol} />
          </span>
          <audio controls src={signedUrl} className="h-10 min-w-0 flex-1" />
          {!readOnly && removeButton}
        </div>
      ) : !readOnly ? (
        <button
          type="button"
          className={cn(
            row,
            "w-full text-left transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary disabled:pointer-events-none"
          )}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-busy={uploading || undefined}
        >
          <span className={cn(rowIcon, "text-primary")} aria-hidden="true">
            {uploading ? (
              <Loader2 className={cn(symbol, "animate-spin")} />
            ) : (
              <Upload className={symbol} />
            )}
          </span>
          <span className="min-w-0 flex-1 text-body text-primary">
            {uploading ? "Enviando..." : "Upload de áudio"}
          </span>
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.m4a,.wav,.ogg,audio/*"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
