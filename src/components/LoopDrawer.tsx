import type { ReactNode } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { Drawer, DrawerPortal, DrawerOverlay, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";

interface LoopDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  children: ReactNode;
}

export function LoopDrawer({ open, onOpenChange, isDark, children }: LoopDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} handleOnly>
      <DrawerPortal>
        <DrawerOverlay />
        {/* Folha iOS flutuante (raio 38, puxador 36×5). Fundo opaco e SEM desfoque: o palco pode
            estar rolando por baixo, e o blur seria recalculado a cada quadro. --popover = #1C1C1E no
            escuro, sem a troca de --card que a folha faz para as células. */}
        <DrawerPrimitive.Content
          className={`fixed inset-x-2 bottom-2 z-50 mx-auto flex h-[88dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-24px)] max-w-lg flex-col overflow-hidden rounded-sheet bg-[var(--sheet-bg)] [--sheet-bg:hsl(var(--background))] dark:[--sheet-bg:hsl(var(--popover))] pb-[max(env(safe-area-inset-bottom),8px)] text-foreground shadow-[0_-10px_40px_rgba(0,0,0,0.12)] outline-none [--grouped-tertiary:var(--card)] dark:[--card:240_3%_17%] ${isDark ? "dark" : ""}`}
          style={{ touchAction: "pan-y" }}
        >
          <div className="flex shrink-0 justify-center pb-0.5 pt-1.5">
            <DrawerPrimitive.Handle
              className="!h-[5px] !w-9 rounded-full !bg-label-tertiary !opacity-100"
              style={{ touchAction: "none" }}
              role="button"
              tabIndex={0}
              aria-hidden={false}
              aria-label="Fechar lista de loops"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenChange(false);
                }
              }}
            />
          </div>
          <DrawerTitle className="sr-only">Modo ensaio</DrawerTitle>
          <DrawerDescription className="sr-only">Role a lista para ver seus loops. Use a alça no topo para fechar.</DrawerDescription>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-vaul-no-drag>
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    </Drawer>
  );
}
