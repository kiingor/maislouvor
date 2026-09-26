import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Bell, CalendarCheck, Check, ChevronLeft, LogOut, Megaphone, Menu, Monitor, Moon, Sun } from "lucide-react";
import { APPEARANCE_OPTIONS, useAppearance, type Appearance } from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { DESKTOP_QUERY, useMediaQuery, useShell } from "@/contexts/ShellContext";
import { useTeam } from "@/contexts/TeamContext";
import { ToolbarButton } from "@/components/shell/ToolbarButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TopBarProps {
  onSendNotice: () => void;
  onLogout: () => void;
}

/**
 * Barra superior do celular (kit iOS 27 > Toolbar – Top – iPhone):
 * Voltar ou menu à esquerda, título inline alinhado à esquerda quando o título grande
 * sai de vista, e as ações da tela (via PageHeader) à direita.
 */
export function TopBar({ onSendNotice, onLogout }: TopBarProps) {
  const shell = useShell();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const { can, teams, currentTeam, switchTeam } = useTeam();
  const [notifOpen, setNotifOpen] = useState(false);
  const [appearance, setAppearance] = useAppearance();
  const openNotifOnClose = useRef(false);
  if (!shell || shell.hideTopBar) return null;
  const { back, inlineTitle, collapsed, setTrailingSlot } = shell;

  // Como na produção (equipe no cabeçalho e sino na gaveta de toda tela), equipe e
  // notificações seguem alcançáveis pelo menu. No Início elas já estão na barra.
  const withTeamAndBell = !isDesktop && pathname !== "/app/home";

  const menu = (unreadCount: number) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToolbarButton aria-label="Menu" icon={<Menu strokeWidth={2.2} />} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-64"
        // O popover de notificações abre só depois que o menu fecha, para o foco que volta
        // ao botão não fechá-lo na mesma hora.
        onCloseAutoFocus={(e) => {
          if (!openNotifOnClose.current) return;
          openNotifOnClose.current = false;
          e.preventDefault();
          setNotifOpen(true);
        }}
      >
        {withTeamAndBell && teams.length > 0 && (
          <>
            <DropdownMenuLabel>Equipe</DropdownMenuLabel>
            {teams.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => switchTeam(t.id)} className="gap-2">
                <Check className={cn("h-4 w-4 shrink-0", t.id === currentTeam?.id ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 truncate">{t.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        {withTeamAndBell && (
          <DropdownMenuItem onClick={() => { openNotifOnClose.current = true; }}>
            <Bell />
            <span className="flex-1">Notificações</span>
            {unreadCount > 0 && (
              <span
                className="h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full bg-ios-red text-white text-[11px] font-semibold leading-none"
                aria-label={`${unreadCount} não lidas`}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => navigate("/app/disponibilidades")}>
          <CalendarCheck />
          Disponibilidades
        </DropdownMenuItem>
        {can("cultos", "editar") && (
          <DropdownMenuItem onClick={() => navigate("/app/relatorios")}>
            <BarChart3 />
            Relatórios
          </DropdownMenuItem>
        )}
        {can("avisos", "editar") && (
          <DropdownMenuItem onClick={onSendNotice}>
            <Megaphone />
            Enviar aviso
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {/* Aparência (Automático · Claro · Escuro) — também em Usuário > Meu usuário. */}
        <DropdownMenuLabel>Aparência</DropdownMenuLabel>
        <DropdownMenuRadioGroup aria-label="Aparência" value={appearance} onValueChange={(v) => setAppearance(v as Appearance)}>
          {APPEARANCE_OPTIONS.map((o) => {
            const Icon = o.value === "light" ? Sun : o.value === "dark" ? Moon : Monitor;
            return (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                <Icon />
                {o.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-ios-red focus:text-ios-red">
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div
      data-shell-topbar
      className="absolute z-40 inset-x-0 top-0 lg:hidden pointer-events-none px-4 min-[430px]:px-5 pt-[max(env(safe-area-inset-top),12px)]"
    >
      <div className="h-11 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <div className="pointer-events-auto">
          {back ? (
            <ToolbarButton
              aria-label="Voltar"
              icon={<ChevronLeft strokeWidth={2.4} />}
              onClick={() => (back === true ? navigate(-1) : navigate(back))}
            />
          ) : withTeamAndBell ? (
            // O popover de notificações ancora no botão de menu.
            <NotificationBell open={notifOpen} onOpenChange={setNotifOpen} anchor={menu} />
          ) : (
            menu(0)
          )}
        </div>
        <p
          aria-hidden="true"
          className={cn("inline-title text-headline truncate pl-1 text-foreground", collapsed && "on")}
        >
          {inlineTitle}
        </p>
        <div ref={setTrailingSlot} className="pointer-events-auto flex items-center justify-end gap-2 min-w-0" />
      </div>
    </div>
  );
}
