import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { CultoModal } from "@/components/CultoModal";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function Cultos() {
  const { currentTeam, canEdit, loading: teamLoading } = useTeam();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editCulto, setEditCulto] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: cultos = [], isLoading } = useQuery({
    queryKey: ["cultos", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("cultos")
        .select("*")
        .eq("team_id", currentTeam.id)
        .order("date", { ascending: false });
      return data ?? [];
    },
    enabled: !!currentTeam,
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("cultos").delete().eq("id", deleteId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Culto excluído" }); qc.invalidateQueries({ queryKey: ["cultos"] }); }
    setDeleteId(null);
  };

  if (!teamLoading && !currentTeam) {
    return (
      <div className="animate-in-up">
        <GlassCard className="p-12 flex flex-col items-center justify-center text-center">
          <p className="text-muted-foreground text-sm">Crie uma equipe primeiro nas Configurações.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="animate-in-up">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cultos</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize os repertórios dos seus cultos</p>
        </div>
        {canEdit && (
          <>
            <Button onClick={() => { setEditCulto(null); setCreateOpen(true); }} size="icon" className="rounded-xl sm:hidden h-9 w-9 shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
            <Button onClick={() => { setEditCulto(null); setCreateOpen(true); }} className="rounded-xl gap-2 hidden sm:inline-flex shrink-0">
              <Plus className="h-4 w-4" /> Novo culto
            </Button>
          </>
        )}
      </div>

      {isLoading || teamLoading ? (
        <div className="grid gap-3 grid-cols-1">
          {[1, 2, 3].map((i) => (
            <GlassCard key={i} className="p-5 h-20 animate-pulse" />
          ))}
        </div>
      ) : cultos.length === 0 ? (
        <GlassCard className="p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
            <CalendarDays className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">Nenhum culto ainda</h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            {canEdit ? "Crie seu primeiro culto para organizar o repertório." : "Os cultos aparecerão aqui."}
          </p>
          {canEdit && (
            <Button className="mt-6 rounded-xl gap-2" onClick={() => { setEditCulto(null); setCreateOpen(true); }}>
              <Plus className="h-4 w-4" /> Criar culto
            </Button>
          )}
        </GlassCard>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {cultos.map((c: any) => (
            <GlassCard
              key={c.id}
              className="p-4 sm:p-6 cursor-pointer hover-lift group relative"
              onClick={() => navigate(`/app/cultos/${c.id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-accent flex items-center justify-center">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm truncate">{c.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(c.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                    {c.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{c.description}</p>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditCulto(c); setCreateOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}>
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}




      <CultoModal open={createOpen} onOpenChange={setCreateOpen} editCulto={editCulto} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir culto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
