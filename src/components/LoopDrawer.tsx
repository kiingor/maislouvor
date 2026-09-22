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
        <DrawerPrimitive.Content
          className={`fixed inset-x-0 bottom-0 z-50 flex h-[90dvh] max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-t-[10px] border bg-background pb-[env(safe-area-inset-bottom)] text-foreground ${isDark ? "dark" : ""}`}
          style={{ touchAction: "pan-y" }}
        >
          <div className="flex shrink-0 justify-center py-4">
            <DrawerPrimitive.Handle
              className="h-2 w-[100px] rounded-full bg-muted"
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
