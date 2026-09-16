import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Checkbox } from "@/components/ui/checkbox";
import { ListMusic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Aloca a música em vários repertórios direto do cadastro dela.
 * Música ↔ repertório é muitos-para-muitos (tabela repertorio_songs); marcar/desmarcar
 * apenas insere/remove o vínculo — não cria nem apaga a música.
 */
export function SongRepertoriosCard({ songId, teamId, readOnly }: { songId: string; teamId: string; readOnly: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["song-repertorios", songId, teamId],
    queryFn: async () => {
      const [{ data: reps }, { data: links }] = await Promise.all([
        supabase.from("repertorios").select("id, name").eq("team_id", teamId).order("name"),
        supabase.from("repertorio_songs").select("repertorio_id").eq("song_id", songId),
      ]);
      return { reps: (reps ?? []) as { id: string; name: string }[], inSet: new Set((links ?? []).map((l: any) => l.repertorio_id)) };
    },
    enabled: !!songId && !!teamId,
  });

  const reps = data?.reps ?? [];
  const inSet = data?.inSet ?? new Set<string>();

  const toggle = async (repId: string, currentlyIn: boolean) => {
    if (currentlyIn) {
      const { error } = await supabase.from("repertorio_songs").delete().eq("song_id", songId).eq("repertorio_id", repId);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    } else {
      const { data: maxOrder } = await supabase
        .from("repertorio_songs")
        .select("sort_order")
        .eq("repertorio_id", repId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const next = ((maxOrder as any)?.sort_order ?? -1) + 1;
      const { error } = await supabase.from("repertorio_songs").insert({ repertorio_id: repId, song_id: songId, sort_order: next });
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    }
    qc.invalidateQueries({ queryKey: ["song-repertorios", songId] });
    qc.invalidateQueries({ queryKey: ["repertorio-songs", repId] });
    qc.invalidateQueries({ queryKey: ["library-songs"] });
  };

  return (
    <GlassCard className="p-6 space-y-4">
      <div className="flex items-center gap-2.5">
        <ListMusic className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">Repertórios</h3>
          <p className="text-[11px] text-muted-foreground leading-tight">Em quais repertórios esta música aparece</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">{[1, 2].map((i) => <div key={i} className="h-10 rounded-xl glass-input animate-pulse" />)}</div>
      ) : reps.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum repertório na equipe ainda. Crie um repertório para poder alocar esta música.</p>
      ) : (
        <div className="space-y-1.5">
          {reps.map((r) => {
            const checked = inSet.has(r.id);
            return (
              <label
                key={r.id}
                className={`flex items-center gap-3 rounded-xl glass-input px-3 py-2.5 ${readOnly ? "" : "cursor-pointer"}`}
              >
                <Checkbox checked={checked} disabled={readOnly} onCheckedChange={() => toggle(r.id, checked)} />
                <span className="text-sm flex-1 truncate">{r.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
