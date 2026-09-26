import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Distância do topo, definida por breakpoint na classe do Toaster (`--ml-toast-top`). */
const TOP_OFFSET = "var(--ml-toast-top)";

/**
 * Banner iOS 27 (mesmo visual do Toaster do Radix): vidro espesso quase opaco no topo,
 * centralizado, título Subhead semibold e descrição Footnote. Erro em vermelho no símbolo e no título.
 * `unstyled` desliga o tema do sonner; o posicionamento e o empilhamento continuam dele.
 * No celular (barra superior visível, < lg) o banner fica logo abaixo da barra (44pt + 8),
 * para Voltar/Menu e as ações continuarem ao alcance.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group [--ml-toast-top:calc(max(env(safe-area-inset-top),12px)+52px)] lg:[--ml-toast-top:max(env(safe-area-inset-top),12px)]"
      position="top-center"
      offset={{ top: TOP_OFFSET }}
      mobileOffset={{ top: TOP_OFFSET, left: "16px", right: "16px" }}
      toastOptions={{
        unstyled: true,
        classNames: {
          // `absolute` mantém o empilhamento do sonner (o vidro define position: relative).
          toast:
            "group toast absolute flex w-[var(--width)] items-center gap-3 rounded-[22px] px-4 py-3 text-foreground liquid-glass-thick [--lg-thick-fill:hsl(var(--card)/0.94)] dark:[--lg-thick-fill:hsl(var(--grouped-tertiary)/0.94)]",
          content: "relative z-[4] grid min-w-0 flex-1 gap-0.5",
          title: "text-subhead font-semibold",
          description: "text-footnote text-muted-foreground",
          icon: "relative z-[4] flex size-[22px] shrink-0 items-center justify-center [&>svg]:size-[22px]",
          // Cápsulas compactas de 36pt e ✕ de 24pt, todos com área de toque de 44pt.
          actionButton:
            "relative z-[4] inline-flex h-9 shrink-0 items-center rounded-full bg-prominent px-3.5 text-subhead font-semibold text-prominent-foreground after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
          cancelButton:
            "relative z-[4] inline-flex h-9 shrink-0 items-center rounded-full bg-fill-secondary px-3.5 text-subhead font-medium text-foreground after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
          closeButton:
            "absolute right-2 top-2 z-[4] grid size-6 place-items-center rounded-full bg-fill-tertiary text-muted-foreground after:absolute after:-inset-2.5 after:content-['']",
          error: "[&_[data-icon]]:text-ios-red [&_[data-title]]:text-ios-red",
          success: "[&_[data-icon]]:text-ios-green",
          warning: "[&_[data-icon]]:text-ios-orange",
          info: "[&_[data-icon]]:text-ios-blue",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
