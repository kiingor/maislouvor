import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

/*
 * Folha iOS 27 por baixo do vaul (arrastar para fechar vem do próprio vaul):
 * flutuante, raio 38, material espesso, puxador 36×5. Mesmo visual do DialogContent no celular.
 */

const Drawer = ({ shouldScaleBackground = true, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay ref={ref} className={cn("fixed inset-0 z-50 bg-[var(--scrim)]", className)} {...props} />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

/**
 * Reduzir transparência / Aumentar contraste (spec §7): material opaco e sem desfoque.
 * A cor da folha é pintada sobre `--background` opaco, então vale nos dois temas.
 */
const opaqueDrawerMaterial = cn(
  "contrast-more:bg-background contrast-more:bg-[linear-gradient(var(--sheet-bg),var(--sheet-bg))] contrast-more:backdrop-filter-none",
  "[@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:bg-[linear-gradient(var(--sheet-bg),var(--sheet-bg))] [@media(prefers-reduced-transparency:reduce)]:backdrop-filter-none",
);

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-2 bottom-2 z-50 mx-auto mt-24 flex h-auto max-h-[calc(100dvh-env(safe-area-inset-top)-24px)] max-w-lg flex-col",
        "rounded-sheet bg-[var(--sheet-bg)] pb-[max(env(safe-area-inset-bottom),16px)] text-foreground shadow-[0_-10px_40px_rgba(0,0,0,0.12)] outline-none backdrop-blur-[30px] backdrop-saturate-[1.8]",
        opaqueDrawerMaterial,
        "[--grouped-tertiary:var(--card)] dark:[--card:240_3%_17%]",
        // O vaul estende o fundo da gaveta para baixo com ::after; na folha flutuante isso vira uma faixa.
        "after:!hidden",
        className,
      )}
      {...props}
    >
      <div aria-hidden="true" className="ios-grabber mb-1 shrink-0" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid min-h-11 content-center gap-0.5 px-4 pb-2 pt-2 text-center", className)} {...props} />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex flex-col gap-2 px-4 pt-4", className)} {...props} />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title ref={ref} className={cn("text-headline text-foreground", className)} {...props} />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description ref={ref} className={cn("text-footnote text-muted-foreground", className)} {...props} />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
