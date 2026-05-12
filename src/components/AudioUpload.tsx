import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Volume2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioUploadProps {
  songId: string;
  teamId: string;
  audioPath: string | null;
  onUpload: (path: string | null) => void;
  readOnly?: boolean;
}

export function AudioUpload({ songId, teamId, audioPath, onUpload, readOnly }: AudioUploadProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!audioPath) { setSignedUrl(null); return; }
    supabase.storage.from("audio").createSignedUrl(audioPath, 3600).then(({ data }) => {
      if (data?.signedUrl) setSignedUrl(data.signedUrl);
    });
  }, [audioPath]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop();
    const path = `${teamId}/${songId}.${ext}`;

    setUploading(true);
    const { error } = await supabase.storage.from("audio").upload(path, file, { upsert: true });
    setUploading(false);

    if (error) {
      toast({ title: "Erro ao enviar áudio", description: error.message, variant: "destructive" });
      return;
    }

    const { data } = await supabase.storage.from("audio").createSignedUrl(path, 3600);
    if (data?.signedUrl) setSignedUrl(data.signedUrl);
    onUpload(path);
    toast({ title: "Áudio enviado com sucesso" });
  };

  const handleRemove = async () => {
    if (!audioPath) return;
    await supabase.storage.from("audio").remove([audioPath]);
    setSignedUrl(null);
    onUpload(null);
    toast({ title: "Áudio removido" });
  };

  return (
    <div className="space-y-2">
      {signedUrl ? (
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-primary shrink-0" />
          <audio controls src={signedUrl} className="flex-1 h-8" />
          {!readOnly && (
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={handleRemove}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      ) : !readOnly ? (
        <Button
          variant="outline"
          className="w-full rounded-xl gap-2"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? "Enviando..." : "Upload de áudio"}
        </Button>
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
