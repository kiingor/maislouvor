import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      // Banner iOS no topo, centralizado. Não bloqueia toques quando vazio. No celular fica logo
      // abaixo da barra superior (44pt + 8), para Voltar/Menu e as ações continuarem ao alcance.
      "pointer-events-none fixed inset-x-0 top-0 z-[100] mx-auto flex max-h-screen w-full max-w-[392px] flex-col gap-2 px-4 outline-none",
      "pt-[calc(max(env(safe-area-inset-top),12px)+52px)] lg:pt-[max(env(safe-area-inset-top),12px)]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  cn(
    "group pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-[22px] py-3 pl-4 pr-4 text-foreground liquid-glass-thick [@media(hover:hover)]:pr-10",
    // Vidro espesso quase opaco: o banner passa sobre a barra e sobre outros banners (sem vidro sobre vidro).
    "[--lg-thick-fill:hsl(var(--card)/0.94)] dark:[--lg-thick-fill:hsl(var(--grouped-tertiary)/0.94)]",
    "transition-transform data-[swipe=cancel]:translate-y-0 data-[swipe=end]:translate-y-[var(--radix-toast-swipe-end-y)] data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)] data-[swipe=move]:transition-none",
    "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-full data-[state=open]:duration-500",
    "data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-full motion-reduce:!animate-none",
  ),
  {
    variants: {
      variant: {
        default: "",
        // Erro: símbolo e título em vermelho, sem fundo vermelho (HIG > Color).
        destructive: "destructive group",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />;
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      // Cápsula compacta de 36pt com área de toque de 44pt.
      "relative z-[4] inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-fill-secondary px-3.5 text-subhead font-semibold text-foreground transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:bg-fill disabled:pointer-events-none disabled:opacity-40 group-[.destructive]:text-ios-red",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      // Só em dispositivos com hover (no toque o banner some sozinho ou com um deslize para cima).
      "absolute right-2 top-1/2 z-[4] hidden size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity after:absolute after:-inset-2 after:content-[''] hover:bg-fill-tertiary hover:text-foreground focus:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:grid",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="size-4" strokeWidth={2.5} aria-hidden="true" />
    <span className="sr-only">Fechar</span>
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-subhead font-semibold text-foreground group-[.destructive]:text-ios-red", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description ref={ref} className={cn("text-footnote text-muted-foreground", className)} {...props} />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
