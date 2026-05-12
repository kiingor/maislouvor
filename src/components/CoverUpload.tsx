import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Music, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

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

  return (
    <div
      onClick={() => !readOnly && inputRef.current?.click()}
      className={cn(
        "relative w-full aspect-square rounded-2xl overflow-hidden glass flex items-center justify-center",
        !readOnly && "cursor-pointer hover-lift group"
      )}
    >
      {signedUrl ? (
        <img src={signedUrl} alt="Capa" className="w-full h-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Music className="h-10 w-10" />
          {!readOnly && <span className="text-xs">Adicionar capa</span>}
        </div>
      )}

      {!readOnly && (
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors flex items-center justify-center">
          <Upload className="h-6 w-6 text-foreground opacity-0 group-hover:opacity-60 transition-opacity" />
        </div>
      )}

      {uploading && (
        <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
          <div className="h-6 w-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  );
}
