import { musicManagementEnabled } from "@/lib/storeBuild";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Upload, Loader2, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

const NAME_MAP: [RegExp, string][] = [
  [/vocals?|voice|voz/i, "Vocais"],
  [/drums?|bateria/i, "Bateria"],
  [/bass|baixo/i, "Baixo"],
  [/guitars?|guitarra/i, "Guitarra"],
  [/piano|keys|teclado|keyboard/i, "Teclado"],
  [/other|outro/i, "Outros"],
];

function detectTrackName(filename: string): string {
  const name = filename.replace(/\.\w+$/, ""); // remove extension
  for (const [pattern, label] of NAME_MAP) {
    if (pattern.test(name)) return label;
  }
  // Fallback: clean up the filename
  const parts = name.split(/[-_ ]+/).filter(Boolean);
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1);
}

interface Track {
  id: string;
  track_name: string;
  audio_path: string;
  sort_order: number;
}

interface TrackUploadProps {
  songId: string;
  teamId: string;
  tracks: Track[];
  onTracksChange: () => void;
  onTracksAdded?: () => void; // called after batch upload so parent can clear audioPath
  readOnly?: boolean;
}

export function TrackUpload({ songId, teamId, tracks, onTracksChange, onTracksAdded, readOnly }: TrackUploadProps) {
  readOnly = readOnly || !musicManagementEnabled();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUploadBatch = async (files: FileList) => {
    if (readOnly || !files.length || !teamId || !songId) return;
    setUploading(true);
    setUploadCount(files.length);

    try {
      const uploads = Array.from(files).map(async (file, idx) => {
        const trackName = detectTrackName(file.name);
        const safeName = trackName.replace(/[^a-zA-Z0-9_-]/g, "_");
        const path = `${teamId}/${songId}/tracks/${safeName}_${Date.now()}_${idx}.mp3`;

        const { error: uploadError } = await supabase.storage.from("audio").upload(path, file, {
          contentType: file.type || "audio/mpeg",
          upsert: true,
        });
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from("song_tracks" as any).insert({
          song_id: songId,
          track_name: trackName,
          audio_path: path,
          sort_order: tracks.length + idx,
        });
        if (insertError) throw insertError;
      });

      await Promise.all(uploads);
      toast({ title: `${files.length} tracks adicionadas` });
      onTracksChange();
      onTracksAdded?.();
    } catch (e: any) {
      toast({ title: "Erro ao subir tracks", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadCount(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (track: Track) => {
    if (readOnly) return;
    try {
      await supabase.storage.from("audio").remove([track.audio_path]);
      await supabase.from("song_tracks" as any).delete().eq("id", track.id);
      toast({ title: `Track "${track.track_name}" removida` });
      onTracksChange();
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteAll = async () => {
    if (readOnly) return;
    try {
      const paths = tracks.map((t) => t.audio_path);
      if (paths.length) await supabase.storage.from("audio").remove(paths);
      for (const track of tracks) {
        await supabase.from("song_tracks" as any).delete().eq("id", track.id);
      }
      toast({ title: "Todas as tracks removidas" });
      onTracksChange();
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
    }
  };

  if (readOnly && tracks.length === 0) return null;

  // Lista agrupada iOS (componente legado, hoje sem uso na aplicação).
  const row =
    "relative flex min-h-[52px] items-center gap-3 px-4 py-1.5 before:pointer-events-none before:absolute before:left-[58px] before:right-0 before:top-0 before:border-t before:border-separator first:before:hidden";

  return (
    <div className="space-y-2">
      <p className="mx-4 flex items-center gap-1.5 text-footnote text-muted-foreground">
        <Music2 className="h-[15px] w-[15px]" strokeWidth={2.25} aria-hidden="true" />
        Tracks (faixas separadas)
      </p>
      {!readOnly && (
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length) handleUploadBatch(files);
          }}
        />
      )}

      <div className="overflow-hidden rounded-card bg-card">
        {/* Existing tracks */}
        {tracks.map((track) => (
          <div key={track.id} className={row}>
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground" aria-hidden="true">
              <Music2 className="h-[17px] w-[17px]" />
            </span>
            <span className="min-w-0 flex-1 truncate text-body text-foreground">{track.track_name}</span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => handleDelete(track)}
                aria-label={`Remover ${track.track_name}`}
                className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ios-red transition-colors active:bg-fill-tertiary"
              >
                <Trash2 className="h-[17px] w-[17px]" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}

        {/* Add track controls */}
        {!readOnly && (
          <>
            <button
              type="button"
              className={cn(row, "w-full text-left text-primary transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary disabled:pointer-events-none")}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary" aria-hidden="true">
                {uploading ? <Loader2 className="h-[17px] w-[17px] animate-spin" /> : <Upload className="h-[17px] w-[17px]" />}
              </span>
              <span className="min-w-0 flex-1 text-body">{uploading ? `Subindo ${uploadCount} tracks...` : "Importar tracks"}</span>
            </button>
            {tracks.length > 0 && (
              <button
                type="button"
                className={cn(row, "w-full justify-center text-body text-ios-red transition-colors active:bg-fill-tertiary before:left-0")}
                onClick={handleDeleteAll}
              >
                Remover todas
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
