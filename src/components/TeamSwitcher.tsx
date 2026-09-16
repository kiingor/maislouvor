import { useState } from "react";
import { useTeam } from "@/contexts/TeamContext";
import { CreateTeamModal } from "@/components/CreateTeamModal";
import { JoinTeamModal } from "@/components/JoinTeamModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, ChevronsUpDown, Plus, Check, Ticket, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function TeamSwitcher({ compact = false }: { compact?: boolean }) {
  const { currentTeam, teams, pendingTeams, switchTeam } = useTeam();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 rounded-xl glass-subtle hover:bg-accent/60 transition-colors text-left",
              compact ? "px-2.5 py-1.5 max-w-[60vw]" : "w-full px-3 py-2"
            )}
          >
            <div className="h-7 w-7 shrink-0 rounded-lg bg-foreground/[0.06] flex items-center justify-center">
              <Users className="h-3.5 w-3.5 text-foreground/70" />
            </div>
            <div className="flex-1 min-w-0">
              {!compact && (
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-0.5">
                  Equipe
                </span>
              )}
              <span className="block text-sm font-medium truncate">
                {currentTeam?.name ?? "Selecionar equipe"}
              </span>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 max-w-[calc(100vw-1rem)]">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Suas equipes</DropdownMenuLabel>
          {teams.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma equipe ainda</div>
          )}
          {teams.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => switchTeam(t.id)}
              className="gap-2 cursor-pointer"
            >
              <Check className={cn("h-4 w-4 shrink-0", t.id === currentTeam?.id ? "opacity-100" : "opacity-0")} />
              <span className="flex-1 truncate">{t.name}</span>
              <span className="text-[10px] text-muted-foreground capitalize">
                {t.role === "admin" ? "Líder" : t.role === "editor" ? "Editor" : "Membro"}
              </span>
            </DropdownMenuItem>
          ))}
          {pendingTeams.map((p) => (
            <DropdownMenuItem key={p.id} disabled className="gap-2 opacity-70 focus:opacity-70">
              <Clock className="h-4 w-4 shrink-0 text-yellow-500" />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-[10px] text-yellow-500 whitespace-nowrap">Pendente</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setJoinOpen(true)} className="gap-2 cursor-pointer">
            <Ticket className="h-4 w-4" />
            Entrar com código
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCreateOpen(true)} className="gap-2 cursor-pointer">
            <Plus className="h-4 w-4" />
            Criar equipe
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateTeamModal open={createOpen} onOpenChange={setCreateOpen} />
      <JoinTeamModal open={joinOpen} onOpenChange={setJoinOpen} />
    </>
  );
}
