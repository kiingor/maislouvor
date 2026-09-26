import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { cn } from "@/lib/utils";

/*
 * Alerta iOS 27 (HIG > Alerts): centralizado, 300pt, raio 34, material espesso,
 * título Headline e mensagem Footnote centralizados, botões cápsula lado a lado
 * (três ou mais empilham). Use para confirmar ações destrutivas.
 */

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-[var(--scrim)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-200",
      className,
    )}
    {...props}
    ref={ref}
  />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

/**
 * Reduzir transparência / Aumentar contraste (spec §7): material opaco e sem desfoque.
 * A cor do alerta é pintada sobre `--background` opaco, então vale nos dois temas.
 */
const opaqueAlertMaterial = cn(
  "contrast-more:bg-background contrast-more:bg-[linear-gradient(var(--sheet-bg),var(--sheet-bg))] contrast-more:backdrop-filter-none",
  "[@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:bg-[linear-gradient(var(--sheet-bg),var(--sheet-bg))] [@media(prefers-reduced-transparency:reduce)]:backdrop-filter-none",
);

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-[300px] max-w-[calc(100vw-48px)] max-h-[calc(100dvh-48px)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto",
        "rounded-[34px] bg-[var(--sheet-bg)] p-5 text-foreground shadow-[0_20px_60px_-12px_rgba(0,0,0,0.35)] outline-none backdrop-blur-[30px] backdrop-saturate-[1.8]",
        opaqueAlertMaterial,
        "data-[state=open]:animate-[ios-alert-in_320ms_cubic-bezier(0.2,0.9,0.3,1)]",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-1/2",
        "motion-reduce:!animate-none",
        className,
      )}
      {...props}
    />
  </AlertDialogPortal>
));
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1 px-1 pt-1 text-center", className)} {...props} />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // Dois botões lado a lado (Cancelar à esquerda); três ou mais empilham com Cancelar embaixo.
      "flex gap-2 [&>*]:min-w-0 [&>*]:flex-1 has-[>:nth-child(3)]:flex-col-reverse",
      className,
    )}
    {...props}
  />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn("text-headline text-foreground", className)} {...props} />
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={cn("text-footnote text-foreground", className)} {...props} />
));
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;

const alertButton =
  "inline-flex h-11 min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-body transition-[transform,background-color,opacity] duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[18px] [&_svg]:shrink-0";

/** Ação preferida: cápsula proeminente. Destrutiva: passe classes `destructive` (fica vermelha). */
const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(alertButton, "bg-prominent font-semibold text-prominent-foreground", className)}
    {...props}
  />
));
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(alertButton, "bg-fill-secondary font-medium text-foreground active:bg-fill", className)}
    {...props}
  />
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
