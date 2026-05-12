import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Trash2, Upload, Loader2, Music2 } from "lucide-react";

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
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUploadBatch = async (files: FileList) => {
    if (!files.length || !teamId || !songId) return;
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

  return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
        <Music2 className="h-3.5 w-3.5" />
        Tracks (Faixas separadas)
      </label>

      {/* Existing tracks */}
      {tracks.length > 0 && (
        <div className="space-y-1.5">
          {tracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/30 border border-border/50"
            >
              <Music2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium flex-1 truncate">{track.track_name}</span>
              {!readOnly && (
                <button
                  onClick={() => handleDelete(track)}
                  className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add track controls */}
      {!readOnly && (
        <div className="space-y-2">
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

          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 w-full"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Subindo {uploadCount} tracks...</>
            ) : (
              <><Upload className="h-3.5 w-3.5" /> Importar Tracks</>
            )}
          </Button>

          {tracks.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl gap-1.5 w-full text-destructive hover:text-destructive"
              onClick={handleDeleteAll}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover todas
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
