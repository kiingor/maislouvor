import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { attachmentQueryKey } from "@/lib/songAudioAttachments";

export function useSongAudioAttachments(songId: string, enabled = true) {
  return useQuery({
    queryKey: attachmentQueryKey(songId),
    queryFn: async () => {
      const { data, error } = await supabase.from("song_audio_attachments")
        .select("*").eq("song_id", songId).order("created_at").order("id");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!songId && enabled,
    refetchInterval: (query) => query.state.data?.some((item) => ["queued", "processing"].includes(item.status)) ? 4000 : false,
  });
}
