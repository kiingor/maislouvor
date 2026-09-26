import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { CultoModal } from "@/components/CultoModal";
import { CultoDuplicateModal } from "@/components/CultoDuplicateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { ToolbarButton } from "@/components/shell/ToolbarButton";
import { DESKTOP_QUERY, useMediaQuery } from "@/contexts/ShellContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Plus, MoreHorizontal, Pencil, Trash2, Copy, Search, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "outubro" no ano corrente, "outubro de 2025" nos outros (estilo do app Calendário). */
function monthLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return capitalize(d.toLocaleDateString("pt-BR", sameYear ? { month: "long" } : { month: "long", year: "numeric" }));
}

/** Quadradinho de data (dia da semana + dia), como no app Calendário. Vermelho só para hoje. */
function DateTile({ date, today }: { date: string; today: boolean }) {
  const d = new Date(date + "T00:00:00");
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[10px] bg-fill-tertiary"
    >
      <span className={cn("text-caption2 font-semibold uppercase", today ? "text-ios-red" : "text-muted-foreground")}>
        {weekday}
      </span>
      <span className={cn("text-title3 leading-[22px] tabular-nums", today ? "text-ios-red" : "text-foreground")}>
        {d.getDate()}
      </span>
    </span>
  );
}

export default function Cultos() {
  const { currentTeam, can, loading: teamLoading } = useTeam();
  const canEdit = can("cultos", "editar");
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  const [createOpen, setCreateOpen] = useState(false);
  const [editCulto, setEditCulto] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [duplicateCulto, setDuplicateCulto] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

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

  const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  const q = search.trim().toLowerCase();
  const filteredCultos = (cultos as any[])
    .filter((c) => (q ? c.name?.toLowerCase().includes(q) : true))
    .filter((c) => (tab === "upcoming" ? c.date >= todayStr : c.date < todayStr));

  // Agrupa por mês mantendo a ordem da consulta (seções da lista agrupada).
  const sections: { key: string; label: string; items: any[] }[] = [];
  filteredCultos.forEach((c: any) => {
    const key = (c.date ?? "").slice(0, 7);
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.items.push(c);
    else sections.push({ key, label: c.date ? monthLabel(c.date) : "", items: [c] });
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("cultos").delete().eq("id", deleteId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Culto excluído" }); qc.invalidateQueries({ queryKey: ["cultos"] }); }
    setDeleteId(null);
  };

  const openCreate = () => { setEditCulto(null); setCreateOpen(true); };

  if (!teamLoading && !currentTeam) {
    return (
      <div className="animate-in-up">
        <PageHeader title="Cultos" />
        <div className="rounded-card bg-card px-6 py-10 flex flex-col items-center text-center gap-2">
          <CalendarDays className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
          <p className="text-body text-muted-foreground">Crie uma equipe primeiro nas Configurações.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in-up">
      <PageHeader
        title="Cultos"
        subtitle="Organize os repertórios dos seus cultos"
        actions={
          canEdit ? (
            <ToolbarButton
              icon={<Plus />}
              label={isDesktop ? "Novo culto" : undefined}
              aria-label="Novo culto"
              onClick={openCreate}
            />
          ) : undefined
        }
      >
        {/* Busca + segmentado */}
        {!isLoading && !teamLoading && cultos.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-muted-foreground"
                strokeWidth={2.25}
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Buscar culto..."
                aria-label="Buscar culto"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-full bg-fill-tertiary pl-9 pr-4 text-body text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ios-blue/40"
              />
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "upcoming" | "past")} className="sm:w-64 shrink-0">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upcoming">Próximos</TabsTrigger>
                <TabsTrigger value="past">Passados</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
      </PageHeader>

      {isLoading || teamLoading ? (
        <div className="rounded-card bg-card overflow-hidden" aria-busy="true" aria-label="Carregando cultos">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="relative flex items-center gap-3 min-h-[64px] px-4 py-2.5 before:absolute before:top-0 before:right-0 before:left-[72px] before:border-t before:border-border first:before:hidden"
            >
              <div className="h-11 w-11 rounded-[10px] bg-fill-tertiary animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/5 rounded-full bg-fill-tertiary animate-pulse" />
                <div className="h-3 w-1/4 rounded-full bg-fill-quaternary animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : cultos.length === 0 ? (
        <div className="rounded-card bg-card px-6 py-10 flex flex-col items-center text-center gap-2">
          <CalendarDays className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
          <h2 className="text-body text-muted-foreground">Nenhum culto ainda</h2>
          <p className="text-footnote text-muted-foreground max-w-xs">
            {canEdit ? "Crie seu primeiro culto para organizar o repertório." : "Os cultos aparecerão aqui."}
          </p>
          {canEdit && (
            <Button className="mt-3 rounded-full gap-2" onClick={openCreate}>
              <Plus className="h-[17px] w-[17px]" /> Criar culto
            </Button>
          )}
        </div>
      ) : filteredCultos.length === 0 ? (
        <div className="rounded-card bg-card px-6 py-10 flex flex-col items-center text-center gap-2">
          {search ? (
            <Search className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
          ) : (
            <CalendarDays className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
          )}
          <p className="text-body text-muted-foreground">
            {search
              ? "Nenhum culto encontrado para essa busca."
              : tab === "upcoming"
              ? "Nenhum culto próximo."
              : "Nenhum culto passado."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.key} aria-label={section.label}>
              <h2 className="text-title3 text-foreground mx-1 mb-2">{section.label}</h2>
              <ul className="rounded-card bg-card overflow-hidden">
                {section.items.map((c: any) => {
                  const isToday = c.date === todayStr;
                  const fullDate = new Date(c.date + "T00:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <li
                      key={c.id}
                      className="relative flex items-center before:absolute before:top-0 before:right-0 before:left-[72px] before:border-t before:border-border first:before:hidden"
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/app/cultos/${c.id}`)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-3 min-h-[64px] py-2.5 pl-4 text-left transition-colors active:bg-grouped-tertiary",
                          canEdit ? "pr-1" : "pr-4",
                        )}
                      >
                        <DateTile date={c.date} today={isToday} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-headline text-foreground truncate">{c.name}</span>
                          <span className="sr-only">{fullDate}</span>
                          {c.description && (
                            <span className="text-footnote text-muted-foreground line-clamp-1">{c.description}</span>
                          )}
                        </span>
                        {!canEdit && (
                          <ChevronRight className="h-[14px] w-[14px] shrink-0 text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
                        )}
                      </button>
                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              aria-label={`Ações de ${c.name}`}
                              className="mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-fill-tertiary hover:bg-fill-quaternary"
                            >
                              <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditCulto(c); setCreateOpen(true); }}>
                              <Pencil /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDuplicateCulto(c); }}>
                              <Copy /> Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-ios-red focus:text-ios-red"
                              onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}
                            >
                              <Trash2 /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <CultoModal open={createOpen} onOpenChange={setCreateOpen} editCulto={editCulto} />
      <CultoDuplicateModal open={!!duplicateCulto} onOpenChange={(o) => !o && setDuplicateCulto(null)} sourceCulto={duplicateCulto} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir culto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-ios-red text-white hover:bg-ios-red/90" onClick={handleDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
