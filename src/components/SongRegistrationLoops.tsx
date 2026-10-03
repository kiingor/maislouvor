import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LoopPanel } from "@/components/LoopPanel";
import { useLoopSequence } from "@/hooks/useLoopSequence";
import type { LoopRange } from "@/lib/loopTime";
import { useToast } from "@/hooks/use-toast";

/** Reuses the rehearsal loop editor and its real persistence with the original recording. */
export function SongRegistrationLoops({
  songId,
  audioPath,
  onClose,
}: {
  songId: string;
  audioPath: string;
  onClose: () => void;
}) {
  const player = useRef<HTMLAudioElement>(null),
    preview = useRef<LoopRange | null>(null);
  const [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [playing, setPlaying] = useState(false),
    [previewing, setPreviewing] = useState(false),
    [rate, setRate] = useState(1);
  const loops = useLoopSequence(songId);
  const { toast } = useToast();
  const audio = useQuery({
    queryKey: ["song-loop-audio", audioPath],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("audio")
        .createSignedUrl(audioPath, 3600);
      if (error) throw error;
      return data?.signedUrl;
    },
  });
  useEffect(() => {
    const element = player.current;
    return () => {
      element?.pause();
    };
  }, []);
  const seek = (next: number) => {
    if (player.current) player.current.currentTime = next;
    setTime(next);
  };
  const play = () => {
    const element = player.current;
    if (element?.src)
      void element
        .play()
        .catch(() =>
          toast({
            title: "Não foi possível reproduzir o áudio",
            variant: "destructive",
          })
        );
  };
  const onPreview = (range: LoopRange | null) => {
    preview.current = range;
    setPreviewing(!!range);
    if (range) {
      loops.clearLoops();
      seek(range.start_time);
      play();
    } else player.current?.pause();
  };
  return (
    <div className="flex h-[min(640px,75dvh)] min-h-0 flex-col">
      <audio
        ref={player}
        src={audio.data || undefined}
        preload="metadata"
        onLoadedMetadata={() => setDuration(player.current?.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() =>
          toast({
            title: "Áudio indisponível. Feche e tente novamente.",
            variant: "destructive",
          })
        }
        onTimeUpdate={() => {
          const current = player.current?.currentTime || 0;
          setTime(current);
          if (preview.current && current >= preview.current.end_time) {
            seek(preview.current.start_time);
            return;
          }
          const next = loops.advanceLoop(current);
          if (next !== null) seek(next);
        }}
      />
      {audio.isError && (
        <p role="alert" className="p-4 text-sm text-destructive">
          Não foi possível carregar a gravação.
        </p>
      )}
      <LoopPanel
        songId={songId}
        currentTime={time}
        duration={duration}
        isPlaying={playing}
        isPreviewing={previewing}
        onSeek={seek}
        onTogglePlayback={() => (playing ? player.current?.pause() : play())}
        onPreview={onPreview}
        selectedLoops={loops.selectedLoops}
        activeLoopId={loops.activeLoop?.id || null}
        currentRepetition={loops.currentRepetition}
        playbackRate={rate}
        onSelectLoop={(loop) => {
          preview.current = null;
          setPreviewing(false);
          if (!loop) {
            loops.clearLoops();
            return;
          }
          const next = loops.toggleLoop(loop);
          if (next !== null) seek(next);
        }}
        onRemoveLoop={(id) => {
          const next = loops.removeLoop(id);
          if (next !== null) seek(next);
        }}
        onPlaybackRateChange={(next) => {
          setRate(next);
          if (player.current) player.current.playbackRate = next;
        }}
        isDark={document.documentElement.classList.contains("dark")}
        onClose={onClose}
      />
    </div>
  );
}
