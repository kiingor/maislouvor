import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Botão iOS 27 (HIG > Buttons). Cápsula, resposta ao toque por leve encolhimento.
 * - default: proeminente (bg-prominent) — a ação principal da tela.
 * - secondary: cinza (fill secundário).
 * - outline: cinza com texto tintado (estilo "bordered" do iOS).
 * - ghost: só texto tintado (estilo "plain").
 * - destructive: vermelho do sistema.
 * - link: texto tintado sublinhado ao passar o ponteiro.
 * Foco: o anel de teclado vem do estilo global (:focus-visible, 3px ios-blue).
 * Ícones acompanham o texto (1.1em); em botões só de ícone, até 20px.
 * Alvo de toque: sm/icon estendem o alvo para 44pt com ::before. Se a tela encolher o botão
 * (ex.: h-8 w-8), deixe ≥12px entre botões vizinhos (gap-3) — senão o alvo do vizinho
 * seguinte cobre a borda visível do anterior. Prefira manter 44pt.
 */
const buttonVariants = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold",
    "transition-[transform,background-color,color,opacity] duration-200 ease-out active:scale-[0.97]",
    "motion-reduce:transition-none motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-40",
    "[-webkit-tap-highlight-color:transparent] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-[1.1em]",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-prominent text-prominent-foreground hover:bg-prominent/90",
        destructive: "bg-ios-red text-white hover:bg-ios-red/90",
        outline: "bg-fill-tertiary text-primary hover:bg-fill-secondary",
        secondary: "bg-fill-secondary text-foreground hover:bg-fill",
        ghost: "text-primary hover:bg-fill-tertiary",
        link: "font-medium text-primary underline-offset-4 hover:underline active:opacity-60",
      },
      size: {
        default: "h-11 px-5 text-body",
        // Compacto (barras densas): 36px visíveis, alvo de toque de 44px.
        sm: "h-9 px-4 text-subhead before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
        lg: "h-[50px] px-6 text-body",
        // Círculo de 44pt. Se a tela reduzir o tamanho, o alvo continua 44×44.
        icon: "h-11 w-11 text-body [&_svg]:size-[min(20px,50%)] before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
