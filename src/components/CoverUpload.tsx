import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Music } from "lucide-react";

interface CoverUploadProps {
  songId: string;
  teamId: string;
  coverPath: string | null;
  onUpload: (path: string) => void;
  readOnly?: boolean;
}

export function CoverUpload({ songId, teamId, coverPath, onUpload, readOnly }: CoverUploadProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  // Fetch signed URL when coverPath changes
  useEffect(() => {
    if (!coverPath) { setSignedUrl(null); return; }
    supabase.storage.from("covers").createSignedUrl(coverPath, 3600).then(({ data }) => {
      if (data?.signedUrl) setSignedUrl(data.signedUrl);
    });
  }, [coverPath]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop();
    const path = `${teamId}/${songId}.${ext}`;

    setUploading(true);
    const { error } = await supabase.storage.from("covers").upload(path, file, { upsert: true });
    setUploading(false);

    if (error) {
      toast({ title: "Erro ao enviar capa", description: error.message, variant: "destructive" });
      return;
    }

    // Get new signed URL
    const { data } = await supabase.storage.from("covers").createSignedUrl(path, 3600);
    if (data?.signedUrl) setSignedUrl(data.signedUrl);
    onUpload(path);
  };

  // Arte quadrada (estilo Apple Music): superfície opaca; sem hover no toque, então a ação
  // fica num botão de texto tintado logo abaixo, e o próprio quadro também abre o seletor.
  const artwork = (
    <span className="relative block aspect-square w-full overflow-hidden rounded-[20px] bg-fill-tertiary">
      {signedUrl ? (
        <img src={signedUrl} alt={readOnly ? "Capa" : ""} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-label-tertiary">
          <Music className="h-11 w-11" strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      {uploading && (
        <span className="absolute inset-0 flex items-center justify-center bg-background/60">
          <Loader2 className="h-6 w-6 animate-spin text-foreground" aria-hidden="true" />
        </span>
      )}
    </span>
  );

  if (readOnly) return <div className="w-full">{artwork}</div>;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-busy={uploading || undefined}
        className="group flex w-full flex-col items-center gap-2"
      >
        <span className="block w-full transition-transform duration-200 group-active:scale-[0.98] group-hover:opacity-95">{artwork}</span>
        <span className="inline-flex min-h-[32px] items-center text-subhead font-medium text-primary">
          {signedUrl ? "Trocar capa" : "Adicionar capa"}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  );
}
