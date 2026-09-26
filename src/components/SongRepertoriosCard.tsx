import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useId } from "react";
import { Check, ListMusic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Aloca a música em vários repertórios direto do cadastro dela.
 * Música ↔ repertório é muitos-para-muitos (tabela repertorio_songs); marcar/desmarcar
 * apenas insere/remove o vínculo — não cria nem apaga a música.
 */
export function SongRepertoriosCard({ songId, teamId, readOnly }: { songId: string; teamId: string; readOnly: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const headingId = useId();

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

  // Lista agrupada iOS: toque na linha alterna; marca de seleção tintada à direita (HIG > Lists).
  const row =
    "relative flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left before:pointer-events-none before:absolute before:left-4 before:right-0 before:top-0 before:border-t before:border-separator first:before:hidden";

  return (
    <section aria-labelledby={headingId}>
      <div className="mx-1 mb-2">
        <h2 id={headingId} className="text-title3 text-foreground">
          Repertórios
          <span className="block text-subhead font-normal text-muted-foreground">Em quais repertórios esta música aparece</span>
        </h2>
      </div>

      {isLoading ? (
        <div className="overflow-hidden rounded-card bg-card" aria-busy="true">
          {[1, 2].map((i) => (
            <div key={i} className={row}>
              <div className="h-4 w-2/5 rounded-full bg-fill-tertiary animate-pulse motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      ) : reps.length === 0 ? (
        <div className="flex items-center gap-3 rounded-card bg-card px-4 py-4">
          <ListMusic className="h-7 w-7 shrink-0 text-label-tertiary" aria-hidden="true" />
          <p className="min-w-0 text-body text-muted-foreground">Nenhum repertório na equipe ainda. Crie um repertório para poder alocar esta música.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card bg-card" role="group" aria-labelledby={headingId}>
          {reps.map((r) => {
            const checked = inSet.has(r.id);
            return (
              <button
                key={r.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={readOnly}
                onClick={() => toggle(r.id, checked)}
                className={cn(row, !readOnly && "transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary", readOnly && "cursor-default")}
              >
                <span className="min-w-0 flex-1 truncate text-body text-foreground">{r.name}</span>
                <Check
                  className={cn("h-[18px] w-[18px] shrink-0 text-primary transition-opacity", checked ? "opacity-100" : "opacity-0")}
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
