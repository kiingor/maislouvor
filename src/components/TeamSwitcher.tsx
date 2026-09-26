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
import { Users, ChevronsUpDown, ChevronDown, Plus, Check, Ticket, Clock } from "lucide-react";
import { ToolbarButton } from "@/components/shell/ToolbarButton";
import { cn } from "@/lib/utils";

/**
 * Seletor de equipe. `toolbar` = cápsula de vidro da barra superior (kit iOS 27 > Toolbars),
 * abre um menu suspenso ancorado (HIG > Pull-down buttons). Padrão = linha da barra lateral.
 */
export function TeamSwitcher({ compact = false, variant }: { compact?: boolean; variant?: "toolbar" }) {
  const { currentTeam, teams, pendingTeams, switchTeam } = useTeam();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === "toolbar" ? (
            <ToolbarButton
              aria-label={`Equipe: ${currentTeam?.name ?? "selecionar"}`}
              icon={<Users strokeWidth={2.2} />}
              label={currentTeam?.name ?? "Selecionar equipe"}
              // Abaixo de 380pt a cápsula cede espaço ao título inline da barra.
              className="max-w-[min(58vw,230px)] max-[379px]:max-w-[42vw]"
            >
              <ChevronDown className="relative z-[4] h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.6} aria-hidden="true" />
            </ToolbarButton>
          ) : (
          <button
            className={cn(
              "flex items-center gap-2 rounded-[12px] bg-fill-tertiary hover:bg-fill-secondary transition-colors text-left",
              compact ? "px-2.5 py-1.5 max-w-[60vw] min-h-11" : "w-full px-3 py-2 min-h-11"
            )}
          >
            <div className="h-7 w-7 shrink-0 rounded-[8px] bg-fill-tertiary flex items-center justify-center">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              {!compact && (
                <span className="block text-caption1 text-muted-foreground leading-none mb-0.5">
                  Equipe
                </span>
              )}
              <span className="block text-subhead font-semibold truncate">
                {currentTeam?.name ?? "Selecionar equipe"}
              </span>
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={variant === "toolbar" ? "end" : "start"} sideOffset={8} className="w-64 max-w-[calc(100vw-1rem)]">
          <DropdownMenuLabel>Suas equipes</DropdownMenuLabel>
          {teams.length === 0 && (
            <div className="px-4 py-2 text-footnote text-muted-foreground">Nenhuma equipe ainda</div>
          )}
          {teams.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => switchTeam(t.id)}
              className="gap-2 cursor-pointer"
            >
              <Check className={cn("h-4 w-4 shrink-0", t.id === currentTeam?.id ? "opacity-100" : "opacity-0")} />
              <span className="flex-1 truncate">{t.name}</span>
              <span className="text-footnote text-muted-foreground">
                {t.role === "admin" ? "Líder" : t.role === "editor" ? "Editor" : "Membro"}
              </span>
            </DropdownMenuItem>
          ))}
          {pendingTeams.map((p) => (
            <DropdownMenuItem key={p.id} disabled className="gap-2 data-[disabled]:opacity-70 focus:opacity-70">
              <Clock className="h-4 w-4 shrink-0 text-ios-orange" />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-footnote text-ios-orange whitespace-nowrap">Pendente</span>
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
