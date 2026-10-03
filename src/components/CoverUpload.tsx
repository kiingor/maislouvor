import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Music, Plus } from "lucide-react";

interface CoverUploadProps {
  songId: string;
  teamId: string;
  coverPath: string | null;
  onUpload: (path: string) => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  readOnly?: boolean;
  compact?: boolean;
}

export function CoverUpload({
  songId,
  teamId,
  coverPath,
  onUpload,
  readOnly,
  compact,
  onBusyChange,
}: CoverUploadProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  // Fetch signed URL when coverPath changes
  useEffect(() => {
    if (!coverPath) {
      setSignedUrl(null);
      return;
    }
    supabase.storage
      .from("covers")
      .createSignedUrl(coverPath, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) setSignedUrl(data.signedUrl);
      });
  }, [coverPath]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast({
        title: "Escolha JPG, PNG ou WebP de até 5 MB",
        variant: "destructive",
      });
      return;
    }

    const ext = file.name.split(".").pop();
    const path = `${teamId}/${songId}.${ext}`;

    setUploading(true);
    onBusyChange?.(true);
    try {
      const { error } = await supabase.storage
        .from("covers")
        .upload(path, file, { upsert: true });

      if (error) {
        toast({
          title: "Erro ao enviar capa",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      // Get new signed URL
      const { data } = await supabase.storage
        .from("covers")
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) setSignedUrl(data.signedUrl);
      await onUpload(path);
    } catch (error) {
      toast({
        title: "Erro ao enviar capa",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      onBusyChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Arte quadrada (estilo Apple Music): superfície opaca; sem hover no toque, então a ação
  // fica num botão de texto tintado logo abaixo, e o próprio quadro também abre o seletor.
  const artwork = (
    <span className="relative block aspect-square w-full overflow-hidden rounded-[20px] bg-fill-tertiary">
      {signedUrl ? (
        <img
          src={signedUrl}
          alt={readOnly ? "Capa" : ""}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-label-tertiary">
          <Music className="h-11 w-11" strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      {compact && !readOnly && !uploading && (
        <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full border-2 border-card bg-prominent text-prominent-foreground">
          <Plus className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
      {uploading && (
        <span className="absolute inset-0 flex items-center justify-center bg-background/60">
          <Loader2
            className="h-6 w-6 animate-spin text-foreground"
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );

  if (readOnly)
    return (
      <div className={compact ? "w-[62px] shrink-0" : "w-full"}>{artwork}</div>
    );

  return (
    <div className={compact ? "flex items-center gap-3" : "w-full"}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-busy={uploading || undefined}
        className={
          compact
            ? "group flex items-center gap-3"
            : "group flex w-full flex-col items-center gap-2"
        }
      >
        <span
          className={
            compact
              ? "block w-[62px] shrink-0"
              : "block w-full transition-transform duration-200 group-active:scale-[0.98] group-hover:opacity-95"
          }
        >
          {artwork}
        </span>
        <span
          className={
            compact
              ? "sr-only"
              : "inline-flex min-h-[44px] items-center text-subhead font-medium text-primary"
          }
        >
          {signedUrl ? "Trocar capa" : "Adicionar capa"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
