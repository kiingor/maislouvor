import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Music } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { cn } from "@/lib/utils";

interface SongCardProps {
  song: {
    id: string;
    title: string;
    artist?: string | null;
    key_current?: string | null;
    cover_path?: string | null;
    tags?: string[] | null;
    theme?: string | null;
  };
  index: number;
  onClick?: () => void;
  repertorios?: string[];
  actions?: React.ReactNode;
}

export function SongCard({ song, index, onClick, repertorios, actions }: SongCardProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!song.cover_path) return;
    supabase.storage.from("covers").createSignedUrl(song.cover_path, 3600).then(({ data }) => {
      if (data?.signedUrl) setCoverUrl(data.signedUrl);
    });
  }, [song.cover_path]);

  return (
    <GlassCard
      className={cn("p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover-lift", onClick && "cursor-pointer")}
      onClick={onClick}
    >
      <span className="text-xs font-medium text-muted-foreground w-5 sm:w-6 text-center shrink-0">{index + 1}</span>
      <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl overflow-hidden bg-accent flex items-center justify-center shrink-0">
        {coverUrl ? (
          <img src={coverUrl} alt={song.title} className="w-full h-full object-cover" />
        ) : (
          <Music className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium block truncate">{song.title}</span>
        {song.artist && (
          <span className="text-xs text-muted-foreground block truncate">{song.artist}</span>
        )}
        {((song.tags && song.tags.length > 0) || song.theme || (repertorios && repertorios.length > 0)) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {repertorios?.map((name, i) => (
              <span key={`rep-${i}`} className="text-[10px] font-medium bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full">
                {name}
              </span>
            ))}
            {song.theme && (
              <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {song.theme}
              </span>
            )}
            {song.tags?.map((tag, i) => (
              <span key={i} className="text-[10px] font-medium bg-accent text-muted-foreground px-1.5 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      {song.key_current && (
        <span className="text-xs font-medium px-2 py-1 rounded-lg bg-accent text-muted-foreground shrink-0">
          {song.key_current}
        </span>
      )}
      {actions}
    </GlassCard>
  );
}
